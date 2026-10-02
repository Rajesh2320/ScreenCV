// screencv/api/candidate/analyze.js
// Core logic: Call Claude, save to DB, send email
//
// CHANGES
//  1. handler() no longer trusts the request body. It takes only submission_id,
//     loads the submission from the DB, requires payment_status "captured",
//     and refuses if a review already exists.
//  2. email_sent is only set to true when the email was actually sent, and the
//     result reports emailSent / emailError to the caller.
//  3. A missing or non-numeric score from Claude is a failure, not a score of 0.
//  4. Failures use console.error so they show up as errors in Vercel logs.
//  5. Job title is escaped before going into the email HTML; the attachment
//     filename is sanitised.
//  6. Email wording updated: the "rate us" link is removed (the rating page is
//     not live yet) and the customer is asked to reply with feedback instead.

const { supabase } = require("../../lib/supabase-client");
const { generateRecruiterAnalysis } = require("../../lib/claude-scoring");
const { generateRecruiterReportHTML, replaceFeedbackToken } = require("../../lib/html-generator-recruiter");
const { sendEmailWithPDF } = require("../../lib/nodemailer-sender");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

async function analyzeResumeVsJob(submissionId, resumeText, jobDescription, jobTitle, candidateEmail, feedbackToken, paymentData) {
  try {
    console.log(`[ANALYZE] Starting for submission: ${submissionId}`);

    // Call Claude
    console.log(`[ANALYZE] Calling Claude API...`);
    const analysisResult = await generateRecruiterAnalysis(resumeText, jobDescription);

    if (!analysisResult || !analysisResult.success) {
      const reason = (analysisResult && analysisResult.error) || "No response from analysis";
      console.error(`[ANALYZE] Claude API FAILED: ${reason}`);
      return { success: false, error: reason };
    }

    const analysisData = analysisResult.data || {};
    const overallScore = Number(analysisData.overall_score);
    if (analysisData.overall_score === undefined || analysisData.overall_score === null || !Number.isFinite(overallScore)) {
      console.error(`[ANALYZE] Claude response has no usable overall_score: ${analysisData.overall_score}`);
      return { success: false, error: "Analysis response had no score" };
    }
    console.log(`[ANALYZE] Claude API SUCCESS. Score: ${overallScore}`);

    // Extract candidate name from resume
    let candidateName = "Candidate";
    if (resumeText && resumeText.length > 0) {
      const firstLine = resumeText.split('\n')[0].trim();
      if (firstLine.length > 0 && firstLine.length < 100 && !firstLine.includes('@')) {
        candidateName = firstLine;
      }
    }

    console.log(`[ANALYZE] Candidate name: ${candidateName}`);

    // Generate HTML report
    console.log(`[ANALYZE] Generating HTML report...`);
    let htmlContent = await generateRecruiterReportHTML({
      candidateName,
      jobTitle,
      overallScore,
      executiveSummary: analysisData.executive_summary || "",
      jobMatchAnalysis: analysisData.job_match_analysis || [],
      experienceAssessment: analysisData.experience_assessment || "",
      skills: analysisData.skills || { strong: [], moderate: [], weak: [] },
      careerProgression: analysisData.career_progression || "",
      achievementScore: analysisData.achievement_score || 0,
      scoringLogic: analysisData.scoring_logic || "",
      matchCategory: analysisData.match_category || "Partial Match",
      categoryEvidence: analysisData.category_evidence || "",
      scoringBreakdown: {},
      top5Improvements: analysisData.improvements || [],
      concerns: analysisData.concerns || [],
      interviewQuestions: analysisData.interview_questions || [],
      interviewRecommendation: analysisData.interview_recommendation || "CONSIDER",
    });

    // Inject feedback token
    if (feedbackToken) {
      htmlContent = replaceFeedbackToken(htmlContent, feedbackToken);
      console.log(`[ANALYZE] Feedback token injected`);
    }

    // Save to database
    console.log(`[ANALYZE] Saving review to database...`);
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
          executive_summary: analysisData.executive_summary || "",
          experience_assessment: analysisData.experience_assessment || "",
          career_progression: analysisData.career_progression || "",
          skills_strong: analysisData.skills?.strong || [],
          skills_moderate: analysisData.skills?.moderate || [],
          skills_weak: analysisData.skills?.weak || [],
          achievement_score: analysisData.achievement_score || 0,
          scoring_logic: analysisData.scoring_logic || "",
          match_category: analysisData.match_category || "Partial Match",
          category_evidence: analysisData.category_evidence || "",
          improvements: JSON.stringify(analysisData.improvements || []),
          job_match_analysis: JSON.stringify(analysisData.job_match_analysis || []),
          concerns: analysisData.concerns || [],
          interview_questions: analysisData.interview_questions || [],
          score: overallScore,
          overall_score: overallScore,
          input_tokens: analysisData.tokens?.input || 0,
          output_tokens: analysisData.tokens?.output || 0,
          analysis_cost_usd: analysisData.tokens?.costUsd || 0,
          analysis_cost_inr: analysisData.tokens?.costInr || 0,
          html_report: htmlContent,
          language: "English",
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (reviewError) {
      console.error(`[ANALYZE] Database error: ${reviewError.message}`);
      return { success: false, error: `Database save failed: ${reviewError.message}` };
    }

    const reviewId = reviewData[0]?.id;
    console.log(`[ANALYZE] Review saved. ID: ${reviewId}`);

    // Send email
    console.log(`[ANALYZE] Sending email to ${candidateEmail}...`);
    let emailSent = false;
    let emailError = null;
    try {
      // The rating page is not live yet, so the email asks for feedback by
      // reply instead of linking to /feedback?token=... (restore the link here
      // once that page works).
      const emailBody = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <p>Hello,</p>
          <p>Thank you for choosing ScreenCV.</p>
          <p>Your analysis report for the <strong>${escapeHtml(jobTitle)}</strong> position is attached to this email.</p>
          <p>We would value your feedback. If you have any comments on the report, or suggestions for how we can improve ScreenCV, simply reply to this email.</p>
          <p>Regards,<br>Team ScreenCV</p>
        </div>
      `;

      const emailSubject = `ScreenCV Report - ${String(jobTitle ?? "").replace(/[\r\n]+/g, " ")}`;
      const htmlBuffer = Buffer.from(htmlContent, 'utf-8');
      const safeName = candidateName.replace(/[^\p{L}\p{N}._-]+/gu, '_');
      const fileName = `ScreenCV_${safeName}_${Date.now()}.html`;

      await sendEmailWithPDF({
        to: candidateEmail,
        subject: emailSubject,
        html: emailBody,
        htmlBuffer: htmlBuffer,
        htmlFilename: fileName
      });

      emailSent = true;
      console.log(`[ANALYZE] Email sent successfully`);
    } catch (emailErr) {
      emailError = emailErr.message;
      console.error(`[ANALYZE] Email failed: ${emailErr.message}`);
    }

    // Update submission
    console.log(`[ANALYZE] Updating submission...`);
    const { error: submissionUpdateError } = await supabase
      .from("candidate_submissions")
      .update({
        email_sent: emailSent,
        candidate_name: candidateName,
        feedback_token: feedbackToken,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    if (submissionUpdateError) {
      console.error(`[ANALYZE] Submission update failed: ${submissionUpdateError.message}`);
    }

    console.log(
      emailSent
        ? `[ANALYZE] SUCCESS! Review ${reviewId} saved and emailed`
        : `[ANALYZE] Review ${reviewId} saved but EMAIL NOT SENT`
    );

    return {
      success: true,
      message: emailSent ? 'Analysis completed' : 'Analysis saved, email failed',
      reviewId: reviewId,
      score: overallScore,
      emailSent: emailSent,
      emailError: emailError,
    };

  } catch (error) {
    console.error(`[ANALYZE] ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Run (or re-run) the analysis for a paid submission that has no review yet.
// Everything is loaded from the database; nothing but the id is taken from the request.
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { submission_id } = req.body || {};

  if (!submission_id) {
    return res.status(400).json({ error: 'Missing submission_id' });
  }

  const { data: submission, error: fetchError } = await supabase
    .from("candidate_submissions")
    .select("id, resume_text, job_description, job_title, email, feedback_token, payment_status")
    .eq("id", submission_id)
    .single();

  if (fetchError || !submission) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  if (submission.payment_status !== "captured") {
    return res.status(402).json({ error: 'Payment not completed for this submission' });
  }

  const { data: existingReviews, error: existingError } = await supabase
    .from("candidate_reviews")
    .select("id")
    .eq("submission_id", submission.id)
    .limit(1);

  if (existingError) {
    console.error(`[ANALYZE] Could not check for existing review: ${existingError.message}`);
    return res.status(500).json({ error: 'Could not check existing analysis' });
  }

  if (existingReviews && existingReviews.length > 0) {
    return res.status(409).json({
      error: 'Analysis already exists for this submission',
      reviewId: existingReviews[0].id,
    });
  }

  const result = await analyzeResumeVsJob(
    submission.id,
    submission.resume_text,
    submission.job_description,
    submission.job_title,
    submission.email,
    submission.feedback_token,
    null
  );

  return res.status(result.success ? 200 : 500).json(result);
}

module.exports = {
  handler,
  analyzeResumeVsJob,
};
