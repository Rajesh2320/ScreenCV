/**
 * API Route: /api/candidate/analyze
 * Purpose: Process resume analysis + send email report
 * ✅ REBRANDED TO BIOSYNC
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const generateHTML = require('../../lib/html-generator-recruiter');
const { sendEmailWithPDF } = require('../../lib/nodemailer-sender');
const { PDFDocument, PDFPage, PDFFont } = require('pdfkit');
const { streamToBuffer } = require('pdfkit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Convert HTML string to PDF Buffer
 * ✅ OPTIMIZED FOR VERCEL (serverless)
 */
async function htmlToPDF(htmlContent, candidateName, jobTitle) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Parse HTML to extract text and basic formatting
      const lines = htmlContent
        .split('<br>')
        .map(line => {
          return line
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .trim();
        })
        .filter(line => line.length > 0);

      // Add title
      doc.fontSize(16).font('Helvetica-Bold').text(`${jobTitle} - Resume Analysis`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica').text(`Candidate: ${candidateName}`, { align: 'center' });
      doc.moveDown();

      // Add content
      lines.forEach((line, index) => {
        if (line.includes('Score:') || line.includes('SCORE')) {
          doc.fontSize(14).font('Helvetica-Bold').text(line);
        } else if (line.includes('•')) {
          doc.fontSize(10).font('Helvetica').text(line, { indent: 20 });
        } else if (line.length < 50) {
          doc.fontSize(11).font('Helvetica-Bold').text(line);
        } else {
          doc.fontSize(10).font('Helvetica').text(line);
        }
        doc.moveDown(0.3);
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate payment confirmation email
 * ✅ REBRANDED TO BIOSYNC
 */
function getPaymentConfirmationEmail(candidateName, jobTitle, orderId, amountPaid) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
    }
    .content {
      padding: 30px;
    }
    .section {
      margin-bottom: 20px;
    }
    .success-box {
      background: #e8f5e9;
      border-left: 4px solid #4caf50;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .success-box strong {
      color: #2e7d32;
    }
    .details-box {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
      border: 1px solid #ddd;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .label {
      font-weight: 600;
      color: #666;
    }
    .value {
      color: #333;
    }
    .footer {
      background: #f5f5f5;
      padding: 20px 30px;
      text-align: center;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #ddd;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ Payment Successful</h1>
    </div>

    <div class="content">
      <p>Hi <strong>${candidateName}</strong>,</p>

      <div class="success-box">
        <strong>✓ Thank you for using the <strong>BIOSYNC</strong> services.</strong> Your payment has been received and your analysis is being processed.
      </div>

      <div class="section">
        <h2 style="color: #667eea; font-size: 16px; margin-top: 0;">Order Details</h2>
        <div class="details-box">
          <div class="detail-row">
            <span class="label">Order ID:</span>
            <span class="value">#${orderId}</span>
          </div>
          <div class="detail-row">
            <span class="label">Job Title:</span>
            <span class="value">${jobTitle}</span>
          </div>
          <div class="detail-row">
            <span class="label">Amount Paid:</span>
            <span class="value">₹${amountPaid}</span>
          </div>
          <div class="detail-row">
            <span class="label">Status:</span>
            <span class="value" style="color: #4caf50; font-weight: 600;">Completed</span>
          </div>
        </div>
      </div>

      <div class="section">
        <p style="margin-bottom: 12px;">Your analysis report will be available shortly. You'll receive another email with:</p>
        <ul style="margin: 0; padding-left: 20px; color: #555;">
          <li>Detailed resume analysis</li>
          <li>Match score against job description</li>
          <li>Strengths and areas for improvement</li>
          <li>Key keywords to emphasize</li>
          <li>Interview preparation tips</li>
        </ul>
      </div>

      <div class="section" style="background: #f0f7ff; border-left: 4px solid #667eea; padding: 15px; border-radius: 4px;">
        <p style="margin: 0; color: #333;">
          <strong>📧 Check your inbox (and spam folder)</strong> for your detailed BIOSYNC Report within the next few minutes.
        </p>
      </div>

      <p style="color: #999; font-size: 13px; margin-top: 20px;">
        Have questions? Reply to this email or visit our support page.
      </p>
    </div>

    <div class="footer">
      <p style="margin: 0;"><strong>Team BIOSYNC</strong></p>
      <p style="margin: 5px 0 0 0;">© 2026 BIOSYNC. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Main API Handler
 */
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { submission_id, email, candidateName, jobTitle } = req.body;

  if (!submission_id || !email || !candidateName || !jobTitle) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['submission_id', 'email', 'candidateName', 'jobTitle']
    });
  }

  try {
    console.log(`\n[ANALYZE] Starting analysis for submission: ${submission_id}`);

    // 1. Fetch submission from database
    console.log('[ANALYZE] Fetching submission from database...');
    const { data: submission, error: fetchError } = await supabase
      .from('candidate_submissions')
      .select('*')
      .eq('id', submission_id)
      .single();

    if (fetchError || !submission) {
      console.error('[ANALYZE] Submission fetch error:', fetchError);
      return res.status(404).json({ error: 'Submission not found' });
    }

    // 2. Send payment confirmation email
    console.log('[ANALYZE] Sending payment confirmation email...');
    const confirmationEmail = getPaymentConfirmationEmail(
      candidateName,
      jobTitle,
      submission.order_id || 'N/A',
      '99'
    );

    try {
      await sendEmailWithPDF({
        to: email,
        subject: `BIOSYNC Report - ${jobTitle} [Order: ${submission.order_id || submission_id.slice(0, 8)}]`,
        html: confirmationEmail
      });
      console.log(`[ANALYZE] ✓ Payment confirmation email sent to ${email}`);
    } catch (emailError) {
      console.error('[ANALYZE] Failed to send confirmation email:', emailError.message);
      // Continue processing even if email fails
    }

    // 3. Fetch resume & job description files
    console.log('[ANALYZE] Fetching files from Supabase Storage...');
    const resumePath = submission.resume_file_path;
    const jobDescPath = submission.job_description_file_path;

    if (!resumePath || !jobDescPath) {
      return res.status(400).json({
        error: 'Resume or job description not found',
        has_resume: !!resumePath,
        has_job_desc: !!jobDescPath
      });
    }

    // Get file URLs from Supabase Storage
    const { data: resumeData, error: resumeError } = await supabase
      .storage
      .from('candidate-uploads')
      .download(resumePath);

    const { data: jobDescData, error: jobDescError } = await supabase
      .storage
      .from('candidate-uploads')
      .download(jobDescPath);

    if (resumeError || jobDescError) {
      console.error('[ANALYZE] File download error:', { resumeError, jobDescError });
      return res.status(400).json({ error: 'Failed to download files' });
    }

    console.log('[ANALYZE] Files downloaded successfully');

    // 4. Extract text from files
    console.log('[ANALYZE] Extracting text from files...');
    const fileExtraction = require('../../lib/file-extraction');
    const resumeText = await fileExtraction.extractText(resumeData, resumePath);
    const jobDescText = await fileExtraction.extractText(jobDescData, jobDescPath);

    if (!resumeText || !jobDescText) {
      return res.status(400).json({ error: 'Failed to extract text from files' });
    }

    console.log(`[ANALYZE] Resume text: ${resumeText.length} chars, Job desc: ${jobDescText.length} chars`);

    // 5. Call Claude API for analysis
    console.log('[ANALYZE] Calling Claude API for analysis...');
    const analysisPrompt = `
Analyze this resume against the job description. Provide a detailed analysis.

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescText}

Provide your analysis in this exact format:
SCORE: [0-100]
MATCH_PERCENTAGE: [0-100]%

STRENGTHS:
- [strength 1]
- [strength 2]
- [strength 3]

IMPROVEMENTS:
- [improvement 1]
- [improvement 2]
- [improvement 3]

KEYWORDS:
- keyword1
- keyword2
- keyword3

INTERVIEW_QUESTIONS:
- question1
- question2
- question3

RESUME_GAPS:
- gap1
- gap2
`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: analysisPrompt }
      ]
    });

    const analysisText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('[ANALYZE] ✓ Claude analysis received');

    // 6. Parse analysis response
    console.log('[ANALYZE] Parsing analysis response...');
    const parseAnalysis = require('../../lib/claude-scoring');
    const analysis = parseAnalysis.parseAnalysisResponse(analysisText);

    // 7. Generate HTML report
    console.log('[ANALYZE] Generating HTML report...');
    const htmlReport = generateHTML.generateRecruitersAnalysisHTML({
      candidateName: candidateName,
      jobTitle: jobTitle,
      score: analysis.score,
      matchPercentage: analysis.matchPercentage,
      strengths: analysis.strengths,
      improvements: analysis.improvements,
      keywords: analysis.keywords,
      interviewQuestions: analysis.interviewQuestions,
      resumeGaps: analysis.resumeGaps,
      analysis: analysisText
    });

    // 8. Convert HTML to PDF
    console.log('[ANALYZE] Converting HTML to PDF...');
    const pdfBuffer = await htmlToPDF(htmlReport, candidateName, jobTitle);
    console.log(`[ANALYZE] PDF generated: ${pdfBuffer.length} bytes`);

    // 9. Save report to database
    console.log('[ANALYZE] Saving report to database...');
    const { data: reportData, error: reportError } = await supabase
      .from('candidate_reports')
      .insert({
        submission_id: submission_id,
        score: analysis.score,
        match_percentage: analysis.matchPercentage,
        strengths: analysis.strengths,
        improvements: analysis.improvements,
        keywords: analysis.keywords,
        analysis_text: analysisText,
        html_report: htmlReport
      })
      .select()
      .single();

    if (reportError) {
      console.error('[ANALYZE] Report save error:', reportError);
      return res.status(500).json({ error: 'Failed to save report' });
    }

    console.log(`[ANALYZE] ✓ Report saved with ID: ${reportData.id}`);

    // 10. Send analysis email
    console.log('[ANALYZE] Sending analysis email...');
    const analysisEmailHTML = require('../../lib/nodemailer-sender').getAnalysisEmailTemplate({
      jobTitle: jobTitle,
      score: analysis.score,
      strengths: analysis.strengths,
      improvements: analysis.improvements,
      keywords: analysis.keywords,
      matchPercentage: analysis.matchPercentage,
      candidateName: candidateName
    });

    try {
      await sendEmailWithPDF({
        to: email,
        subject: `Your BIOSYNC Report - ${jobTitle} Analysis`,
        html: analysisEmailHTML,
        pdfBuffer: pdfBuffer,
        pdfFilename: `BIOSYNC_Analysis_${candidateName.replace(/\s+/g, '_')}_${Date.now()}.pdf`,
        htmlBuffer: Buffer.from(htmlReport, 'utf-8'),
        htmlFilename: `BIOSYNC_Analysis_${candidateName.replace(/\s+/g, '_')}_${Date.now()}.html`
      });
      console.log(`[ANALYZE] ✓ Analysis email sent to ${email}`);
    } catch (emailError) {
      console.error('[ANALYZE] Failed to send analysis email:', emailError.message);
      // Don't fail the analysis if email fails
    }

    // 11. Update submission status
    console.log('[ANALYZE] Updating submission status...');
    const { error: updateError } = await supabase
      .from('candidate_submissions')
      .update({
        analysis_status: 'completed',
        analysis_completed_at: new Date().toISOString(),
        report_id: reportData.id
      })
      .eq('id', submission_id);

    if (updateError) {
      console.error('[ANALYZE] Status update error:', updateError);
    }

    // 12. Log AI costs
    console.log('[ANALYZE] Logging AI costs...');
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const estimatedCostINR = (inputTokens * 0.00003 + outputTokens * 0.00015) * 100; // Approximate

    const { error: costError } = await supabase
      .from('ai_costs_log')
      .insert({
        submission_id: submission_id,
        review_id: reportData.id,
        model: 'claude-3-5-sonnet-20241022',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        estimated_cost_inr: estimatedCostINR
      });

    if (costError) {
      console.error('[ANALYZE] Cost logging error:', costError);
    }

    console.log(`[ANALYZE] ✅ Analysis complete!`);
    console.log(`[ANALYZE] - Score: ${analysis.score}/100`);
    console.log(`[ANALYZE] - Tokens: ${inputTokens} input, ${outputTokens} output`);
    console.log(`[ANALYZE] - Cost: ₹${estimatedCostINR.toFixed(2)}`);

    return res.status(200).json({
      success: true,
      message: 'Analysis completed and emails sent',
      report_id: reportData.id,
      score: analysis.score,
      matchPercentage: analysis.matchPercentage,
      aiCost: {
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        estimatedCostINR: estimatedCostINR.toFixed(2)
      }
    });

  } catch (error) {
    console.error('[ANALYZE] Unexpected error:', error);
    return res.status(500).json({
      error: 'Analysis failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

module.exports = handler;
