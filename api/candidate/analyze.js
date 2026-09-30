// screencv/api/candidate/analyze.js
// Analyze resume with enhanced recruiter logic + store all costs & new fields
// ✅ CORRECTED: Returns status and rethrows errors for proper error handling

const { supabase } = require("../../lib/supabase-client");
const { generateRecruiterAnalysis } = require("../../lib/claude-scoring");
const { generateRecruiterReportHTML, replaceFeedbackToken } = require("../../lib/html-generator-recruiter");
const { sendEmailWithPDF } = require("../../lib/nodemailer-sender");
const { FEEDBACK_BASE_URL } = require("../../lib/constants");

async function analyzeResumeVsJob(submissionId, resumeText, jobDescription, jobTitle, candidateEmail, feedbackToken, paymentData) {
  try {
    console.log(`[Analyze] Starting analysis for submission ${submissionId}...`);
    if (paymentData) {
      console.log(`[Analyze] Payment - Order: ${paymentData.orderId}, Payment: ${paymentData.paymentId}`);
    }

    // Call enhanced Claude scoring with ALL NEW FIELDS
    const analysisResult = await generateRecruiterAnalysis(resumeText, jobDescription);

    if (!analysisResult.success) {
      console.error("[Analyze] Analysis failed:", analysisResult.error);
      throw new Error(`Analysis failed: ${analysisResult.error}`);
    }

    const analysisData = analysisResult.data;
    console.log(`[Analyze] ✅ Analysis complete. Score: ${analysisData.overall_score || analysisData.os}/100`);

    // Extract all fields - map abbreviated keys to full names
    // ✅ CANDIDATE NAME FROM CLAUDE (more reliable than parsing resume)
    const candidateName = analysisData.candidate_name || analysisData.cn || "Candidate";
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

    console.log(`[Analyze] Candidate name from Claude: ${candidateName}`);

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

    console.log(`[Analyze] Tokens - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${analysisTokensTotal}`);
    console.log(`[Analyze] Cost - USD: $${costUSD.toFixed(6)}, INR: ₹${costINR.toFixed(2)}`);

    // Generate HTML report with ALL NEW FIELDS
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
      console.log("[Analyze] Feedback token injected into email");
    }

    // Store review in database with ALL NEW FIELDS
    console.log("[Analyze] Storing review in database...");
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
      console.error("[Analyze] Database error:", reviewError);
      throw new Error("Failed to store review");
    }

    const reviewId = reviewData[0]?.id;
    console.log(`[Analyze] ✅ Review stored with ID: ${reviewId}`);

    // ✅ SEND EMAIL WITH HTML ATTACHMENT
    try {
      console.log(`[Analyze] ========================================`);
      console.log(`[Analyze] Email sending pipeline starting...`);
      console.log(`[Analyze] Recipient: ${candidateEmail}`);
      console.log(`[Analyze] Subject: Your ScreenCV Report - ${jobTitle} Analysis`);
      console.log(`[Analyze] HTML content length: ${htmlContent.length} chars`);
      console.log(`[Analyze] ========================================`);
      
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
            Please feel free to <a href="${FEEDBACK_BASE_URL}/feedback?token=${feedbackToken}" style="color: #667eea; text-decoration: none; font-weight: bold;">rate us</a> and also provide us with your valuable feedback.
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

      console.log("[Analyze] ✅ EMAIL SENT SUCCESSFULLY");

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
        console.error("[Analyze] ❌ Failed to update submission:", updateError);
      } else {
        console.log("[Analyze] ✅ Submission updated - email_sent=true, candidate_name saved");
      }

      console.log("[Analyze] ✅ Submission marked as completed");
    } catch (emailError) {
      console.error("[Analyze] ✗ EMAIL SENDING FAILED!");
      console.error("[Analyze] Error type:", emailError.constructor.name);
      console.error("[Analyze] Error message:", emailError.message);
      console.error("[Analyze] Error details:", emailError);
      console.error("[Analyze] Note: Analysis was successful, but candidate will not receive email");
      // Don't fail the entire request if email fails
    }

    console.log("[Analyze] ✅ Analysis pipeline complete");

    // ✅ RETURN SUCCESS STATUS
    return {
      success: true,
      message: "Analysis completed successfully",
      submissionId: submissionId,
      reviewId: reviewId,
    };

  } catch (error) {
    console.error("[Analyze] ❌ Unexpected error:", error);
    console.error("[Analyze] Error type:", error.constructor.name);
    console.error("[Analyze] Error message:", error.message);
    console.error("[Analyze] Full error:", error);
    
    // ✅ RETHROW error so caller knows analysis failed
    throw error;
  }
}

module.exports = { analyzeResumeVsJob };
