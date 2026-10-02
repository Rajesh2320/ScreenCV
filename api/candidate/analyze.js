// screencv/api/candidate/analyze.js - MINIMAL VERSION
// Just the core logic: Call Claude, save to DB, send email

const { supabase } = require("../../lib/supabase-client");
const { generateRecruiterAnalysis } = require("../../lib/claude-scoring");
const { generateRecruiterReportHTML, replaceFeedbackToken } = require("../../lib/html-generator-recruiter");
const { sendEmailWithPDF } = require("../../lib/nodemailer-sender");

async function analyzeResumeVsJob(submissionId, resumeText, jobDescription, jobTitle, candidateEmail, feedbackToken, paymentData) {
  try {
    console.log(`[ANALYZE] Starting for submission: ${submissionId}`);

    // Call Claude
    console.log(`[ANALYZE] Calling Claude API...`);
    const analysisResult = await generateRecruiterAnalysis(resumeText, jobDescription);
    
    if (!analysisResult.success) {
      console.log(`[ANALYZE] Claude API FAILED: ${analysisResult.error}`);
      return { success: false, error: analysisResult.error };
    }

    const analysisData = analysisResult.data;
    const overallScore = analysisData.overall_score || 0;
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
      console.log(`[ANALYZE] Database error: ${reviewError.message}`);
      return { success: false, error: "Database save failed" };
    }

    const reviewId = reviewData[0]?.id;
    console.log(`[ANALYZE] Review saved. ID: ${reviewId}`);

    // Send email
    console.log(`[ANALYZE] Sending email to ${candidateEmail}...`);
    try {
      const emailBody = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <p>Hi,</p>
          <p>Thank you for using ScreenCV services.</p>
          <p>Attached is your analysis report for the ${jobTitle} position.</p>
          <p>Please feel free to <a href="${process.env.FEEDBACK_BASE_URL || 'http://localhost:3000'}/feedback?token=${feedbackToken}">rate us</a> and provide feedback.</p>
          <p>Regards,<br>Team ScreenCV</p>
        </div>
      `;

      const emailSubject = `ScreenCV Report - ${jobTitle}`;
      const htmlBuffer = Buffer.from(htmlContent, 'utf-8');
      const fileName = `ScreenCV_${candidateName.replace(/\s+/g, '_')}_${Date.now()}.html`;

      await sendEmailWithPDF({
        to: candidateEmail,
        subject: emailSubject,
        html: emailBody,
        htmlBuffer: htmlBuffer,
        htmlFilename: fileName
      });

      console.log(`[ANALYZE] Email sent successfully`);
    } catch (emailErr) {
      console.log(`[ANALYZE] Email failed: ${emailErr.message}`);
    }

    // Update submission with candidate name
    console.log(`[ANALYZE] Updating submission...`);
    await supabase
      .from("candidate_submissions")
      .update({
        email_sent: true,
        candidate_name: candidateName,
        feedback_token: feedbackToken,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    console.log(`[ANALYZE] SUCCESS! Candidate name saved: ${candidateName}`);

    return {
      success: true,
      message: 'Analysis completed',
      reviewId: reviewId,
      score: overallScore,
    };

  } catch (error) {
    console.log(`[ANALYZE] ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { submission_id, resume_text, job_description, job_title, email, feedback_token } = req.body;

  if (!submission_id || !resume_text || !job_description || !job_title || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = await analyzeResumeVsJob(
    submission_id,
    resume_text,
    job_description,
    job_title,
    email,
    feedback_token,
    null
  );

  return res.status(result.success ? 200 : 500).json(result);
}

module.exports = {
  handler,
  analyzeResumeVsJob,
};
