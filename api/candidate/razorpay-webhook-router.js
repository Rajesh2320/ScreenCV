// screencv/api/candidate/razorpay-webhook-router.js
// ROUTING WEBHOOK - Handles ALL Razorpay webhook events with DUAL database support
// FLEXIBLE: Works with both raw body AND parsed JSON body


const crypto = require("crypto");
const { supabase: supabase_staging } = require("../../lib/supabase-client");
const { RAZORPAY_KEY_SECRET } = require("../../lib/constants");
const { analyzeResumeVsJob } = require("./analyze");

// Initialize production Supabase client
const { createClient } = require("@supabase/supabase-js");
const supabase_production = createClient(
  process.env.SUPABASE_PRODUCTION_URL || "https://usomobygtlhuvkkrsjcy.supabase.co",
  process.env.SUPABASE_PRODUCTION_ANON_KEY
);

// Verify Razorpay webhook signature
function verifyWebhookSignature(body, signature) {
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  console.log(`[Router] Signature check:
    Expected: ${expectedSignature.substring(0, 20)}...
    Received: ${signature ? signature.substring(0, 20) + "..." : "NONE"}`);

  return expectedSignature === signature;
}

// MAIN ROUTING HANDLER
async function handlePaymentWebhookRouter(req, res) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    
    console.log("[Router] Webhook received");
    console.log("[Router] Signature header:", signature ? "✅ Present" : "❌ Missing");
    console.log("[Router] req.rawBody:", req.rawBody ? `✅ Present (${req.rawBody.length} bytes)` : "❌ Missing");
    console.log("[Router] req.body:", req.body ? "✅ Present (parsed)" : "❌ Missing");

    // ⭐ FLEXIBLE: Get raw body from either rawBody OR reconstruct from parsed body
    let body = null;

    if (req.rawBody) {
      // If we have raw body, use it
      body = req.rawBody;
      console.log("[Router] Using req.rawBody for signature verification");
    } else if (req.body) {
      // If only parsed body available, reconstruct it
      body = JSON.stringify(req.body);
      console.log("[Router] Reconstructing body from req.body (JSON.stringify)");
    } else {
      console.error("[Router] ❌ Missing both rawBody and body!");
      return res.status(400).json({ error: "Missing webhook data" });
    }

    if (!signature) {
      console.error("[Router] ❌ Missing x-razorpay-signature header");
      return res.status(400).json({ error: "Missing signature" });
    }

    // Verify signature
    const isValid = verifyWebhookSignature(body, signature);

    if (!isValid) {
      console.error("[Router] ❌ Invalid webhook signature!");
      return res.status(400).json({ error: "Invalid signature" });
    }

    console.log("[Router] ✅ Signature verified");

    // Parse the body if it's still a string
    let event;
    if (typeof body === "string") {
      event = JSON.parse(body);
    } else {
      event = body;
    }

    const payment = event.payload.payment.entity;
    const order = event.payload.order.entity;

    console.log(
      `[Router] Event: ${event.event}, Order: ${order.id}, Payment: ${payment.id}, Status: ${payment.status}`
    );

    // ============================================
    // DETERMINE WHICH APP (staging vs production)
    // ============================================
    const { app, submission, supabaseClient } = await determineApp(order.id);

    if (!submission || !app) {
      console.error("[Router] ❌ Order not found in either database");

      // Log incident to BOTH databases (try both)
      try {
        await supabase_staging.from("payment_incidents").insert({
          incident_type: "ORDER_NOT_FOUND",
          razorpay_payment_id: payment.id,
          razorpay_order_id: order.id,
          email: order.notes?.email || "unknown",
          amount: payment.amount / 100,
          razorpay_status: payment.status,
          description: `Order not found in staging database`,
          status: "unresolved",
        });
      } catch (e) {
        console.warn("[Router] Failed to log to staging:", e.message);
      }

      try {
        await supabase_production.from("payment_incidents").insert({
          incident_type: "ORDER_NOT_FOUND",
          razorpay_payment_id: payment.id,
          razorpay_order_id: order.id,
          email: order.notes?.email || "unknown",
          amount: payment.amount / 100,
          razorpay_status: payment.status,
          description: `Order not found in production database`,
          status: "unresolved",
        });
      } catch (e) {
        console.warn("[Router] Failed to log to production:", e.message);
      }

      return res.json({
        success: false,
        error: "Order not found",
      });
    }

    console.log(`[Router] 🎯 Found order in ${app.toUpperCase()} database`);

    // ============================================
    // ROUTE TO APPROPRIATE HANDLER
    // ============================================
    if (event.event === "payment.captured") {
      return await handleCapturedPayment(
        payment,
        order,
        submission,
        supabaseClient,
        app,
        res
      );
    }

    if (event.event === "payment.failed") {
      return await handleFailedPayment(
        payment,
        order,
        submission,
        supabaseClient,
        app,
        res
      );
    }

    if (event.event === "payment.cancelled") {
      return await handleCancelledPayment(
        payment,
        order,
        submission,
        supabaseClient,
        app,
        res
      );
    }

    if (event.event === "payment.authorized") {
      return await handleAuthorizedPayment(
        payment,
        order,
        submission,
        supabaseClient,
        app,
        res
      );
    }

    console.log(`[Router] ℹ️ Ignoring event: ${event.event}`);
    return res.json({ success: true });

  } catch (error) {
    console.error("[Router] Fatal error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// DETERMINE APP: Query both databases
// ============================================
async function determineApp(orderId) {
  // Try STAGING first
  try {
    const { data: stagingSubmission, error: stagingError } =
      await supabase_staging
        .from("candidate_submissions")
        .select("*")
        .eq("razorpay_order_id", orderId)
        .single();

    if (stagingSubmission && !stagingError) {
      console.log(`[Router] ✅ Order found in STAGING (CVSCREEN)`);
      return {
        app: "staging",
        submission: stagingSubmission,
        supabaseClient: supabase_staging,
      };
    }
  } catch (error) {
    console.warn("[Router] Staging query error:", error.message);
  }

  // Try PRODUCTION
  try {
    const { data: prodSubmission, error: prodError } = await supabase_production
      .from("candidate_submissions")
      .select("*")
      .eq("razorpay_order_id", orderId)
      .single();

    if (prodSubmission && !prodError) {
      console.log(`[Router] ✅ Order found in PRODUCTION (CVSCREEN-PRODUCTION)`);
      return {
        app: "production",
        submission: prodSubmission,
        supabaseClient: supabase_production,
      };
    }
  } catch (error) {
    console.warn("[Router] Production query error:", error.message);
  }

  return { app: null, submission: null, supabaseClient: null };
}

// ============================================
// HANDLER 1: CAPTURED PAYMENT ✅
// ============================================
async function handleCapturedPayment(
  payment,
  order,
  submission,
  supabaseClient,
  app,
  res
) {
  try {
    const amountINR = payment.amount / 100;

    console.log(
      `[Router-Captured] Processing payment for ${app} | Submission: ${submission.id}`
    );

    // Update submission with payment confirmation
    const { error: updateError } = await supabaseClient
      .from("candidate_submissions")
      .update({
        razorpay_payment_id: payment.id,
        payment_status: "captured",
        payment_date: new Date().toISOString(),
        payment_amount: amountINR,
      })
      .eq("id", submission.id);

    if (updateError) {
      console.error("[Router-Captured] Failed to update submission:", updateError);

      await supabaseClient.from("payment_incidents").insert({
        incident_type: "DB_UPDATE_FAILED",
        submission_id: submission.id,
        razorpay_payment_id: payment.id,
        razorpay_order_id: order.id,
        candidate_name: submission.candidate_name || "Unknown",
        email: submission.email,
        amount: amountINR,
        razorpay_status: payment.status,
        description: `Failed to update submission: ${updateError.message}`,
        status: "unresolved",
      });

      return res.status(500).json({
        success: false,
        error: "Failed to update payment status",
      });
    }

    console.log(`[Router-Captured] ✅ Payment confirmed for submission ${submission.id}`);

    // Insert payment record
    const { error: paymentInsertError } = await supabaseClient
      .from("candidate_payments")
      .insert({
        submission_id: submission.id,
        candidate_name: submission.candidate_name || "Unknown",
        email: submission.email,
        razorpay_order_id: order.id,
        razorpay_payment_id: payment.id,
        amount_inr: amountINR,
        status: "captured",
        payment_method: payment.method || "razorpay",
        error_message: null,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

    if (paymentInsertError) {
      console.warn("[Router-Captured] Payment record insert error:", paymentInsertError);
    } else {
      console.log(`[Router-Captured] ✅ candidate_payments record inserted`);
    }

    // ✅ RUN ANALYSIS
    try {
      console.log(`[Router-Captured] Starting analysis for submission ${submission.id}...`);

      const analysisResult = await analyzeResumeVsJob(
        submission.id,
        submission.resume_text,
        submission.job_description,
        submission.job_title,
        submission.email,
        submission.feedback_token,
        {
          orderId: order.id,
          paymentId: payment.id,
          amount: amountINR,
          timestamp: new Date().toISOString(),
          app: app,
        }
      );

      if (!analysisResult.success) {
        console.error(
          "[Router-Captured] Analysis failed:",
          analysisResult.error
        );

        await supabaseClient.from("payment_incidents").insert({
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

      console.log(`[Router-Captured] ✅ Analysis complete and email sent (${app})`);

      res.json({
        success: true,
        message: `Payment processed and analysis initiated (${app})`,
      });
    } catch (analysisError) {
      console.error("[Router-Captured] Analysis error:", analysisError);

      await supabaseClient.from("payment_incidents").insert({
        incident_type: "ANALYSIS_ERROR",
        submission_id: submission.id,
        razorpay_payment_id: payment.id,
        razorpay_order_id: order.id,
        email: submission.email,
        amount: amountINR,
        razorpay_status: payment.status,
        description: `Error: ${analysisError.message}`,
        status: "unresolved",
      });

      return res.status(500).json({
        success: false,
        error: "Analysis error",
      });
    }
  } catch (error) {
    console.error("[Router-Captured] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// HANDLER 2: FAILED PAYMENT ❌
// ============================================
async function handleFailedPayment(
  payment,
  order,
  submission,
  supabaseClient,
  app,
  res
) {
  try {
    const amountINR = payment.amount / 100;
    const failureReason = payment.error?.description || "Payment was declined";

    console.log(`[Router-Failed] Reason: ${failureReason} (${app})`);

    if (submission) {
      const { error: paymentInsertError } = await supabaseClient
        .from("candidate_payments")
        .insert({
          submission_id: submission.id,
          candidate_name: submission.candidate_name || "Unknown",
          email: submission.email,
          razorpay_order_id: order.id,
          razorpay_payment_id: payment.id,
          amount_inr: amountINR,
          status: "failed",
          payment_method: payment.method || "razorpay",
          error_message: failureReason,
          created_at: new Date().toISOString(),
        });

      if (!paymentInsertError) {
        console.log(`[Router-Failed] ✅ Failed payment record inserted`);
      }
    }

    await supabaseClient.from("payment_incidents").insert({
      incident_type: "PAYMENT_FAILED",
      submission_id: submission?.id,
      razorpay_payment_id: payment.id,
      razorpay_order_id: order.id,
      candidate_name: submission?.candidate_name || "Unknown",
      email: submission?.email || order.notes?.email,
      amount: amountINR,
      razorpay_status: payment.status,
      description: failureReason,
      status: "unresolved",
    });

    return res.json({
      success: true,
      message: `Failed payment recorded (${app})`,
    });
  } catch (error) {
    console.error("[Router-Failed] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// HANDLER 3: CANCELLED PAYMENT 🚫
// ============================================
async function handleCancelledPayment(
  payment,
  order,
  submission,
  supabaseClient,
  app,
  res
) {
  try {
    const amountINR = payment.amount / 100;

    console.log(`[Router-Cancelled] User cancelled payment (${app})`);

    if (submission) {
      const { error: paymentInsertError } = await supabaseClient
        .from("candidate_payments")
        .insert({
          submission_id: submission.id,
          candidate_name: submission.candidate_name || "Unknown",
          email: submission.email,
          razorpay_order_id: order.id,
          razorpay_payment_id: payment.id,
          amount_inr: amountINR,
          status: "cancelled",
          payment_method: payment.method || "razorpay",
          error_message: "Payment cancelled by user",
          created_at: new Date().toISOString(),
        });

      if (!paymentInsertError) {
        console.log(`[Router-Cancelled] ✅ Cancelled payment record inserted`);
      }
    }

    await supabaseClient.from("payment_incidents").insert({
      incident_type: "PAYMENT_CANCELLED",
      submission_id: submission?.id,
      razorpay_payment_id: payment.id,
      razorpay_order_id: order.id,
      candidate_name: submission?.candidate_name || "Unknown",
      email: submission?.email || order.notes?.email,
      amount: amountINR,
      razorpay_status: payment.status,
      description: "User cancelled payment",
      status: "unresolved",
    });

    return res.json({
      success: true,
      message: `Cancelled payment recorded (${app})`,
    });
  } catch (error) {
    console.error("[Router-Cancelled] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// HANDLER 4: AUTHORIZED PAYMENT ⏳
// ============================================
async function handleAuthorizedPayment(
  payment,
  order,
  submission,
  supabaseClient,
  app,
  res
) {
  try {
    const amountINR = payment.amount / 100;

    console.log(`[Router-Authorized] Payment authorized (${app})`);

    if (submission) {
      const { error: paymentInsertError } = await supabaseClient
        .from("candidate_payments")
        .insert({
          submission_id: submission.id,
          candidate_name: submission.candidate_name || "Unknown",
          email: submission.email,
          razorpay_order_id: order.id,
          razorpay_payment_id: payment.id,
          amount_inr: amountINR,
          status: "pending",
          payment_method: payment.method || "razorpay",
          error_message: "Payment authorized, awaiting capture",
          created_at: new Date().toISOString(),
        });

      if (!paymentInsertError) {
        console.log(`[Router-Authorized] ✅ Authorized payment record inserted`);
      }
    }

    return res.json({
      success: true,
      message: `Authorized payment recorded (${app})`,
    });
  } catch (error) {
    console.error("[Router-Authorized] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

module.exports = {
  handlePaymentWebhookRouter,
  verifyWebhookSignature,
};
