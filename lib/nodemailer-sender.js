/**
 * Email Service: Send emails with PDF attachments via Gmail
 * Uses nodemailer for SMTP relay
 * ✅ REBRANDED TO BIOSYNC
 */

const nodemailer = require('nodemailer');

/**
 * Gmail SMTP Configuration
 * Requires: Gmail account + App Password (2FA must be enabled)
 * 
 * Setup:
 * 1. Enable 2FA on Gmail account
 * 2. Create App Password: https://myaccount.google.com/apppasswords
 * 3. Add to .env.local:
 *    GMAIL_USER=your-email@gmail.com
 *    GMAIL_APP_PASSWORD=your-app-password
 */

let transporter = null;

/**
 * Initialize email transporter
 */
function initializeTransporter() {
  if (transporter) return transporter;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  console.log(`[EMAIL] Attempting to initialize transporter...`);
  console.log(`[EMAIL] GMAIL_USER: ${gmailUser ? '✓ Set' : '✗ Not set'}`);
  console.log(`[EMAIL] GMAIL_APP_PASSWORD: ${gmailPassword ? '✓ Set (' + gmailPassword.length + ' chars)' : '✗ Not set'}`);

  if (!gmailUser || !gmailPassword) {
    console.error('[EMAIL] Gmail credentials not configured. Email sending disabled.');
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPassword
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    console.log('[EMAIL] ✅ Transporter initialized successfully for:', gmailUser);
    return transporter;
  } catch (error) {
    console.error('[EMAIL] ✗ Failed to initialize transporter:', error.message);
    return null;
  }
}

/**
 * Send email with PDF attachment
 * 
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML email body
 * @param {Buffer} options.pdfBuffer - PDF file buffer
 * @param {string} options.pdfFilename - PDF filename (e.g., "analysis.pdf")
 * @returns {Promise} Email send result
 */
async function sendEmailWithPDF(options) {
  const { to, subject, html, pdfBuffer, pdfFilename, htmlBuffer, htmlFilename } = options;

  console.log(`[EMAIL] sendEmailWithPDF called`);
  console.log(`[EMAIL] To: ${to}`);
  console.log(`[EMAIL] Subject: ${subject}`);
  console.log(`[EMAIL] HTML length: ${html ? html.length : 0} chars`);
  console.log(`[EMAIL] PDF: ${pdfBuffer ? 'Yes (' + pdfBuffer.length + ' bytes)' : 'No'}`);
  console.log(`[EMAIL] HTML Attachment: ${htmlBuffer ? 'Yes (' + htmlBuffer.length + ' bytes)' : 'No'}`);

  if (!transporter) {
    console.log(`[EMAIL] Transporter not initialized, initializing...`);
    transporter = initializeTransporter();
  }

  if (!transporter) {
    console.error('[EMAIL] ✗ Email transporter not configured - aborting email send');
    throw new Error('Email transporter not configured');
  }

  if (!to || !subject || !html) {
    console.error('[EMAIL] ✗ Missing required fields:', { to: !!to, subject: !!subject, html: !!html });
    throw new Error('Missing required email fields: to, subject, html');
  }

  // Build email options
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: to,
    subject: subject,
    html: html,
    attachments: []
  };

  // Add PDF attachment if provided
  if (pdfBuffer && pdfFilename) {
    mailOptions.attachments.push({
      filename: pdfFilename,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
    console.log(`[EMAIL] Added PDF attachment: ${pdfFilename}`);
  }

  // Add HTML attachment if provided
  if (htmlBuffer && htmlFilename) {
    mailOptions.attachments.push({
      filename: htmlFilename,
      content: htmlBuffer,
      contentType: 'text/html'
    });
    console.log(`[EMAIL] Added HTML attachment: ${htmlFilename}`);
  }

  try {
    console.log(`[EMAIL] Attempting to send email to ${to}...`);
    const result = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] ✅ Email sent successfully!`);
    console.log(`[EMAIL] MessageId: ${result.messageId}`);
    console.log(`[EMAIL] Response: ${result.response}`);
    return result;
  } catch (error) {
    console.error(`[EMAIL] Failed to send email to ${to}:`, error);
    throw error;
  }
}

/**
 * Verify transporter connection (for testing)
 */
async function verifyTransporter() {
  const trans = initializeTransporter();
  if (!trans) {
    console.log('[EMAIL] Transporter not initialized (credentials missing)');
    return false;
  }

  try {
    await trans.verify();
    console.log('[EMAIL] Transporter connection verified ✓');
    return true;
  } catch (error) {
    console.error('[EMAIL] Transporter verification failed:', error);
    return false;
  }
}

/**
 * Email template: Resume Analysis Report
 * ✅ REBRANDED TO BIOSYNC
 */
function getAnalysisEmailTemplate(data) {
  const {
    jobTitle,
    score,
    strengths,
    improvements,
    keywords,
    matchPercentage,
    candidateName
  } = data;

  const strengthsList = (strengths || [])
    .map(s => `<li>${s}</li>`)
    .join('');

  const improvementsList = (improvements || [])
    .map(i => `<li>${i}</li>`)
    .join('');

  const keywordsList = (keywords || [])
    .map(k => `<span style="display: inline-block; background: #e3f2fd; padding: 4px 8px; border-radius: 4px; margin: 2px; font-size: 12px;">${k}</span>`)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .score-box {
      background: white;
      border: 3px solid #667eea;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: -30px 20px 20px;
      position: relative;
      z-index: 1;
    }
    .score-number {
      font-size: 48px;
      font-weight: bold;
      color: #667eea;
    }
    .score-label {
      color: #666;
      font-size: 14px;
      margin-top: 4px;
    }
    .content {
      padding: 30px;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 12px;
      border-bottom: 2px solid #667eea;
      padding-bottom: 8px;
    }
    .section ul {
      margin: 0;
      padding-left: 20px;
    }
    .section li {
      margin-bottom: 8px;
      color: #555;
    }
    .match-box {
      background: #f0f7ff;
      border-left: 4px solid #667eea;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 15px;
    }
    .keywords-box {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
      margin-top: 10px;
    }
    .footer {
      background: #f5f5f5;
      padding: 20px 30px;
      text-align: center;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #ddd;
    }
    .cta-button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      margin: 15px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Resume Analysis Report</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">For: ${jobTitle}</p>
    </div>

    <div class="score-box">
      <div class="score-number">${score}/100</div>
      <div class="score-label">Resume Match Score</div>
      <div style="margin-top: 8px; font-size: 14px; color: #666;">
        ${matchPercentage}% match with job requirements
      </div>
    </div>

    <div class="content">
      ${candidateName ? `<p>Hi <strong>${candidateName}</strong>,</p>` : ''}
      
      <p>Your resume has been analyzed against the job description for <strong>${jobTitle}</strong>. Here's what we found:</p>

      ${score >= 80 ? `
      <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; border-radius: 4px; margin: 15px 0;">
        <strong style="color: #2e7d32;">✓ Great Match!</strong> Your resume aligns well with this job. Focus on the improvements below to increase your chances.
      </div>
      ` : score >= 60 ? `
      <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 12px; border-radius: 4px; margin: 15px 0;">
        <strong style="color: #e65100;">⚠ Good Foundation</strong> Your resume covers key areas. Apply the improvements below to strengthen your candidacy.
      </div>
      ` : `
      <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 12px; border-radius: 4px; margin: 15px 0;">
        <strong style="color: #c62828;">⚠ Needs Work</strong> Your resume is missing key elements for this role. See improvements below to increase your chances.
      </div>
      `}

      ${strengths && strengths.length > 0 ? `
      <div class="section">
        <div class="section-title">✓ Your Strengths</div>
        <ul>
          ${strengthsList}
        </ul>
      </div>
      ` : ''}

      ${improvements && improvements.length > 0 ? `
      <div class="section">
        <div class="section-title">📝 Improvements Needed</div>
        <ul>
          ${improvementsList}
        </ul>
      </div>
      ` : ''}

      ${keywords && keywords.length > 0 ? `
      <div class="section">
        <div class="section-title">🔑 Key Keywords to Emphasize</div>
        <p style="margin: 0; color: #666; font-size: 14px;">Add these keywords to your resume for better ATS compatibility:</p>
        <div class="keywords-box">
          ${keywordsList}
        </div>
      </div>
      ` : ''}

      <div class="section" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #ddd;">
        <p style="margin-top: 0;">
          <strong>Next Steps:</strong>
        </p>
        <ol style="color: #555; margin: 10px 0;">
          <li>Update your resume based on the improvements above</li>
          <li>Ensure all keywords are naturally incorporated</li>
          <li>Read through your resume one more time</li>
          <li>Submit your application with confidence!</li>
        </ol>
      </div>

      <p style="text-align: center; margin-top: 25px;">
        <a href="https://biosync-1.vercel.app" class="cta-button">Analyze Another Job</a>
      </p>
    </div>

    <div class="footer">
      <p style="margin: 0;">BIOSYNC - AI-Powered Resume Analysis</p>
      <p style="margin: 5px 0 0 0;">Got feedback? We'd love to hear from you!</p>
    </div>
  </div>
</body>
</html>
`;
}

module.exports = {
  sendEmailWithPDF,
  verifyTransporter,
  initializeTransporter,
  getAnalysisEmailTemplate
};
