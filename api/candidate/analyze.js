// screencv/api/candidate/analyze.js
// Analyze resume with enhanced recruiter logic + store all costs & new fields
// ✅ EXPORTS: handler (for Vercel) + analyzeResumeVsJob (for webhook)

const { supabase } = require("../../lib/supabase-client");
const { generateRecruiterAnalysis } = require("../../lib/claude-scoring");
const { generateRecruiterReportHTML, replaceFeedbackToken } = require("../../lib/html-generator-recruiter");
const { sendEmailWithPDF } = require("../../lib/nodemailer-sender");

/**
 * Logging system that captures logs for both server + client
 */
class Logger {
  constructor() {
    this.logs = [];
  }
  log(msg) {
    const timestamp = new Date().toISOString().split('T')[1].split('Z')[0];
    const logEntry = `[${timestamp}] ${msg}`;
    this.logs.push(logEntry);
    console.log(logEntry);  // Also log to server
  }
  getLogs() {
    return this.logs;
  }
}

/**
 * ✅ CORE FUNCTION: Analyze resume vs job description
 * Called by: webhook, verify endpoint, and direct POST requests
 * Returns: { success, error, reviewId, score, logs: [...] }
 */
async function analyzeResumeVsJob(submissionId, resumeText, jobDescription, jobTitle, candidateEmail, feedbackToken, paymentData) {
  const logger = new Logger();
  
  try {
    logger.log(`[analyzeResumeVsJob] Starting analysis for submission ${submissionId}...`);
    if (paymentData) {
      logger.log(`[analyzeResumeVsJob] Payment - Order: ${paymentData.orderId}, Payment: ${paymentData.paymentId}`);
    }

    // Call enhanced Claude scoring with ALL NEW FIELDS
    logger.log(`[analyzeResumeVsJob] Calling Claude API for analysis...`);
    logger.log(`[analyzeResumeVsJob] Resume length: ${resumeText.length} chars, Job desc length: ${jobDescription.length} chars`);
    
    let analysisResult;
    try {
      analysisResult = await generateRecruiterAnalysis(resumeText, jobDescription);
      logger.log(`[analyzeResumeVsJob] ✅ Claude API response received`);
    } catch (claudeError) {
      logger.log(`[analyzeResumeVsJob] ❌ Claude API ERROR: ${claudeError.message}`);
      logger.log(`[analyzeResumeVsJob] Error type: ${claudeError.constructor.name}`);
      return {
        success: false,
        error: `Claude API failed: ${claudeError.message}`,
        logs: logger.getLogs()
      };
    }

    if (!analysisResult.success) {
      logger.log(`[analyzeResumeVsJob] ❌ Analysis failed: ${analysisResult.error}`);
      return {
        success: false,
        error: `Analysis failed: ${analysisResult.error}`,
        logs: logger.getLogs()
      };
    }

    const analysisData = analysisResult.data;
    logger.log(`[analyzeResumeVsJob] ✅ Analysis complete. Score: ${analysisData.overall_score || analysisData.os}/100`);

    // Extract all fields - map abbreviated keys to full names
    const executiveSummary = analysisData.executive_summary || analysisData.es;
    const jobMatchAnalysis = analysisData.job_match_analysis || analysisData.jma;
    const experienceAssessment = analysisData.experience_assessment || analysisData.exp;
    const careerProgression = analysisData.career_progression || analysisData.cp;
    const achievementScore = analysisData.achievement_score || analysisData.as;
    const scoringLogic = analysisData.scoring_logic;
    const matchCategory = analysisData.match_category;
    const categoryEvidence = analysisData.category_evidence;
    const improvements = analysisData.improvements;
    const skills = analysisData.skills || analysisData.sk;
    const concerns = analysisData.concerns || analysisData.con;
    const interviewQuestions = analysisData.interview_questions || analysisData.iq;
    const interviewRecommendation = analysisData.interview_recommendation || analysisData.ir || "CONSIDER";
    const overallScore = analysisData.overall_score || analysisData.os;

    // Handle skills mapping (abbreviated or full names)
    let skillsData = skills;
    if (skills && skills.s) {
      // Abbreviated format from Claude
      skillsData = {
        strong: skills.s || [],
        moderate: skills.m || [],
        weak: skills.w || []
      };
    } else if (skills && !skills.strong) {
      // Neither format found, use defaults
      skillsData = { strong: [], moderate: [], weak: [] };
    }

    // Extract token costs from analysis
    const analysisTokens = analysisData.tokens || {};
    const inputTokens = analysisTokens.input || 0;
    const outputTokens = analysisTokens.output || 0;
    const analysisTokensTotal = analysisTokens.total || inputTokens + outputTokens;
    const costUSD = analysisTokens.costUsd || 0;
    const costINR = analysisTokens.costInr || 0;

    logger.log(`[analyzeResumeVsJob] Tokens - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${analysisTokensTotal}`);
    logger.log(`[analyzeResumeVsJob] Cost - USD: $${costUSD.toFixed(6)}, INR: ₹${costINR.toFixed(2)}`);

    // Extract candidate name from resume (usually first line or first few words)
    let candidateName = "Candidate";
    if (resumeText && resumeText.length > 0) {
      const firstLine = resumeText.split('\n')[0].trim();
      // If first line looks like a name (not too long, no special chars)
      if (firstLine.length > 0 && firstLine.length < 100 && !firstLine.includes('@') && !firstLine.includes('http')) {
        candidateName = firstLine;
      }
    }

    logger.log(`[analyzeResumeVsJob] Extracted candidate name: ${candidateName}`);

    // Generate HTML report with ALL NEW FIELDS
    logger.log(`[analyzeResumeVsJob] Generating HTML report...`);
    let htmlContent = await generateRecruiterReportHTML({
      candidateName,
      jobTitle,
      overallScore,
      executiveSummary,
      jobMatchAnalysis,
      experienceAssessment,
      skills: skillsData,
      careerProgression,
      achievementScore,
      scoringLogic,
      matchCategory,
      categoryEvidence,
      scoringBreakdown: analysisData.scoring_breakdown || {},
      top5Improvements: improvements || [],
      concerns,
      interviewQuestions,
      interviewRecommendation,
    });

    // ✅ INJECT FEEDBACK TOKEN INTO EMAIL HTML
    if (feedbackToken) {
      htmlContent = replaceFeedbackToken(htmlContent, feedbackToken);
      logger.log("[analyzeResumeVsJob] ✅ Feedback token injected into email");
    }

    // Store review in database with ALL NEW FIELDS
    logger.log("[analyzeResumeVsJob] Storing review in database...");
    const { data: reviewData, error: reviewError } = await supabase
      .from("candidate_reviews")
      .insert([
        {
          submission_id: submissionId,
          email: candidateEmail,
          candidate_name: candidateName,
          resume_text: resumeText,
          feedback_token: feedbackToken,
          job_description: jobDescription,
          executive_summary: executiveSummary,
          experience_assessment: experienceAssessment,
          career_progression: careerProgression,
          skills_strong: skillsData.strong || [],
          skills_moderate: skillsData.moderate || [],
          skills_weak: skillsData.weak || [],
          achievement_score: achievementScore,
          scoring_logic: scoringLogic,
          match_category: matchCategory,
          category_evidence: categoryEvidence,
          improvements: JSON.stringify(improvements || []),
          job_match_analysis: JSON.stringify(jobMatchAnalysis || []),
          concerns: concerns || [],
          interview_questions: interviewQuestions || [],
          score: overallScore,
          overall_score: overallScore,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          analysis_cost_usd: costUSD,
          analysis_cost_inr: costINR,
          html_report: htmlContent,
          language: "English",
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (reviewError) {
      logger.log(`[analyzeResumeVsJob] ❌ Database error: ${reviewError.message}`);
      return {
        success: false,
        error: "Failed to store review",
        logs: logger.getLogs()
      };
    }

    const reviewId = reviewData[0]?.id;
    logger.log(`[analyzeResumeVsJob] ✅ Review stored with ID: ${reviewId}`);

    // ✅ SEND EMAIL WITH HTML ATTACHMENT
    try {
      logger.log(`[analyzeResumeVsJob] ========================================`);
      logger.log(`[analyzeResumeVsJob] Email sending pipeline starting...`);
      logger.log(`[analyzeResumeVsJob] Recipient: ${candidateEmail}`);
      logger.log(`[analyzeResumeVsJob] Subject: Your ScreenCV Report - ${jobTitle} Analysis`);
      logger.log(`[analyzeResumeVsJob] HTML content length: ${htmlContent.length} chars`);
      logger.log(`[analyzeResumeVsJob] ========================================`);
      
      // Create custom email body
      // ✅ Build email with payment tracking details
      const paymentDetails = paymentData ? `
        <div style="background: #f0f4f8; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="font-size: 12px; color: #555; margin: 5px 0;"><strong>Payment Confirmation:</strong></p>
          <p style="font-size: 12px; color: #555; margin: 5px 0;">Order ID: <code style="background: #fff; padding: 2px 5px; border-radius: 3px;">${paymentData.orderId}</code></p>
          <p style="font-size: 12px; color: #555; margin: 5px 0;">Payment ID: <code style="background: #fff; padding: 2px 5px; border-radius: 3px;">${paymentData.paymentId}</code></p>
          <p style="font-size: 12px; color: #555; margin: 5px 0;">Amount: <strong>₹${paymentData.amount}</strong></p>
          <p style="font-size: 12px; color: #555; margin: 5px 0;">Status: <strong style="color: #10b981;">✅ Confirmed</strong></p>
        </div>
      ` : '';

      const emailBody = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi,</p>
          
          <p style="font-size: 14px; margin-bottom: 20px;">
            Thank you for using the <strong>ScreenCV</strong> services.
          </p>
          
          ${paymentDetails}
          
          <p style="font-size: 14px; margin-bottom: 20px;">
            Attached is the HTML file that can be reviewed and downloaded to help you prepare for this job interview.
          </p>
          
          <p style="font-size: 14px; margin-bottom: 20px;">
            Please feel free to <a href="${process.env.FEEDBACK_BASE_URL || 'http://localhost:3000'}/feedback?token=${feedbackToken}" style="color: #667eea; text-decoration: none; font-weight: bold;">rate us</a> and also provide us with your valuable feedback.
          </p>
          
          <p style="font-size: 14px; margin-bottom: 30px;">
            Regards,<br>
            <strong>Team ScreenCV</strong>
          </p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          
          <p style="font-size: 12px; color: #666; text-align: center;">
            © 2026 ScreenCV. All rights reserved.
          </p>
        </div>
      `;
      
      // ✅ Build email subject with payment tracking
      const emailSubject = paymentData 
        ? `ScreenCV Report - ${jobTitle} [Order: ${paymentData.orderId} | Payment: ${paymentData.paymentId}]`
        : `Your ScreenCV Report - ${jobTitle} Analysis`;
      
      // Convert HTML report to buffer for attachment
      const htmlBuffer = Buffer.from(htmlContent, 'utf-8');
      const fileName = `ScreenCV_Analysis_${candidateName.replace(/\s+/g, '_')}_${new Date().getTime()}.html`;
      
      await sendEmailWithPDF({
        to: candidateEmail,
        subject: emailSubject,
        html: emailBody,
        htmlBuffer: htmlBuffer,
        htmlFilename: fileName
      });

      logger.log("[analyzeResumeVsJob] ✅ EMAIL SENT SUCCESSFULLY");

      // ✅ UPDATE SUBMISSION: Mark email as sent + save candidate name
      const { error: updateError } = await supabase
        .from("candidate_submissions")
        .update({
          email_sent: true,
          candidate_name: candidateName,  // ✅ ADD CANDIDATE NAME TO SUBMISSIONS TABLE
          feedback_token: feedbackToken,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      if (updateError) {
        logger.log(`[analyzeResumeVsJob] ❌ Failed to update submission: ${updateError.message}`);
      } else {
        logger.log("[analyzeResumeVsJob] ✅ Submission updated - email_sent=true, candidate_name saved");
      }

      logger.log("[analyzeResumeVsJob] ✅ Analysis pipeline complete");

      // ✅ Return success
      return {
        success: true,
        message: 'Analysis completed and email sent',
        reviewId: reviewId,
        score: overallScore,
        logs: logger.getLogs(),
        aiCost: {
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          estimatedCostINR: costINR.toFixed(2)
        }
      };

    } catch (emailError) {
      logger.log("[analyzeResumeVsJob] ✗ EMAIL SENDING FAILED!");
      logger.log(`[analyzeResumeVsJob] Error type: ${emailError.constructor.name}`);
      logger.log(`[analyzeResumeVsJob] Error message: ${emailError.message}`);
      
      // Return partial success - analysis worked, email failed
      return {
        success: false,
        error: 'Analysis successful but email delivery failed',
        reviewId: reviewId,
        score: overallScore,
        logs: logger.getLogs(),
        emailError: emailError.message
      };
    }

  } catch (error) {
    logger.log(`[analyzeResumeVsJob] ✗ Unexpected error: ${error.message}`);
    return {
      success: false,
      error: error.message || 'Analysis failed',
      logs: logger.getLogs()
    };
  }
}

/**
 * API Handler for direct POST requests
 * Called by: /api/candidate/analyze endpoint
 */
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { submission_id, resume_text, job_description, job_title, email, feedback_token } = req.body;

  if (!submission_id || !resume_text || !job_description || !job_title || !email) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['submission_id', 'resume_text', 'job_description', 'job_title', 'email']
    });
  }

  try {
    console.log(`\n[handler] Starting analysis for submission: ${submission_id}`);

    // Call analyzeResumeVsJob
    const result = await analyzeResumeVsJob(
      submission_id,
      resume_text,
      job_description,
      job_title,
      email,
      feedback_token,
      null   // paymentInfo (direct API call, not from webhook)
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error || 'Analysis failed',
        logs: result.logs
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('[handler] Unexpected error:', error);
    return res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
}

// ✅ EXPORT BOTH: handler for Vercel + analyzeResumeVsJob for webhook/verify
module.exports = {
  handler,              // Vercel serverless handler
  analyzeResumeVsJob,   // For webhook + verify endpoint
};
