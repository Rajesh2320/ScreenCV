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
//  7. The report now receives the real factor scores from the analysis
//     (previously an empty object, which made the report show placeholders).
//  8. Candidate name: uses the name Claude read from the resume, and otherwise
//     the first line that looks like a name. Previously the first line of the
//     resume was used whatever it was, e.g. a row of "=====".
//  9. Runs a second Claude call alongside the analysis for the practical
//     sections of the report (rewritten resume lines, missing keywords,
//     interview questions with talking points, better-fit roles). If that
//     call fails the report is still sent, without those sections. Token and
//     cost totals saved to the database cover both calls.
// 10. Passes the score calculation to the report, so the report can show how
//     the overall score was worked out from the requirement rows.

const { supabase } = require("../../lib/supabase-client");
const { generateRecruiterAnalysis, generateCoachingExtras } = require("../../lib/claude-scoring");
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

// Words that appear in resume headings and job titles but not in names
const NOT_NAME_WORDS = new Set([
  "resume", "r\u00e9sum\u00e9", "cv", "curriculum", "vitae", "biodata", "bio-data", "profile", "summary",
  "objective", "experience", "education", "skills", "contact", "details", "information", "personal",
  "professional", "career", "about", "work", "employment", "history", "qualifications", "candidate",
  "name", "unknown", "not", "provided", "mentioned", "specified", "available", "page",
  "manager", "engineer", "executive", "analyst", "head", "director", "officer", "consultant",
  "developer", "specialist", "associate", "lead", "senior", "junior", "assistant", "telecaller",
]);

// True when the text looks like a person's name: letters only (any language),
// a few words, and not a heading, separator line, email, phone number or link.
function looksLikeName(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < 2 || text.length > 60) return false;
  if (/[@\d]|https?:|www\./i.test(text)) return false;
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .,'\u2019-]*$/u.test(text)) return false;
  const words = text.toLowerCase().split(/[\s.,]+/).filter(Boolean);
  if (words.length > 7) return false;
  if (words.some((word) => NOT_NAME_WORDS.has(word))) return false;
  return true;
}

function pickCandidateName(nameFromAnalysis, resumeText) {
  if (looksLikeName(nameFromAnalysis)) {
    return nameFromAnalysis.trim();
  }

  const lines = String(resumeText || "")
    .split("\n")
    .map((line) => line.trim().replace(/^name\s*[:\-]\s*/i, ""))
    .filter((line) => line.length > 0)
    .slice(0, 15);

  for (const line of lines) {
    if (looksLikeName(line)) return line;
  }

  return "Candidate";
}

async function analyzeResumeVsJob(submissionId, resumeText, jobDescription, jobTitle, candidateEmail, feedbackToken, paymentData) {
  try {
    console.log(`[ANALYZE] Starting for submission: ${submissionId}`);

    // Two Claude calls run side by side, so the wait is the longer of the two
    // rather than the sum: the match analysis, and the practical extras
    // (rewrites, keywords, interview prep, better-fit roles).
    console.log(`[ANALYZE] Calling Claude API (analysis + coaching extras)...`);
    const [analysisResult, coachingResult] = await Promise.all([
      generateRecruiterAnalysis(resumeText, jobDescription),
      generateCoachingExtras(resumeText, jobDescription).catch((err) => ({ success: false, error: err.message })),
    ]);

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

    // The extras are a bonus on top of the analysis. If that call fails, the
    // customer still gets the full match report, just without those sections.
    const coachingOk = !!(coachingResult && coachingResult.success);
    const coaching = coachingOk ? coachingResult.data : {};
    if (!coachingOk) {
      console.error(`[ANALYZE] Coaching extras FAILED (report will be sent without them): ${coachingResult?.error || "unknown error"}`);
    }

    // Candidate name: Claude's reading of the resume first, then the first
    // line of the resume that actually looks like a name
    const candidateName = pickCandidateName(analysisData.candidate_name, resumeText);

    console.log(`[ANALYZE] Candidate name: ${candidateName}`);

    // Generate HTML report
    console.log(`[ANALYZE] Generating HTML report...`);
    const companyName = analysisData.company_name || "";

    let htmlContent = await generateRecruiterReportHTML({
      candidateName,
      jobTitle,
      companyName,
      overallScore,
      executiveSummary: analysisData.executive_summary || "",
      jobMatchAnalysis: analysisData.job_match_analysis || [],
      experienceAssessment: analysisData.experience_assessment || "",
      skills: analysisData.skills || { strong: [], moderate: [], weak: [] },
      careerProgression: analysisData.career_progression || "",
      achievementScore: analysisData.achievement_score || 0,
      scoringLogic: analysisData.scoring_logic || "",
      scoreCalculation: analysisData.score_calculation || null,
      matchCategory: analysisData.match_category || "Partial Match",
      categoryEvidence: analysisData.category_evidence || "",
      scoringBreakdown: analysisData.factor_scores || {},
      top5Improvements: analysisData.improvements || [],
      concerns: analysisData.concerns || [],
      interviewQuestions: analysisData.interview_questions || [],
      resumeRewrites: coaching.resume_rewrites || [],
      missingKeywords: coaching.missing_keywords || [],
      interviewPrep: coaching.interview_prep || [],
      betterFitRoles: coaching.better_fit_roles || [],
      interviewRecommendation: analysisData.interview_recommendation,
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
          // Totals cover both Claude calls (analysis + coaching extras)
          input_tokens: (analysisData.tokens?.input || 0) + (coaching.tokens?.input || 0),
          output_tokens: (analysisData.tokens?.output || 0) + (coaching.tokens?.output || 0),
          analysis_cost_usd: parseFloat(((analysisData.tokens?.costUsd || 0) + (coaching.tokens?.costUsd || 0)).toFixed(6)),
          analysis_cost_inr: parseFloat(((analysisData.tokens?.costInr || 0) + (coaching.tokens?.costInr || 0)).toFixed(2)),
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
          <p>Your analysis report for the <strong>${escapeHtml(jobTitle)}</strong> position${companyName ? ` at <strong>${escapeHtml(companyName)}</strong>` : ""} is attached to this email.</p>
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
      coachingIncluded: coachingOk,
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
