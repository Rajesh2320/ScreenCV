// screencv/api/candidate/razorpay-webhook.js
// IMPROVED: Handle ALL Razorpay webhook events with proper status tracking
// Events handled: payment.captured, payment.failed, payment.cancelled, payment.authorized


const crypto = require("crypto");
const { supabase } = require("../../lib/supabase-client");
const { RAZORPAY_KEY_SECRET } = require("../../lib/constants");
const { analyzeResumeVsJob } = require("./analyze");

// Verify Razorpay webhook signature
function verifyWebhookSignature(body, signature) {
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  return expectedSignature === signature;
}

// Handle all payment webhook events
async function handlePaymentWebhook(req, res) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const body = req.rawBody; // Raw body for signature verification

    if (!signature || !body) {
      console.error("[Webhook] Missing signature or body");
      return res.status(400).json({ error: "Missing webhook data" });
    }

    // Verify signature
    const isValid = verifyWebhookSignature(body, signature);

    if (!isValid) {
      console.error("[Webhook] ❌ Invalid webhook signature!");
      return res.status(400).json({ error: "Invalid signature" });
    }

    console.log("[Webhook] ✅ Signature verified");

    const event = JSON.parse(body);
    const payment = event.payload.payment.entity;
    const order = event.payload.order.entity;

    console.log(
      `[Webhook] Event: ${event.event}, Order: ${order.id}, Payment: ${payment.id}, Status: ${payment.status}`
    );

    // ============================================
    // EVENT 1: payment.captured ✅
    // ============================================
    if (event.event === "payment.captured") {
      console.log(`[Webhook] 💰 Processing CAPTURED payment ${payment.id}`);

      return await handleCapturedPayment(payment, order, res);
    }

    // ============================================
    // EVENT 2: payment.failed ❌
    // ============================================
    if (event.event === "payment.failed") {
      console.warn(`[Webhook] ❌ Processing FAILED payment ${payment.id}`);

      return await handleFailedPayment(payment, order, res);
    }

    // ============================================
    // EVENT 3: payment.cancelled 🚫
    // ============================================
    if (event.event === "payment.cancelled") {
      console.warn(`[Webhook] 🚫 Processing CANCELLED payment ${payment.id}`);

      return await handleCancelledPayment(payment, order, res);
    }

    // ============================================
    // EVENT 4: payment.authorized ⏳
    // ============================================
    if (event.event === "payment.authorized") {
      console.log(`[Webhook] ⏳ Processing AUTHORIZED payment ${payment.id}`);

      return await handleAuthorizedPayment(payment, order, res);
    }

    // Ignore all other events
    console.log(`[Webhook] ℹ️ Ignoring event: ${event.event}`);
    return res.json({ success: true });

  } catch (error) {
    console.error("[Webhook] Fatal error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// HANDLER 1: CAPTURED PAYMENT ✅
// ============================================
async function handleCapturedPayment(payment, order, res) {
  try {
    // Get submission from order ID
    const { data: submission, error: findError } = await supabase
      .from("candidate_submissions")
      .select("*")
      .eq("razorpay_order_id", order.id)
      .single();

    if (findError || !submission) {
      console.error("[Webhook] Submission not found for order:", order.id);

      // Log incident
      await supabase.from("payment_incidents").insert({
        incident_type: "SUBMISSION_NOT_FOUND",
        razorpay_payment_id: payment.id,
        razorpay_order_id: order.id,
        candidate_name: null,  // Submission not found
        email: order.notes?.email,
        amount: payment.amount / 100,
        razorpay_status: payment.status,
        description: `No submission found for order ${order.id}`,
        status: "unresolved",
      });

      return res.json({
        success: false,
        error: "Submission not found",
      });
    }

    const amountINR = payment.amount / 100;

    // Update submission with payment confirmation
    const { error: updateError } = await supabase
      .from("candidate_submissions")
      .update({
        razorpay_payment_id: payment.id,
        payment_status: "captured",
        payment_date: new Date().toISOString(),
        payment_amount: amountINR,
      })
      .eq("id", submission.id);

    if (updateError) {
      console.error("[Webhook] Failed to update submission:", updateError);

      // Log incident
      await supabase.from("payment_incidents").insert({
        incident_type: "DB_UPDATE_FAILED",
        submission_id: submission.id,
        razorpay_payment_id: payment.id,
        razorpay_order_id: order.id,
        candidate_name: submission.candidate_name || "Unknown",  // ⭐ Capture name
        email: submission.email,
        amount: amountINR,
        razorpay_status: payment.status,
        db_status: "UPDATE_FAILED",
        description: `Failed to update submission: ${updateError.message}`,
        status: "unresolved",
      });

      return res.status(500).json({
        success: false,
        error: "Failed to update payment status",
      });
    }

    console.log(
      `[Webhook] ✅ Payment confirmed for submission ${submission.id}`
    );

    // ✅ INSERT INTO candidate_payments with VALID status
    const { error: paymentInsertError } = await supabase
      .from("candidate_payments")
      .insert({
        submission_id: submission.id,
        candidate_name: submission.candidate_name || "Unknown",  // ⭐ Capture candidate name
        email: submission.email,
        razorpay_order_id: order.id,
        razorpay_payment_id: payment.id,
        amount_inr: amountINR,
        status: "captured",  // ✅ FIXED: Use "captured" not "completed"
        payment_method: payment.method || "razorpay",
        error_message: null,  // No error for successful payment
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

    if (paymentInsertError) {
      console.error("[Webhook] Payment record insert error:", paymentInsertError);

      // Log incident
      await supabase.from("payment_incidents").insert({
        incident_type: "PAYMENT_RECORD_INSERT_ERROR",
        submission_id: submission.id,
        razorpay_payment_id: payment.id,
        razorpay_order_id: order.id,
        candidate_name: submission.candidate_name || "Unknown",  // ⭐ Capture name
        email: submission.email,
        amount: amountINR,
        razorpay_status: payment.status,
        description: `Failed to insert payment record: ${paymentInsertError.message}`,
        status: "unresolved",
      });

      // Don't fail - continue to analysis
      console.warn("[Webhook] ⚠️ Payment record insert failed, but continuing...");
    } else {
      console.log(`[Webhook] ✅ candidate_payments record inserted`);
    }

    // Queue analysis job (or run immediately if no queue)
    try {
      console.log(`[Webhook] Starting analysis for submission ${submission.id}...`);

      const analysisResult = await analyzeResumeVsJob(
        submission.id,
        submission.resume_text,
        submission.job_description,
        submission.job_title,
        submission.email,
        submission.feedback_token,
        {
          // Payment info for email
          orderId: order.id,
          paymentId: payment.id,
          amount: amountINR,
          timestamp: new Date().toISOString(),
        }
      );

      if (!analysisResult.success) {
        console.error(
          "[Webhook] Analysis failed:",
          analysisResult.error
        );

        // Log incident
        await supabase.from("payment_incidents").insert({
          incident_type: "ANALYSIS_FAILED",
          submission_id: submission.id,
          razorpay_payment_id: payment.id,
          razorpay_order_id: order.id,
          email: submission.email,
          amount: amountINR,
          razorpay_status: payment.status,
          description: `Analysis failed: ${analysisResult.error}`,
          status: "unresolved",
        });

        return res.json({
          success: false,
          error: "Analysis failed",
        });
      }

      console.log(`[Webhook] ✅ Analysis complete and email sent`);

      res.json({
        success: true,
        message: "Payment processed and analysis initiated",
      });
    } catch (analysisError) {
      console.error("[Webhook] Unexpected error during analysis:", analysisError);

      // Log incident
      await supabase.from("payment_incidents").insert({
        incident_type: "ANALYSIS_ERROR",
        submission_id: submission.id,
        razorpay_payment_id: payment.id,
        razorpay_order_id: order.id,
        email: submission.email,
        amount: amountINR,
        razorpay_status: payment.status,
        description: `Unexpected error: ${analysisError.message}`,
        status: "unresolved",
      });

      return res.status(500).json({
        success: false,
        error: "Analysis error",
      });
    }
  } catch (error) {
    console.error("[Webhook-Captured] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// HANDLER 2: FAILED PAYMENT ❌
// ============================================
async function handleFailedPayment(payment, order, res) {
  try {
    const amountINR = payment.amount / 100;
    const failureReason = payment.error?.description || "Payment was declined";

    console.warn(`[Webhook-Failed] Reason: ${failureReason}`);

    // Get submission from order ID
    const { data: submission } = await supabase
      .from("candidate_submissions")
      .select("*")
      .eq("razorpay_order_id", order.id)
      .single();

    if (submission) {
      // ✅ INSERT INTO candidate_payments with status="failed" + error message
      const { error: paymentInsertError } = await supabase
        .from("candidate_payments")
        .insert({
          submission_id: submission.id,
          candidate_name: submission.candidate_name || "Unknown",  // ⭐ Capture candidate name
          email: submission.email,
          razorpay_order_id: order.id,
          razorpay_payment_id: payment.id,
          amount_inr: amountINR,
          status: "failed",  // ✅ Record the failure
          payment_method: payment.method || "razorpay",
          error_message: failureReason,  // ✅ CRITICAL: Store WHY it failed
          created_at: new Date().toISOString(),
        });

      if (!paymentInsertError) {
        console.log(`[Webhook-Failed] ✅ Failed payment record inserted`);
      } else {
        console.error("[Webhook-Failed] Failed to insert payment record:", paymentInsertError);
      }
    }

    // Log incident
    await supabase.from("payment_incidents").insert({
      incident_type: "PAYMENT_FAILED",
      submission_id: submission?.id,
      razorpay_payment_id: payment.id,
      razorpay_order_id: order.id,
      candidate_name: submission?.candidate_name || "Unknown",  // ⭐ Capture name
      email: submission?.email || order.notes?.email,
      amount: amountINR,
      razorpay_status: payment.status,
      description: failureReason,
      status: "unresolved",
    });

    console.log(`[Webhook-Failed] ✅ Incident logged`);

    return res.json({
      success: true,  // Return 200 to Razorpay (we processed the event)
      message: "Failed payment recorded",
    });
  } catch (error) {
    console.error("[Webhook-Failed] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// HANDLER 3: CANCELLED PAYMENT 🚫
// ============================================
async function handleCancelledPayment(payment, order, res) {
  try {
    const amountINR = payment.amount / 100;

    console.warn(`[Webhook-Cancelled] User cancelled payment`);

    // Get submission from order ID
    const { data: submission } = await supabase
      .from("candidate_submissions")
      .select("*")
      .eq("razorpay_order_id", order.id)
      .single();

    if (submission) {
      // ✅ INSERT INTO candidate_payments with status="cancelled"
      const { error: paymentInsertError } = await supabase
        .from("candidate_payments")
        .insert({
          submission_id: submission.id,
          candidate_name: submission.candidate_name || "Unknown",  // ⭐ Capture candidate name
          email: submission.email,
          razorpay_order_id: order.id,
          razorpay_payment_id: payment.id,
          amount_inr: amountINR,
          status: "cancelled",  // ✅ Record cancellation
          payment_method: payment.method || "razorpay",
          error_message: "Payment cancelled by user",
          created_at: new Date().toISOString(),
        });

      if (!paymentInsertError) {
        console.log(`[Webhook-Cancelled] ✅ Cancelled payment record inserted`);
      }
    }

    // Log incident
    await supabase.from("payment_incidents").insert({
      incident_type: "PAYMENT_CANCELLED",
      submission_id: submission?.id,
      razorpay_payment_id: payment.id,
      razorpay_order_id: order.id,
      candidate_name: submission?.candidate_name || "Unknown",  // ⭐ Capture name
      email: submission?.email || order.notes?.email,
      amount: amountINR,
      razorpay_status: payment.status,
      description: "User cancelled payment",
      status: "unresolved",
    });

    return res.json({
      success: true,
      message: "Cancelled payment recorded",
    });
  } catch (error) {
    console.error("[Webhook-Cancelled] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// HANDLER 4: AUTHORIZED PAYMENT ⏳
// ============================================
async function handleAuthorizedPayment(payment, order, res) {
  try {
    const amountINR = payment.amount / 100;

    console.log(`[Webhook-Authorized] Payment authorized, awaiting capture`);

    // Get submission from order ID
    const { data: submission } = await supabase
      .from("candidate_submissions")
      .select("*")
      .eq("razorpay_order_id", order.id)
      .single();

    if (submission) {
      // ✅ INSERT INTO candidate_payments with status="pending"
      const { error: paymentInsertError } = await supabase
        .from("candidate_payments")
        .insert({
          submission_id: submission.id,
          candidate_name: submission.candidate_name || "Unknown",  // ⭐ Capture candidate name
          email: submission.email,
          razorpay_order_id: order.id,
          razorpay_payment_id: payment.id,
          amount_inr: amountINR,
          status: "pending",  // Use "pending" for authorized but not captured
          payment_method: payment.method || "razorpay",
          error_message: "Payment authorized, awaiting capture",
          created_at: new Date().toISOString(),
        });

      if (!paymentInsertError) {
        console.log(`[Webhook-Authorized] ✅ Authorized payment record inserted`);
      }
    }

    return res.json({
      success: true,
      message: "Authorized payment recorded",
    });
  } catch (error) {
    console.error("[Webhook-Authorized] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

module.exports = {
  handlePaymentWebhook,
  verifyWebhookSignature,
};
