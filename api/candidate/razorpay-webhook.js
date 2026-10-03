// screencv/api/candidate/razorpay-webhook.js
// Razorpay webhook: the safety net for payments.
//
// WHY IT EXISTS
//  Normally the customer's browser reports a successful payment and
//  razorpay-verify.js does the work. But the browser does not always report
//  back: the tab is closed, the phone switches to a UPI app and the page
//  reloads, the connection drops. Razorpay also notifies this address directly,
//  so those customers still get their report.
//
// CHANGES
//  1. The signature is checked with RAZORPAY_WEBHOOK_SECRET. It was being
//     checked with the API key secret, which is a different value, so every
//     genuine notification would have been rejected.
//  2. The order id is read from the payment itself (payment.order_id). The old
//     code read event.payload.order, which Razorpay does not send for payment
//     events, so the handler crashed on every notification.
//  3. A captured payment goes through the same once-only confirmation as the
//     browser path (confirmPaymentAndStartAnalysis in razorpay-verify.js).
//     Before, the webhook ran its own second analysis and sent a second email.
//  4. Razorpay is answered straight away and the analysis continues afterwards.
//     Before, the reply waited for the whole analysis, which makes Razorpay
//     time out and send the same notification again.
//  5. Repeated notifications for the same failed payment are recorded once.
//
// REQUIRED SETTING: RAZORPAY_WEBHOOK_SECRET, the secret typed in when the
// webhook is created in the Razorpay dashboard. Test mode and Live mode have
// separate webhooks and separate secrets.

const crypto = require("crypto");
const { supabase } = require("../../lib/supabase-client");
const { RAZORPAY_WEBHOOK_SECRET } = require("../../lib/constants");
const { confirmPaymentAndStartAnalysis } = require("./razorpay-verify");
const { publicBaseUrl } = require("./analyze");

// Verify Razorpay webhook signature: HMAC-SHA256 of the raw body, keyed with
// the webhook secret, compared in constant time.
function verifyWebhookSignature(body, signature) {
  if (!RAZORPAY_WEBHOOK_SECRET || !body || !signature) return false;

  const expected = Buffer.from(
    crypto.createHmac("sha256", RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex"),
    "utf8"
  );
  const received = Buffer.from(String(signature), "utf8");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function incidentExists(incidentType, paymentId) {
  const { data } = await supabase
    .from("payment_incidents")
    .select("id")
    .eq("incident_type", incidentType)
    .eq("razorpay_payment_id", paymentId)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

// Handle all payment webhook events
async function handlePaymentWebhook(req, res) {
  try {
    if (!RAZORPAY_WEBHOOK_SECRET) {
      console.error("[Webhook] ❌ RAZORPAY_WEBHOOK_SECRET is not set - webhook cannot be verified");
      return res.status(503).json({ error: "Webhook is not configured" });
    }

    const signature = req.headers["x-razorpay-signature"];
    const body = req.rawBody; // Raw body for signature verification

    if (!signature || !body) {
      console.error("[Webhook] Missing signature or body");
      return res.status(400).json({ error: "Missing webhook data" });
    }

    if (!verifyWebhookSignature(body, signature)) {
      console.error("[Webhook] ❌ Invalid webhook signature!");
      return res.status(400).json({ error: "Invalid signature" });
    }

    console.log("[Webhook] ✅ Signature verified");

    const event = JSON.parse(body);
    const payment = event?.payload?.payment?.entity;

    if (!payment || !payment.id) {
      console.log(`[Webhook] ℹ️ Event ${event?.event} carries no payment - ignoring`);
      return res.json({ success: true });
    }

    // payment.* events carry the order id on the payment; order.paid also sends an order object
    const orderId = payment.order_id || event?.payload?.order?.entity?.id || null;

    console.log(
      `[Webhook] Event: ${event.event}, Order: ${orderId}, Payment: ${payment.id}, Status: ${payment.status}`
    );

    if (event.event === "payment.captured" || event.event === "order.paid") {
      return await handleCapturedPayment(payment, orderId, res, req);
    }

    if (event.event === "payment.failed") {
      return await handleFailedPayment(payment, orderId, res);
    }

    if (event.event === "payment.authorized") {
      // Nothing to do yet: payment.captured follows and is handled above
      console.log(`[Webhook] ⏳ Payment ${payment.id} authorized, awaiting capture`);
      return res.json({ success: true, message: "Authorized payment noted" });
    }

    console.log(`[Webhook] ℹ️ Ignoring event: ${event.event}`);
    return res.json({ success: true });

  } catch (error) {
    console.error("[Webhook] Fatal error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Webhook processing error",
    });
  }
}

// ============================================
// CAPTURED PAYMENT ✅
// ============================================
async function handleCapturedPayment(payment, orderId, res, req) {
  const amountINR = payment.amount / 100;

  if (!orderId) {
    console.error(`[Webhook] Captured payment ${payment.id} has no order id - cannot match a submission`);
    return res.json({ success: false, error: "No order id on payment" });
  }

  const { data: submission, error: findError } = await supabase
    .from("candidate_submissions")
    .select("*")
    .eq("razorpay_order_id", orderId)
    .single();

  if (findError || !submission) {
    console.error("[Webhook] Submission not found for order:", orderId);

    if (!(await incidentExists("SUBMISSION_NOT_FOUND", payment.id))) {
      await supabase.from("payment_incidents").insert({
        incident_type: "SUBMISSION_NOT_FOUND",
        razorpay_payment_id: payment.id,
        razorpay_order_id: orderId,
        email: payment.email || null,
        amount: amountINR,
        razorpay_status: payment.status,
        description: `No submission found for order ${orderId}`,
        status: "unresolved",
      });
    }

    // 200 so Razorpay does not keep resending something we cannot act on
    return res.json({ success: false, error: "Submission not found" });
  }

  const result = await confirmPaymentAndStartAnalysis({
    submission,
    paymentId: payment.id,
    orderId,
    amountINR,
    paymentMethod: payment.method,
    razorpayStatus: payment.status,
    source: "webhook",
    baseUrl: typeof publicBaseUrl === "function" ? publicBaseUrl(req) : "",
  });

  if (!result.ok) {
    // A non-200 reply makes Razorpay try again later, which is what we want here
    return res.status(500).json({ success: false, error: "Failed to confirm payment" });
  }

  return res.json({
    success: true,
    message: result.alreadyProcessed
      ? "Payment was already processed"
      : "Payment confirmed, analysis started",
  });
}

// ============================================
// FAILED PAYMENT ❌
// ============================================
async function handleFailedPayment(payment, orderId, res) {
  const amountINR = payment.amount / 100;
  const failureReason = payment.error_description || payment.error?.description || "Payment was declined";

  console.warn(`[Webhook-Failed] Payment ${payment.id}: ${failureReason}`);

  // Razorpay may send the same notification more than once: record it once
  if (await incidentExists("PAYMENT_FAILED", payment.id)) {
    console.log(`[Webhook-Failed] ℹ️ Already recorded`);
    return res.json({ success: true, message: "Failed payment already recorded" });
  }

  let submission = null;
  if (orderId) {
    const { data } = await supabase
      .from("candidate_submissions")
      .select("*")
      .eq("razorpay_order_id", orderId)
      .single();
    submission = data || null;
  }

  const { error: incidentError } = await supabase.from("payment_incidents").insert({
    incident_type: "PAYMENT_FAILED",
    submission_id: submission?.id || null,
    razorpay_payment_id: payment.id,
    razorpay_order_id: orderId,
    email: submission?.email || payment.email || null,
    amount: amountINR,
    razorpay_status: payment.status,
    description: failureReason,
    status: "unresolved",
  });

  if (incidentError) {
    console.error("[Webhook-Failed] Could not record incident:", incidentError.message);
  } else {
    console.log(`[Webhook-Failed] ✅ Incident logged`);
  }

  // 200 to Razorpay: the event has been dealt with
  return res.json({ success: true, message: "Failed payment recorded" });
}

module.exports = {
  handlePaymentWebhook,
  verifyWebhookSignature,
};
