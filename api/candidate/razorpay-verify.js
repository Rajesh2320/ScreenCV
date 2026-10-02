// screencv/api/candidate/razorpay-verify.js
// Verify Razorpay payment, update submissions, INSERT into candidate_payments, and trigger analysis
//
// CHANGES
//  1. Analysis is handed to waitUntil() so Vercel keeps the function alive
//     until it finishes (previously the function froze once res.json() was sent).
//  2. A failed analysis is logged as a failure and recorded in payment_incidents,
//     instead of being logged as "completed ... score: undefined".
//  3. A repeated verify call for an already-verified payment returns success
//     without inserting a second payment row or running the analysis again.
//  4. The order must belong to the submission it is being applied to.
//  5. Signature comparison is timing-safe.

const crypto = require("crypto");
const Razorpay = require("razorpay");
const { waitUntil } = require("@vercel/functions");
const { supabase } = require("../../lib/supabase-client");
const { analyzeResumeVsJob } = require("./analyze");
const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
} = require("../../lib/constants");

// Column on candidate_submissions that holds the Razorpay order id.
// ASSUMPTION: adjust if your column is named differently.
const ORDER_ID_COLUMN = "razorpay_order_id";

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

function signaturesMatch(expected, received) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(received), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Runs the analysis and never rejects, so it is safe to pass to waitUntil().
async function runAnalysis(dbSubmission, paymentData) {
  const startedAt = Date.now();
  let failure = null;

  try {
    const result = await analyzeResumeVsJob(
      dbSubmission.id,
      dbSubmission.resume_text,
      dbSubmission.job_description,
      dbSubmission.job_title,
      dbSubmission.email,
      dbSubmission.feedback_token,
      paymentData
    );

    // analyzeResumeVsJob resolves (rather than throws) on failure, so a
    // missing score is the signal that the analysis did not succeed.
    if (!result || result.score === undefined || result.score === null) {
      failure = (result && (result.error || result.message)) || "Analysis returned no score";
    } else {
      console.log(
        `[Verify] ✅ Analysis pipeline completed for submission ${dbSubmission.id}, ` +
          `score: ${result.score} (${Date.now() - startedAt}ms)`
      );
    }
  } catch (err) {
    failure = (err && err.message) || String(err);
  }

  if (!failure) return;

  console.error(
    `[Verify] ❌ Analysis pipeline FAILED for submission ${dbSubmission.id} ` +
      `after ${Date.now() - startedAt}ms: ${failure}`
  );

  // The customer has paid but has no analysis: record it so it can be re-run.
  try {
    await supabase.from("payment_incidents").insert({
      incident_type: "ANALYSIS_FAILED",
      submission_id: dbSubmission.id,
      razorpay_payment_id: paymentData.paymentId,
      razorpay_order_id: paymentData.orderId,
      email: dbSubmission.email,
      amount: paymentData.amount,
      description: `Payment captured but analysis failed: ${failure}`,
      status: "unresolved",
    });
  } catch (incidentErr) {
    console.error("[Verify] Could not record ANALYSIS_FAILED incident:", incidentErr);
  }
}

// Verify payment from Razorpay
async function verifyPayment(req, res) {
  try {
    const { paymentId, orderId, signature, submissionId } = req.body;

    if (!paymentId || !orderId || !signature || !submissionId) {
      return res.status(400).json({
        success: false,
        error: "Missing payment details",
      });
    }

    console.log(`[Verify] Verifying payment ${paymentId} for order ${orderId}...`);

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(orderId + "|" + paymentId)
      .digest("hex");

    if (!signaturesMatch(expectedSignature, signature)) {
      console.error("[Verify] ❌ Invalid signature!");
      return res.status(400).json({
        success: false,
        error: "Invalid payment signature",
      });
    }

    console.log("[Verify] ✅ Signature verified");

    // Fetch payment details from Razorpay
    const razorpayPayment = await razorpay.payments.fetch(paymentId);

    console.log(`[Verify] Razorpay status: ${razorpayPayment.status}`);

    // Fetch submission by submissionId
    const { data: dbSubmission, error: fetchError } = await supabase
      .from("candidate_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (fetchError || !dbSubmission) {
      console.error("[Verify] ❌ Submission not found:", fetchError);

      // Log incident
      await supabase.from("payment_incidents").insert({
        incident_type: "SUBMISSION_NOT_FOUND",
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
        email: razorpayPayment.email,
        amount: razorpayPayment.amount / 100,
        razorpay_status: razorpayPayment.status,
        db_status: "NOT_FOUND",
        description: `Submission ${submissionId} not found in DB`,
        status: "unresolved",
      });

      return res.status(404).json({
        success: false,
        error: "Submission not found",
        action: "CONTACT_SUPPORT",
      });
    }

    // The signature proves the payment belongs to the order. This proves the
    // order belongs to the submission, so one payment cannot unlock another.
    if (!(ORDER_ID_COLUMN in dbSubmission)) {
      console.warn(
        `[Verify] ⚠️ Column "${ORDER_ID_COLUMN}" not found on candidate_submissions - ` +
          "order/submission match check SKIPPED. Fix ORDER_ID_COLUMN."
      );
    } else if (dbSubmission[ORDER_ID_COLUMN] !== orderId) {
      console.error(
        `[Verify] ❌ Order ${orderId} does not belong to submission ${dbSubmission.id}`
      );
      return res.status(400).json({
        success: false,
        error: "Payment does not match this submission",
        action: "CONTACT_SUPPORT",
      });
    }

    // Already verified (double click, page refresh, client retry):
    // do not insert a second payment row or run the analysis again.
    if (
      dbSubmission.payment_status === "captured" &&
      dbSubmission.razorpay_payment_id === paymentId
    ) {
      console.log(`[Verify] ℹ️ Payment ${paymentId} already verified, skipping`);
      return res.json({
        success: true,
        verified: true,
        status: "CAPTURED",
        message: "Payment already verified.",
        submissionId: dbSubmission.id,
        action: "PROCEED_WITH_ANALYSIS",
      });
    }

    // Scenario 1: Payment captured in Razorpay
    if (razorpayPayment.status === "captured") {
      const amountINR = razorpayPayment.amount / 100;

      // UPDATE candidate_submissions with payment info
      const { error: updateError } = await supabase
        .from("candidate_submissions")
        .update({
          razorpay_payment_id: paymentId,
          payment_status: "captured",
          payment_date: new Date().toISOString(),
          payment_amount: amountINR,
        })
        .eq("id", dbSubmission.id);

      if (updateError) {
        console.error("[Verify] DB update error:", updateError);

        // Log incident
        await supabase.from("payment_incidents").insert({
          incident_type: "DB_UPDATE_ERROR",
          submission_id: dbSubmission.id,
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          email: dbSubmission.email,
          amount: amountINR,
          razorpay_status: razorpayPayment.status,
          db_status: "UPDATE_FAILED",
          description: `Failed to update payment status: ${updateError.message}`,
          status: "unresolved",
        });

        return res.status(500).json({
          success: false,
          error: "Failed to confirm payment",
          action: "CONTACT_SUPPORT",
        });
      }

      console.log(`[Verify] ✅ candidate_submissions updated for ${dbSubmission.id}`);

      // INSERT INTO candidate_payments table
      const { error: paymentInsertError } = await supabase
        .from("candidate_payments")
        .insert({
          submission_id: dbSubmission.id,
          email: dbSubmission.email,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          amount_inr: amountINR,
          status: "captured",
          payment_method: razorpayPayment.method || "razorpay",
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });

      if (paymentInsertError) {
        console.error("[Verify] Payment record insert error:", paymentInsertError);

        // Log incident
        await supabase.from("payment_incidents").insert({
          incident_type: "PAYMENT_RECORD_INSERT_ERROR",
          submission_id: dbSubmission.id,
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          email: dbSubmission.email,
          amount: amountINR,
          description: `Failed to insert payment record: ${paymentInsertError.message}`,
          status: "unresolved",
        });

        // Don't fail the response - payment is confirmed, just record insert failed
        console.warn("[Verify] ⚠️ Payment record insert failed, but continuing...");
      } else {
        console.log(`[Verify] ✅ candidate_payments record inserted for submission ${dbSubmission.id}`);
      }

      console.log(`[Verify] ✅ Payment confirmed for submission ${dbSubmission.id}`);

      // TRIGGER ANALYSIS
      // Still non-blocking for the user, but waitUntil() tells Vercel to keep
      // this function running until the promise settles. A bare un-awaited
      // promise is frozen as soon as the response is sent.
      console.log(`[Verify] 🚀 Triggering analysis pipeline for submission ${dbSubmission.id}...`);

      waitUntil(
        runAnalysis(dbSubmission, {
          orderId: orderId,
          paymentId: paymentId,
          amount: amountINR,
        })
      );

      // Return success immediately (analysis continues after the response)
      return res.json({
        success: true,
        verified: true,
        status: "CAPTURED",
        message: "Payment verified successfully! Analysis in progress...",
        submissionId: dbSubmission.id,
        action: "PROCEED_WITH_ANALYSIS",
      });
    }

    // Scenario 2: Payment not captured
    console.warn(`[Verify] Payment status: ${razorpayPayment.status}`);

    // Log incident
    await supabase.from("payment_incidents").insert({
      incident_type: "PAYMENT_NOT_CAPTURED",
      submission_id: dbSubmission.id,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      email: dbSubmission.email,
      razorpay_status: razorpayPayment.status,
      description: `Payment status is ${razorpayPayment.status}, not captured`,
      status: "unresolved",
    });

    return res.json({
      success: false,
      verified: false,
      status: razorpayPayment.status,
      message: `Payment status: ${razorpayPayment.status}`,
      action: "RETRY_PAYMENT",
    });
  } catch (error) {
    console.error("[Verify] Error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message || "Payment verification failed",
      action: "CONTACT_SUPPORT",
    });
  }
}

// Validate payment token (from frontend before submission)
async function validatePaymentToken(req, res) {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "Missing orderId",
      });
    }

    // Check if order exists in Razorpay
    const order = await razorpay.orders.fetch(orderId);

    if (!order) {
      return res.json({
        success: false,
        message: "Order not found in Razorpay",
      });
    }

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        status: order.status,
      },
    });
  } catch (error) {
    console.error("[ValidateToken] Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

module.exports = {
  verifyPayment,
  validatePaymentToken,
};
