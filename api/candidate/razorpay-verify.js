// screencv/api/candidate/razorpay-verify.js
// Verify Razorpay payment, mark the submission paid, record the payment and start the analysis
//
// HOW A PAYMENT IS CONFIRMED
//  Two things can tell the server that a customer has paid:
//    - the customer's browser, straight after checkout (verifyPayment, below)
//    - Razorpay itself, through the webhook (razorpay-webhook.js)
//  Both call confirmPaymentAndStartAnalysis(). Whichever arrives first does the
//  work; the other sees it is already done and does nothing. The customer gets
//  exactly one report and one email, and is still served if the browser never
//  reports back (tab closed, phone switched to a UPI app, connection lost).
//
// CHANGES
//  1. Analysis is handed to waitUntil() so Vercel keeps the function alive
//     until it finishes.
//  2. A failed analysis, or a report that could not be emailed, is logged as a
//     failure and recorded in payment_incidents.
//  3. A payment is processed once only, however many times it is reported and
//     whoever reports it (browser, webhook, retries). The "claim" is a single
//     database update that can only succeed for one caller.
//  4. The order must belong to the submission it is being applied to.
//  5. Signature comparison is timing-safe.
//  6. Access codes: one use is counted when a report is about to be produced.
//     With test payments, a code that has run out stops the report. With live
//     payments the report is always produced, because the customer has paid.

const crypto = require("crypto");
const Razorpay = require("razorpay");
const { waitUntil } = require("@vercel/functions");
const { supabase } = require("../../lib/supabase-client");
const { analyzeResumeVsJob, publicBaseUrl } = require("./analyze");
const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_MODE,
} = require("../../lib/constants");

// Access / discount codes (loaded safely; see lib/access-codes.js)
let accessCodes = null;
try {
  accessCodes = require("../../lib/access-codes");
} catch (err) {
  console.error("[Payment] ❌ Could not load lib/access-codes.js:", err.message);
}

// Column on candidate_submissions that holds the Razorpay order id
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
  let incidentType = "ANALYSIS_FAILED";

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
        `[Payment] ✅ Analysis pipeline completed for submission ${dbSubmission.id}, ` +
          `score: ${result.score} (${Date.now() - startedAt}ms)`
      );

      // The report exists but never reached the customer.
      if (result.emailSent === false) {
        incidentType = "REPORT_EMAIL_FAILED";
        failure =
          `Report saved (review ${result.reviewId}) but email not sent: ` +
          (result.emailError || "unknown error");
      }
    }
  } catch (err) {
    failure = (err && err.message) || String(err);
  }

  if (!failure) return;

  console.error(
    `[Payment] ❌ ${incidentType} for submission ${dbSubmission.id} ` +
      `after ${Date.now() - startedAt}ms: ${failure}`
  );

  // The customer has paid but has no report: record it so it can be followed up.
  try {
    const { error: incidentError } = await supabase.from("payment_incidents").insert({
      incident_type: incidentType,
      submission_id: dbSubmission.id,
      razorpay_payment_id: paymentData.paymentId,
      razorpay_order_id: paymentData.orderId,
      email: dbSubmission.email,
      amount: paymentData.amount,
      description: `Payment captured but customer has no report: ${failure}`,
      status: "unresolved",
    });
    if (incidentError) throw incidentError;
  } catch (incidentErr) {
    console.error(`[Payment] Could not record ${incidentType} incident:`, incidentErr);
  }
}

// Marks the submission as paid, records the payment and starts the analysis.
// Safe to call more than once, and from more than one place, for the same
// payment: only the first call does anything.
//
// Returns { ok: true, alreadyProcessed: boolean } or { ok: false, error }.
async function confirmPaymentAndStartAnalysis({ submission, paymentId, orderId, amountINR, paymentMethod, razorpayStatus, source, baseUrl }) {
  const tag = `[Payment:${source}]`;
  const now = new Date().toISOString();

  // THE CLAIM. One UPDATE that only matches while the submission is not yet
  // marked captured. If two callers race, the database lets exactly one win.
  const { data: claimedRows, error: claimError } = await supabase
    .from("candidate_submissions")
    .update({
      razorpay_payment_id: paymentId,
      payment_status: "captured",
      payment_date: now,
      payment_amount: amountINR,
    })
    .eq("id", submission.id)
    .or("payment_status.is.null,payment_status.neq.captured")
    .select("id");

  if (claimError) {
    console.error(`${tag} DB update error:`, claimError);

    await supabase.from("payment_incidents").insert({
      incident_type: "DB_UPDATE_ERROR",
      submission_id: submission.id,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      email: submission.email,
      amount: amountINR,
      razorpay_status: razorpayStatus,
      db_status: "UPDATE_FAILED",
      description: `Failed to update payment status: ${claimError.message}`,
      status: "unresolved",
    });

    return { ok: false, error: claimError.message };
  }

  if (!claimedRows || claimedRows.length === 0) {
    console.log(`${tag} ℹ️ Submission ${submission.id} is already marked paid - nothing to do`);
    return { ok: true, alreadyProcessed: true };
  }

  console.log(`${tag} ✅ Payment ${paymentId} confirmed for submission ${submission.id}`);

  // Record the payment
  const { error: paymentInsertError } = await supabase
    .from("candidate_payments")
    .insert({
      submission_id: submission.id,
      email: submission.email,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      amount_inr: amountINR,
      status: "captured",
      payment_method: paymentMethod || "razorpay",
      completed_at: now,
      created_at: now,
    });

  if (paymentInsertError) {
    console.error(`${tag} Payment record insert error:`, paymentInsertError);

    await supabase.from("payment_incidents").insert({
      incident_type: "PAYMENT_RECORD_INSERT_ERROR",
      submission_id: submission.id,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      email: submission.email,
      amount: amountINR,
      description: `Failed to insert payment record: ${paymentInsertError.message}`,
      status: "unresolved",
    });

    // The payment itself is confirmed, so carry on to the analysis
    console.warn(`${tag} ⚠️ Payment record insert failed, but continuing...`);
  }

  // ACCESS CODE: count one use now, at the moment a report is about to be made.
  // This runs only for the caller that won the claim above, so a payment
  // reported twice (browser and webhook) still counts as one use.
  if (submission.access_code && accessCodes) {
    const used = await accessCodes.consumeCode(submission.access_code);
    const refused = !used.ok && used.reason !== "error";

    if (refused && RAZORPAY_MODE !== "live") {
      // Test payments only: the code ran out between the order and the payment.
      // No report is made, and the progress page tells the tester why.
      console.warn(`${tag} ⛔ Access code ${submission.access_code} refused (${used.reason}) - no report for submission ${submission.id}`);
      await supabase.from("payment_incidents").insert({
        incident_type: "ACCESS_CODE_EXHAUSTED",
        submission_id: submission.id,
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
        email: submission.email,
        amount: amountINR,
        description: `Access code ${submission.access_code} could not be used (${used.reason}); no report was produced. Test payment.`,
        status: "resolved",
      });
      return { ok: true, alreadyProcessed: false, codeRefused: true };
    }

    if (!used.ok) {
      // A customer who has paid real money always gets their report. The same
      // applies if the count simply could not be updated.
      console.warn(`${tag} ⚠️ Could not count a use of code ${submission.access_code} (${used.reason}) - producing the report anyway`);
    }
  }

  // Start the analysis. waitUntil() tells Vercel to keep this function running
  // until it settles, after the response has been sent.
  console.log(`${tag} 🚀 Starting analysis for submission ${submission.id}...`);
  waitUntil(
    runAnalysis(submission, {
      orderId: orderId,
      paymentId: paymentId,
      amount: amountINR,
      baseUrl: baseUrl || "",   // site address, for the "View your report" link in the email
    })
  );

  return { ok: true, alreadyProcessed: false };
}

// Verify payment from Razorpay (called by the customer's browser after checkout)
async function verifyPayment(req, res) {
  try {
    const { paymentId, orderId, signature, submissionId } = req.body || {};

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

    // Scenario 1: Payment captured in Razorpay
    if (razorpayPayment.status === "captured") {
      const result = await confirmPaymentAndStartAnalysis({
        submission: dbSubmission,
        paymentId,
        orderId,
        amountINR: razorpayPayment.amount / 100,
        paymentMethod: razorpayPayment.method,
        razorpayStatus: razorpayPayment.status,
        source: "browser",
        baseUrl: typeof publicBaseUrl === "function" ? publicBaseUrl(req) : "",
      });

      if (!result.ok) {
        return res.status(500).json({
          success: false,
          error: "Failed to confirm payment",
          action: "CONTACT_SUPPORT",
        });
      }

      return res.json({
        success: true,
        verified: true,
        status: "CAPTURED",
        message: result.alreadyProcessed
          ? "Payment already verified."
          : "Payment verified successfully! Analysis in progress...",
        submissionId: dbSubmission.id,
        action: "PROCEED_WITH_ANALYSIS",
      });
    }

    // Scenario 2: Payment not captured.
    // If Razorpay captures it a moment later, the webhook will pick it up.
    console.warn(`[Verify] Payment status: ${razorpayPayment.status}`);

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
    const { orderId } = req.body || {};

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
  confirmPaymentAndStartAnalysis,
  runAnalysis,
};
