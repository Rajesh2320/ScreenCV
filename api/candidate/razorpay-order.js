// screencv/api/candidate/razorpay-order.js
// Create Razorpay order and store submission with SERVER-SIDE FILE EXTRACTION
//
// CHANGES
//  1. Everything the analysis needs is checked BEFORE an order is created, so
//     nobody pays for a report that cannot be produced: a readable resume of
//     at least 100 characters, a job description of at least 50 characters,
//     and a valid email address. (The old minimum was 10 characters, while the
//     analysis itself refuses anything under 100 / 50.)
//  2. The admin "maintenance" switch is now enforced here on the server.
//     Before, it was only checked by an older, unused address.
//  3. The cost of reading a scanned PDF is now saved. The code was reading
//     costUsd / costInr, but file-extraction.js returns costUSD / costINR, so
//     the cost was always recorded as 0.
//  4. Very long inputs are trimmed to the limits in constants.js.
//  5. The submission id is attached to the Razorpay order as a note, so an
//     order can be traced from the Razorpay dashboard.

const Razorpay = require("razorpay");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../../lib/supabase-client");
const { extractTextFromResume } = require("../../lib/file-extraction");
const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  EMAIL_REGEX,
  MIN_RESUME_LENGTH,
  MAX_RESUME_LENGTH,
} = require("../../lib/constants");

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// These match what the analysis itself requires (lib/claude-scoring.js)
const RESUME_MIN_CHARS = MIN_RESUME_LENGTH || 100;
const RESUME_MAX_CHARS = MAX_RESUME_LENGTH || 50000;
const JOB_DESCRIPTION_MIN_CHARS = 50;
const JOB_DESCRIPTION_MAX_CHARS = 20000;
const JOB_TITLE_MAX_CHARS = 200;

// ✅ SANITIZE TEXT - Remove null characters and invalid Unicode
function sanitizeText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\0/g, "")
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

// The admin dashboard's maintenance switch. Only an explicit "false" blocks
// orders; if the setting cannot be read, the tool stays open.
async function isToolInMaintenance() {
  try {
    const { data } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "tool_active")
      .single();
    return data?.setting_value === "false";
  } catch (err) {
    console.warn("[Razorpay] Could not read tool status:", err.message);
    return false;
  }
}

async function createRazorpayOrder(req, res) {
  try {
    const { jobTitle, jobDescription, feedbackToken } = req.body || {};
    const candidateEmail = String(req.body?.candidateEmail || "").trim();
    const resumeFile = req.files?.resume;

    // Validate inputs
    if (!candidateEmail || !jobTitle || !jobDescription || !resumeFile) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: candidateEmail, jobTitle, jobDescription, resume file",
      });
    }

    if (!EMAIL_REGEX.test(candidateEmail)) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid email address. Your report will be sent there.",
      });
    }

    if (await isToolInMaintenance()) {
      console.log("[Razorpay] ⏸️ Tool is in maintenance mode - order refused");
      return res.status(503).json({
        success: false,
        error: "We are carrying out maintenance at the moment. Please try again a little later.",
        maintenanceMode: true,
      });
    }

    // ✅ SANITIZE AND CHECK THE TYPED FIELDS FIRST (no cost, no file reading yet)
    const sanitizedJobTitle = sanitizeText(jobTitle).slice(0, JOB_TITLE_MAX_CHARS);
    const sanitizedJobDescription = sanitizeText(jobDescription).slice(0, JOB_DESCRIPTION_MAX_CHARS);

    if (!sanitizedJobTitle) {
      return res.status(400).json({
        success: false,
        error: "Please enter the job title.",
      });
    }

    if (sanitizedJobDescription.length < JOB_DESCRIPTION_MIN_CHARS) {
      return res.status(400).json({
        success: false,
        error: `The job description is too short to analyse. Please paste the full job description (at least ${JOB_DESCRIPTION_MIN_CHARS} characters).`,
      });
    }

    console.log(`[Razorpay] Creating order for ${candidateEmail}...`);

    // ✅ EXTRACT TEXT FROM RESUME SERVER-SIDE
    console.log(`[Razorpay] Extracting text from resume: ${resumeFile.name}`);
    
    const extractResult = await extractTextFromResume(
      resumeFile.data,
      resumeFile.name
    );

    if (!extractResult.success) {
      console.error("[Razorpay] Resume extraction failed:", extractResult.error);
      
      // Log incident
      await supabase.from("payment_incidents").insert({
        incident_type: "RESUME_EXTRACTION_FAILED",
        email: candidateEmail,
        amount: 99,
        description: `Failed to extract resume: ${extractResult.error}`,
        status: "unresolved",
      });

      return res.status(400).json({
        success: false,
        error: extractResult.error || "Failed to extract resume text",
        action: "RETRY_UPLOAD",
      });
    }

    console.log(`[Razorpay] ✅ Resume extracted (${extractResult.text.length} chars, method: ${extractResult.method})`);

    // ✅ EXTRACTION COST (only when Claude had to read a scanned PDF)
    const extractionTokens = extractResult.tokens || 0;
    const extractionCostUSD = extractResult.costUSD ?? extractResult.costUsd ?? 0;
    const extractionCostINR = extractResult.costINR ?? extractResult.costInr ?? 0;
    if (extractionCostINR > 0) {
      console.log(`[Razorpay] Extraction cost - USD: $${extractionCostUSD.toFixed(6)}, INR: ₹${extractionCostINR.toFixed(2)}`);
    }

    const sanitizedResumeText = sanitizeText(extractResult.text).slice(0, RESUME_MAX_CHARS);

    // The analysis needs a real resume. Stop here, before any payment, if we could not read one.
    if (sanitizedResumeText.length < RESUME_MIN_CHARS) {
      console.warn(`[Razorpay] Resume too short after extraction: ${sanitizedResumeText.length} chars`);
      return res.status(400).json({
        success: false,
        error: "We could not read enough text from this resume to analyse it. Please upload a text-based PDF or a .docx file.",
        action: "RETRY_UPLOAD",
      });
    }

    // Generate submission ID
    const submissionId = uuidv4();

    // Create Razorpay order
    const orderData = {
      amount: 9900, // ₹99 in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: { submission_id: submissionId },
    };

    const order = await razorpay.orders.create(orderData);

    if (!order || !order.id) {
      throw new Error("Failed to create Razorpay order");
    }

    console.log(`[Razorpay] ✅ Order created: ${order.id}`);

    // Store submission with EXTRACTED and SANITIZED text + EXTRACTION COST
    const { error: insertError } = await supabase
      .from("candidate_submissions")
      .insert([
        {
          id: submissionId,
          email: candidateEmail,
          job_title: sanitizedJobTitle,
          job_description: sanitizedJobDescription,
          resume_text: sanitizedResumeText,
          resume_filename: resumeFile.name,
          razorpay_order_id: order.id,
          payment_status: "pending",
          feedback_token: feedbackToken,
          extraction_tokens: extractionTokens,
          extraction_cost_usd: extractionCostUSD,
          extraction_cost_inr: extractionCostINR,
          created_at: new Date().toISOString(),
        },
      ]);

    if (insertError) {
      console.error("[Razorpay] Database error:", insertError);

      // Log incident
      await supabase.from("payment_incidents").insert({
        incident_type: "ORDER_CREATION_FAILED",
        razorpay_order_id: order.id,
        email: candidateEmail,
        amount: 99,
        description: `Failed to store submission: ${insertError.message}`,
        status: "unresolved",
      });

      return res.status(500).json({
        success: false,
        error: "Failed to create submission",
        action: "CONTACT_SUPPORT",
      });
    }

    console.log(
      `[Razorpay] ✅ Submission stored: ${submissionId} with order ${order.id}`
    );

    // Return order + submission ID to frontend
    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      submissionId: submissionId,
      razorpayKey: RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("[Razorpay] Error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create payment order",
      action: "CONTACT_SUPPORT",
    });
  }
}

module.exports = { createRazorpayOrder };
