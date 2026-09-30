// screencv/api/candidate/create-payment.js
// Endpoint 2: Create mock payment order
// Accepts: email, submissionId
// Returns: orderId (for frontend to simulate payment)
// Note: This is MOCK payment - real Razorpay integration comes later

const { getSubmission, createPayment } = require("../../lib/supabase-client");
const {
  CORS_HEADERS,
  STATUS_CODES,
  REVIEW_PRICE_INR,
  MOCK_ORDER_ID_PREFIX,
  EMAIL_REGEX,
} = require("../../lib/constants");

// ===== GENERATE MOCK ORDER ID =====
function generateMockOrderId() {
  return `${MOCK_ORDER_ID_PREFIX}${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
}

// ===== CORS HANDLER =====
function handleCORS(req, res) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeader("Content-Type", "application/json").end("ok");
    return true;
  }
  return false;
}

// ===== VALIDATION =====
function validateInput(body) {
  const errors = [];

  if (!body.email) errors.push("Email is required");
  else if (!EMAIL_REGEX.test(body.email)) errors.push("Invalid email format");

  if (!body.submissionId) errors.push("Submission ID is required");

  return errors;
}

// ===== MAIN HANDLER =====
module.exports = async (req, res) => {
  // Set CORS headers
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle CORS preflight
  if (handleCORS(req, res)) return;

  // Only POST allowed
  if (req.method !== "POST") {
    return res.status(STATUS_CODES.BAD_REQUEST).json({
      success: false,
      error: "Only POST method is allowed",
    });
  }

  try {
    const startTime = Date.now();
    const body = req.body || {};

    console.log("[CreatePayment] Processing payment for:", body.email);

    // ===== VALIDATE INPUT =====
    const validationErrors = validateInput(body);
    if (validationErrors.length > 0) {
      console.warn("[CreatePayment] Validation errors:", validationErrors);
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        errors: validationErrors,
      });
    }

    // ===== VERIFY SUBMISSION EXISTS =====
    console.log("[CreatePayment] Verifying submission...");
    const submissionResult = await getSubmission(body.submissionId);
    if (!submissionResult.success) {
      console.error("[CreatePayment] Submission not found:", body.submissionId);
      return res.status(STATUS_CODES.NOT_FOUND).json({
        success: false,
        error: "Submission not found. Please submit resume first.",
      });
    }

    const submission = submissionResult.data;
    if (submission.email.toLowerCase() !== body.email.toLowerCase()) {
      console.warn("[CreatePayment] Email mismatch");
      return res.status(STATUS_CODES.FORBIDDEN).json({
        success: false,
        error: "Email does not match submission",
      });
    }

    // ===== CREATE MOCK ORDER =====
    console.log("[CreatePayment] Creating mock payment order...");
    const orderId = generateMockOrderId();
    const paymentData = {
      email: body.email.toLowerCase(),
      submission_id: body.submissionId,
      razorpay_order_id: orderId,
      amount_inr: REVIEW_PRICE_INR,
      status: "PENDING",
      payment_method: "mock",
    };

    const dbResult = await createPayment(paymentData);
    if (!dbResult.success) {
      console.error("[CreatePayment] Database error:", dbResult.error);
      return res.status(STATUS_CODES.INTERNAL_ERROR).json({
        success: false,
        error: `Failed to create payment: ${dbResult.error}`,
      });
    }

    const paymentId = dbResult.data.id;
    const executionTime = Date.now() - startTime;

    console.log(
      `[CreatePayment] SUCCESS: Order ${orderId} created in ${executionTime}ms`
    );

    // ===== RETURN RESPONSE =====
    return res.status(STATUS_CODES.CREATED).json({
      success: true,
      orderId: orderId,
      paymentId: paymentId,
      amount: REVIEW_PRICE_INR,
      amountDisplay: "₹99",
      currency: "INR",
      status: "PENDING",
      email: body.email,
      executionTime: executionTime,
      message: "Mock payment order created. Ready for payment simulation.",
      nextStep: {
        endpoint: "/api/candidate/payment-webhook",
        method: "POST",
        body: {
          orderId: orderId,
          paymentId: "mock_pay_" + Date.now(),
          status: "COMPLETED", // Change to "FAILED" to test failure flow
        },
      },
      testInstructions: {
        note: "This is MOCK payment for testing. Real Razorpay integration will be added later.",
        step1: "Frontend would normally show Razorpay checkout modal here",
        step2: "User completes payment (simulated)",
        step3: "Razorpay calls webhook with payment confirmation",
        step4: "Backend analyzes resume and sends PDF email",
      },
    });
  } catch (error) {
    console.error("[CreatePayment] Unexpected error:", error);
    return res.status(STATUS_CODES.INTERNAL_ERROR).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
};
