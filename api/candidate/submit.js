// screencv/api/candidate/submit.js
// Endpoint 1: Capture form submission
// Accepts: resume file, job description, email
// Returns: submissionId (used for payment)
// Flow: Extract text → Detect language → Save to DB → Return submissionId

const { extractTextFromFile } = require("../../lib/file-extraction");
const { detectLanguage, sanitizeResumeText } = require("../../lib/claude-scoring");
const { createSubmission } = require("../../lib/supabase-client");
const { CORS_HEADERS, STATUS_CODES, EMAIL_REGEX } = require("../../lib/constants");
const { supabase } = require("../../lib/supabase-client");

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

  if (!body.resumeData) errors.push("Resume data is required");
  if (!body.resumeFilename) errors.push("Resume filename is required");

  if (!body.jobTitle) errors.push("Job title is required");
  if (!body.jobDescription) errors.push("Job description is required");

  return errors;
}

module.exports = { submitResume: async (req, res) => {
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
    // 🔴 NEW: CHECK TOOL STATUS FIRST
    console.log("[Submit] Checking tool status...");
    const { data: toolData } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "tool_active")
      .single();

    const toolActive = toolData?.setting_value === "true";
    
    if (!toolActive) {
      console.log("[Submit] ❌ TOOL IS INACTIVE - Rejecting submission");
      return res.status(503).json({
        success: false,
        error: "ScreenCV is currently under maintenance. Please try again later.",
        maintenanceMode: true
      });
    }
    
    console.log("[Submit] ✅ Tool is active - Processing submission");

    const startTime = Date.now();
    const body = req.body || {};

    console.log("[Submit] Received submission from:", body.email);

    // ===== VALIDATE INPUT =====
    const validationErrors = validateInput(body);
    if (validationErrors.length > 0) {
      console.warn("[Submit] Validation errors:", validationErrors);
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        errors: validationErrors,
      });
    }

    // ===== EXTRACT RESUME TEXT =====
    console.log("[Submit] Extracting text from resume...");
    let resumeText;
    try {
      const extractionResult = await extractTextFromFile(body.resumeData, body.resumeFilename);
      // extractTextFromFile returns { success, text, length, format }
      if (!extractionResult.success || !extractionResult.text) {
        throw new Error("Extraction returned invalid result");
      }
      resumeText = extractionResult.text;
      console.log(`[Submit] ✅ Extraction success (${extractionResult.format}): ${extractionResult.length} chars`);
    } catch (extractError) {
      console.error("[Submit] Extraction error:", extractError.message);
      return res.status(STATUS_CODES.SERVER_ERROR).json({
        success: false,
        error: "Failed to extract text from resume: " + extractError.message,
      });
    }

    // ===== SANITIZE RESUME TEXT =====
    resumeText = sanitizeResumeText(resumeText);
    console.log("[Submit] Resume text sanitized");

    // ===== DETECT LANGUAGE =====
    const language = await detectLanguage(resumeText);
    console.log("[Submit] Language detected:", language);

    // ===== CREATE SUBMISSION RECORD =====
    console.log("[Submit] Creating submission record...");
    const submission = await createSubmission({
      candidate_email: body.email,
      candidate_name: body.name || null,
      resume_text: resumeText,
      resume_filename: body.resumeFilename,
      job_title: body.jobTitle,
      job_description: body.jobDescription,
      language: language,
      payment_status: "pending",
    });

    if (!submission || !submission.id) {
      throw new Error("Failed to create submission record");
    }

    console.log("[Submit] ✅ Submission created:", submission.id);

    const duration = Date.now() - startTime;
    console.log(`[Submit] ✅ Complete in ${duration}ms`);

    res.status(STATUS_CODES.OK).json({
      success: true,
      submissionId: submission.id,
      message: "Resume received. Please proceed to payment.",
    });

  } catch (error) {
    console.error("[Submit] Error:", error.message);
    res.status(STATUS_CODES.SERVER_ERROR).json({
      success: false,
      error: "Server error: " + error.message,
    });
  }
}};