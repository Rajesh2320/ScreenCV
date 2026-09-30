// screencv/lib/emailjs-sender.js
// Send emails via multiple methods (EmailJS, Gmail SMTP, or mock for testing)

// NOTE: @emailjs/nodejs doesn't exist on npm (EmailJS is browser-only)
// Keeping this function for reference - use sendReportEmailViaGmail or sendReportEmailMock instead

const { APP_NAME } = require("./constants");

// async function sendReportEmail(data) {
//   // DEPRECATED: EmailJS doesn't have Node.js library
//   // Use sendReportEmailViaGmail or sendReportEmailMock instead
// }

// ===== ALTERNATIVE: NODEMAILER (for Gmail SMTP) =====
// Uncomment if you want to use Gmail SMTP instead of EmailJS

const nodemailer = require("nodemailer");

async function sendReportEmailViaGmail(data) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const htmlContent = `
      <h2>${APP_NAME} - Resume Analysis Report</h2>
      <p>Hi ${data.candidateName || "Candidate"},</p>
      <p>Here's your resume analysis for the position: <strong>${data.jobTitle}</strong></p>
      
      <h3>Match Score: ${data.score}/100</h3>
      <p>${data.reason}</p>
      
      ${
        data.greenFlags && data.greenFlags.length > 0
          ? `<h4>✓ Strengths</h4><ul>${data.greenFlags.map((f) => `<li>${f}</li>`).join("")}</ul>`
          : ""
      }
      
      ${
        data.redFlags && data.redFlags.length > 0
          ? `<h4>✗ Gaps</h4><ul>${data.redFlags.map((f) => `<li>${f}</li>`).join("")}</ul>`
          : ""
      }
      
      ${
        data.interviewQuestions && data.interviewQuestions.length > 0
          ? `<h4>📋 Likely Interview Questions</h4><ol>${data.interviewQuestions.map((q) => `<li>${q}</li>`).join("")}</ol>`
          : ""
      }
      
      ${
        data.resumeGaps && data.resumeGaps.length > 0
          ? `<h4>📈 Recommendations</h4><ul>${data.resumeGaps.map((g) => `<li>${g}</li>`).join("")}</ul>`
          : ""
      }
      
      <p>Best regards,<br/>${APP_NAME} Team</p>
    `;

    const mailOptions = {
      from: `${APP_NAME} <${process.env.GMAIL_USER}>`,
      to: data.candidateEmail,
      subject: `Your ${APP_NAME} Resume Analysis Report`,
      html: htmlContent,
      attachments: data.pdfBuffer
        ? [
            {
              filename: `${APP_NAME}_report_${Date.now()}.pdf`,
              content: data.pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : [],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("[Gmail] Email sent:", info.response);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("[Gmail] Error sending email:", err.message);
    return { success: false, error: err.message };
  }
}

// ===== MOCK EMAIL (for testing) =====

async function sendReportEmailMock(data) {
  console.log("[Mock Email] Simulating email send to:", data.candidateEmail);
  console.log("[Mock Email] Subject:", `Your ${APP_NAME} Resume Analysis Report`);
  console.log("[Mock Email] Score:", data.score);
  return { success: true, messageId: "mock_" + Date.now() };
}

module.exports = {
  // sendReportEmail,  // ❌ REMOVED - @emailjs/nodejs doesn't exist
  sendReportEmailViaGmail,  // ✅ Works with nodemailer
  sendReportEmailMock,      // ✅ Works for testing
};