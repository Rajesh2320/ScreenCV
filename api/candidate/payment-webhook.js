// screencv/api/candidate/payment-webhook.js
// Endpoint 3: Payment webhook (mock or Razorpay)
// Workflow: Verify payment → Get submission → Score resume → Generate PDF → Send email
// This is the MAIN endpoint where analysis happens (after payment confirmed)

const {
  getPayment,
  getPaymentByOrderId,
  getSubmission,
  updatePaymentStatus,
  createReview,
  createReport,
  updateReport,
  upsertSession,
  logTokenUsage,
} = require("../../lib/supabase-client");
const { scoreResume, generatePremiumInsights, sanitizeResumeText } = require("../../lib/claude-scoring");
const { generatePDFReport } = require("../../lib/pdf-generator");
const { sendReportEmailMock } = require("../../lib/emailjs-sender");
const {
  CORS_HEADERS,
  STATUS_CODES,
  CLAUDE_INPUT_COST_PER_M,
  CLAUDE_OUTPUT_COST_PER_M,
} = require("../../lib/constants");

// ===== CORS HANDLER =====
function handleCORS(req, res) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeader("Content-Type", "application/json").end("ok");
    return true;
  }
  return false;
}

// ===== VALIDATE PAYMENT =====
async function verifyPayment(orderId, paymentId) {
  // For mock payments, just check if order exists
  console.log("[Webhook] Verifying payment:", orderId);

  // In real Razorpay integration, verify signature here
  // For now, just check if order ID is valid
  if (!orderId || !orderId.startsWith("mock_order_")) {
    throw new Error("Invalid order ID");
  }

  return true;
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

  const startTime = Date.now();

  try {
    const body = req.body || {};
    console.log("[Webhook] Received webhook for order:", body.orderId);

    // ===== VALIDATE INPUT =====
    if (!body.orderId || !body.status) {
      console.warn("[Webhook] Missing orderId or status");
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        error: "orderId and status are required",
      });
    }

    // ===== VERIFY PAYMENT =====
    try {
      await verifyPayment(body.orderId, body.paymentId);
    } catch (err) {
      console.error("[Webhook] Payment verification failed:", err.message);
      return res.status(STATUS_CODES.FORBIDDEN).json({
        success: false,
        error: `Payment verification failed: ${err.message}`,
      });
    }

    // ===== CHECK PAYMENT STATUS =====
    if (body.status !== "COMPLETED") {
      console.log("[Webhook] Payment not completed, status:", body.status);

      // Find and update payment record
      const paymentResult = await getPaymentByOrderId(body.orderId);
      if (paymentResult.success && paymentResult.data) {
        await updatePaymentStatus(paymentResult.data.id, "FAILED");
      }

      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        error: `Payment status is ${body.status}, not COMPLETED`,
      });
    }

    // ===== GET PAYMENT RECORD =====
    console.log("[Webhook] Fetching payment record for orderId:", body.orderId);
    const paymentResult = await getPaymentByOrderId(body.orderId);
    if (!paymentResult.success || !paymentResult.data) {
      console.error("[Webhook] Payment not found:", body.orderId);
      return res.status(STATUS_CODES.NOT_FOUND).json({
        success: false,
        error: "Payment record not found",
        details: paymentResult.error || "No payment found in database"
      });
    }

    // ===== UPDATE PAYMENT STATUS TO COMPLETED =====
    console.log("[Webhook] Updating payment status...");
    const payment = paymentResult.data;
    await updatePaymentStatus(
      payment.id,
      "COMPLETED",
      body.paymentId || "mock_pay_" + Date.now()
    );

    // ===== GET SUBMISSION DETAILS =====
    console.log("[Webhook] Fetching submission...");
    const submissionResult = await getSubmission(payment.submission_id);
    if (!submissionResult.success) {
      console.error("[Webhook] Submission not found");
      return res.status(STATUS_CODES.NOT_FOUND).json({
        success: false,
        error: "Submission not found",
      });
    }

    const submission = submissionResult.data;
    console.log("[Webhook] Submission found:", submission.id);

    // ===== SCORE RESUME =====
    console.log("[Webhook] Scoring resume with Claude...");
    const scoringResult = await scoreResume(
      submission.resume_text,
      submission.job_description
    );
    if (!scoringResult.success) {
      console.error("[Webhook] Scoring failed:", scoringResult.error);
      return res.status(STATUS_CODES.INTERNAL_ERROR).json({
        success: false,
        error: `Resume scoring failed: ${scoringResult.error}`,
      });
    }

    const scoring = scoringResult.data;
    console.log(`[Webhook] Score: ${scoring.score}, Tokens: ${scoring.tokens.total}`);

    // ===== GENERATE PREMIUM INSIGHTS =====
    console.log("[Webhook] Generating premium insights...");
    const premiumResult = await generatePremiumInsights(
      submission.resume_text,
      submission.job_description,
      scoring.interview_questions
    );
    
    let premiumInsights = null;
    if (premiumResult.success) {
      premiumInsights = premiumResult.data;
      console.log("[Webhook] Premium insights generated");
      console.log("\n========== PREMIUM INSIGHTS GENERATED ==========");
      
      if (premiumInsights.resumeRewriteSuggestions) {
        console.log("\n✏️ RESUME REWRITE SUGGESTIONS:");
        for (let i = 0; i < premiumInsights.resumeRewriteSuggestions.length; i++) {
          const sugg = premiumInsights.resumeRewriteSuggestions[i];
          console.log(`\n  ${i + 1}. ${sugg.section}`);
          console.log(`     Current: "${sugg.current}"`);
          console.log(`     Suggested: "${sugg.suggested}"`);
          console.log(`     Keyword: "${sugg.keywordToAdd}"`);
        }
      }

      if (premiumInsights.interviewPrepGuide) {
        console.log("\n🎤 INTERVIEW PREP GUIDE:");
        for (let i = 0; i < premiumInsights.interviewPrepGuide.length; i++) {
          const prep = premiumInsights.interviewPrepGuide[i];
          console.log(`\n  Q${i + 1}: ${prep.question}`);
          console.log(`     Think about: ${prep.thinkAbout}`);
          console.log(`     Answer: "${prep.suggestedAnswer}"`);
          console.log(`     Keywords: ${prep.keywords.join(", ")}`);
        }
      }

      if (premiumInsights.networkRecommendations) {
        console.log("\n🤝 NETWORK RECOMMENDATIONS:");
        for (let i = 0; i < premiumInsights.networkRecommendations.length; i++) {
          const net = premiumInsights.networkRecommendations[i];
          console.log(`\n  ${i + 1}. ${net.role}`);
          console.log(`     Why: ${net.why}`);
          console.log(`     Where: ${net.whereToFind}`);
        }
      }
      
      console.log("\n================================================\n");
      
      // Log premium tokens
      await logTokenUsage({
        submission_id: submission.id,
        payment_id: payment.id,
        api: "claude_premium_insights",
        model: "claude-haiku-4-5-20251001",
        input_tokens: premiumResult.tokens.input,
        output_tokens: premiumResult.tokens.output,
        cost_usd: premiumResult.tokens.cost,
      });
    } else {
      console.warn("[Webhook] Premium insights failed, continuing without them");
    }

    // ===== CREATE REVIEW RECORD =====
    console.log("[Webhook] Creating review record...");
    const reviewData = {
      payment_id: paymentResult.id,
      submission_id: submission.id,
      email: submission.email,
      candidate_name: submission.candidate_name,
      resume_text: submission.resume_text,
      job_title: submission.job_title,
      job_description: submission.job_description,
      job_url: submission.job_url,
      score: scoring.score,
      scoring_reason: scoring.reason,
      green_flags: scoring.green_flags,
      red_flags: scoring.red_flags,
      interview_questions: scoring.interview_questions,
      resume_gaps: scoring.resume_gaps,
      input_tokens: scoring.tokens.input,
      output_tokens: scoring.tokens.output,
      cost_inr: scoring.tokens.costInr,
      language: submission.language,
    };

    const reviewResult = await createReview(reviewData);
    if (!reviewResult.success) {
      console.error("[Webhook] Failed to create review:", reviewResult.error);
      return res.status(STATUS_CODES.INTERNAL_ERROR).json({
        success: false,
        error: `Failed to save review: ${reviewResult.error}`,
      });
    }

    const review = reviewResult.data;
    console.log("[Webhook] Review created:", review.id);

    // ===== GENERATE PDF REPORT =====
    console.log("[Webhook] Generating PDF report...");
    let pdfBuffer;
    try {
      pdfBuffer = await generatePDFReport({
        score: scoring.score,
        reason: scoring.reason,
        greenFlags: scoring.green_flags,
        redFlags: scoring.red_flags,
        interviewQuestions: scoring.interview_questions,
        resumeGaps: scoring.resume_gaps,
        // Premium insights
        resumeRewriteSuggestions: premiumInsights?.resumeRewriteSuggestions || [],
        interviewPrepGuide: premiumInsights?.interviewPrepGuide || [],
        networkRecommendations: premiumInsights?.networkRecommendations || [],
        // Candidate info
        candidateName: submission.candidate_name,
        email: submission.email,
        jobTitle: submission.job_title,
      });
      console.log("[Webhook] PDF generated, size:", pdfBuffer.length, "bytes");
    } catch (err) {
      console.error("[Webhook] PDF generation error:", err.message);
      // Don't fail here - continue with email
      pdfBuffer = null;
    }

    // ===== CREATE REPORT RECORD =====
    console.log("[Webhook] Creating report record...");
    const reportData = {
      review_id: review.id,
      email: submission.email,
      pdf_storage_path: `reports/${review.id}.pdf`,
      email_send_status: "PENDING",
    };

    const reportResult = await createReport(reportData);
    if (!reportResult.success) {
      console.error("[Webhook] Failed to create report:", reportResult.error);
      return res.status(STATUS_CODES.INTERNAL_ERROR).json({
        success: false,
        error: `Failed to create report: ${reportResult.error}`,
      });
    }

    const report = reportResult.data;
    console.log("[Webhook] Report created:", report.id);

    // ===== SEND EMAIL =====
    console.log("[Webhook] Sending email...");
    const emailResult = await sendReportEmailMock({
      candidateEmail: submission.email,
      candidateName: submission.candidate_name,
      score: scoring.score,
      jobTitle: submission.job_title,
      reason: scoring.reason,
      greenFlags: scoring.green_flags,
      redFlags: scoring.red_flags,
      interviewQuestions: scoring.interview_questions,
      resumeGaps: scoring.resume_gaps,
      pdfBuffer: pdfBuffer,
      pdfDownloadLink: `https://app.screencv.com/download/${report.id}`,
    });

    if (emailResult.success) {
      console.log("[Webhook] Email sent successfully");
      await updateReport(report.id, {
        email_sent_at: new Date().toISOString(),
        email_send_status: "SENT",
      });
    } else {
      console.warn("[Webhook] Email send failed:", emailResult.error);
      await updateReport(report.id, {
        email_send_status: "FAILED",
      });
    }

    // ===== UPDATE USER SESSION =====
    console.log("[Webhook] Updating user session...");
    await upsertSession(submission.email);

    // ===== LOG TOKEN USAGE =====
    console.log("[Webhook] Logging token usage...");
    await logTokenUsage({
      function_name: "payment-webhook (score-resume)",
      function_version: "v1",
      candidate_email: submission.email,
      input_tokens: scoring.tokens.input,
      output_tokens: scoring.tokens.output,
      cost_usd: scoring.tokens.costUsd,
      status: "success",
      execution_time_ms: Date.now() - startTime,
    });

    // ===== RETURN SUCCESS RESPONSE =====
    const executionTime = Date.now() - startTime;
    console.log(`[Webhook] SUCCESS - Analysis complete in ${executionTime}ms`);

    return res.status(STATUS_CODES.OK).json({
      success: true,
      reviewId: review.id,
      reportId: report.id,
      paymentId: paymentResult.id,
      score: scoring.score,
      reason: scoring.reason,
      greenFlags: scoring.green_flags,
      redFlags: scoring.red_flags,
      interviewQuestions: scoring.interview_questions,
      resumeGaps: scoring.resume_gaps,
      // Premium insights
      premiumInsights: premiumInsights ? {
        resumeRewriteSuggestions: premiumInsights.resumeRewriteSuggestions,
        interviewPrepGuide: premiumInsights.interviewPrepGuide,
        networkRecommendations: premiumInsights.networkRecommendations,
      } : null,
      email: submission.email,
      jobTitle: submission.job_title,
      emailSent: emailResult.success,
      tokens: scoring.tokens,
      executionTime: executionTime,
      message:
        "Payment confirmed! Your resume has been analyzed. Check your email for the PDF report with premium insights!",
    });
  } catch (error) {
    console.error("[Webhook] Unexpected error:", error);
    return res.status(STATUS_CODES.INTERNAL_ERROR).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
};

// ===== HELPER: Find payment by order ID =====
async function findPaymentByOrderId(orderId) {
  // This is a temporary helper - in production, use Supabase query
  // For now, we'll use the payment ID that's passed in the webhook
  console.log("[Helper] Looking for payment with orderId:", orderId);
  // Returns null - will be updated to query Supabase
  return null;
}