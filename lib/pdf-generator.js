// screencv/lib/pdf-generator.js
// PDF with rich intro + full analysis

const PDFDocument = require("pdfkit");
const { APP_NAME } = require("./constants");

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_TOP = 25;
const MARGIN_BOTTOM = 30;
const MARGIN_LEFT = 30;
const MARGIN_RIGHT = 30;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

function generatePDFReport(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
        bufferPages: true,
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });
      doc.on("error", (err) => reject(err));

      const score = Math.max(0, Math.min(100, parseInt(data.score) || 0));
      const scoreColor = getScoreColor(score);
      const scoreLabel = getScoreInterpretation(score);

      // ===== INTRO SECTION (From Email) =====
      doc.fontSize(20).font("Helvetica-Bold").fillColor("#0f172a").text("ScreenCV Resume Analysis");
      doc.fontSize(11).font("Helvetica").fillColor("#64748b").text("Your AI-Powered Career Match Report");
      doc.moveDown(0.5);

      // Personalized opening based on score
      let openingMessage = "";
      if (score >= 80) {
        openingMessage = `You have strong alignment with the ${data.jobTitle} role. You're in a great position to move forward with confidence.`;
      } else if (score >= 60) {
        openingMessage = `You have a solid foundation for the ${data.jobTitle} role. With focused effort on the identified gaps, you can significantly strengthen your candidacy.`;
      } else if (score >= 40) {
        openingMessage = `There are opportunities to better align your profile with the ${data.jobTitle} role. Our 30-day action plan will help you close the gaps strategically.`;
      } else {
        openingMessage = `Your profile shows potential, but the ${data.jobTitle} role requires some skill development. Our analysis outlines a clear path forward—let's build your candidacy step by step.`;
      }

      doc.fontSize(10).font("Helvetica").fillColor("#1e293b");
      doc.text(`Hi ${data.candidateName || "Candidate"},`);
      doc.moveDown(0.2);
      doc.text(`Your resume analysis for the ${data.jobTitle} role is complete! Below you'll find your comprehensive assessment with actionable insights.`);
      doc.moveDown(0.4);

      // SCORE CARD - Large
      doc.fontSize(60).font("Helvetica-Bold").fillColor(scoreColor).text(score.toString(), { align: "center" });
      doc.fontSize(16).font("Helvetica").fillColor("#64748b").text("out of 100", { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(14).font("Helvetica-Bold").fillColor(scoreColor).text(scoreLabel, { align: "center" });
      doc.moveDown(0.4);

      // YOUR OPPORTUNITY
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("Your Opportunity:");
      doc.moveDown(0.15);
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b").text(openingMessage, { width: CONTENT_WIDTH });
      doc.moveDown(0.4);

      // WHAT'S IN YOUR REPORT
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("📋 What's in Your Report");
      doc.moveDown(0.15);
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b").text("Your attached PDF report includes:", { width: CONTENT_WIDTH });
      doc.moveDown(0.15);

      const reportItems = [
        "Detailed Assessment — How your profile aligns with the role",
        "Key Strengths — What you're doing right",
        "Critical Gaps — Areas for improvement",
        "Interview Prep — Likely questions + strategies to answer them",
        "30-Day Action Plan — Step-by-step path to close gaps",
        "Resume Tips — Concrete ways to strengthen your profile"
      ];

      doc.fontSize(8.5).font("Helvetica").fillColor("#1e293b");
      for (const item of reportItems) {
        doc.text(`✓ ${item}`, { width: CONTENT_WIDTH });
      }
      doc.moveDown(0.3);

      // HOW TO USE THIS REPORT
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("💡 How to Use This Report:");
      doc.moveDown(0.15);
      doc.fontSize(8.5).font("Helvetica").fillColor("#1e293b");
      doc.text("1. Read the Assessment & Gaps sections first — understand what's holding you back", { width: CONTENT_WIDTH });
      doc.text("2. Review the Interview Questions — practice your answers using the suggested strategies", { width: CONTENT_WIDTH });
      doc.text("3. Follow the 30-Day Action Plan — it's designed to close gaps fast", { width: CONTENT_WIDTH });
      doc.text("4. Update your resume with the Quick Win suggestions", { width: CONTENT_WIDTH });
      doc.text("5. Practice honesty — interviewers value authenticity over perfection", { width: CONTENT_WIDTH });
      doc.moveDown(0.3);

      // HONESTY SECTION
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#d97706").text("⚠️ A Word on Interview Honesty:");
      doc.moveDown(0.15);
      doc.fontSize(8.5).font("Helvetica").fillColor("#1e293b");
      doc.text("Never fabricate experience. Instead, use this approach:", { width: CONTENT_WIDTH });
      doc.moveDown(0.1);
      doc.fontSize(8.5).font("Helvetica-Oblique").fillColor("#7c2d12").text('"I haven\'t done X directly, but I have Y. I\'m actively learning Z."', { width: CONTENT_WIDTH });
      doc.moveDown(0.1);
      doc.fontSize(8.5).font("Helvetica").fillColor("#1e293b").text("Employers hire for honesty + growth mindset, not false claims.", { width: CONTENT_WIDTH });
      doc.moveDown(0.3);

      // YOUR NEXT STEP
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("🎯 Your Next Step:");
      doc.moveDown(0.15);
      doc.fontSize(8.5).font("Helvetica").fillColor("#1e293b").text("Open your report and identify the top 3 gaps. Pick ONE to focus on this week. Small consistent progress beats nothing—you've got this!", { width: CONTENT_WIDTH });
      doc.moveDown(0.4);

      // CLOSING MESSAGE
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b").text(`Remember: A score of ${score} isn't a judgment—it's a roadmap. Every successful candidate started exactly where you are. The difference? They took action.`, { width: CONTENT_WIDTH });
      doc.moveDown(0.2);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#0f172a").text("We're rooting for you! 💪");
      doc.moveDown(0.1);
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b").text("— The ScreenCV Team");

      doc.moveDown(0.5);

      // DIVIDER
      doc.strokeColor("#cbd5e0").lineWidth(1).moveTo(MARGIN_LEFT, doc.y).lineTo(PAGE_WIDTH - MARGIN_RIGHT, doc.y).stroke();
      doc.moveDown(0.5);

      // ===== DETAILED ANALYSIS SECTION =====

      doc.fontSize(14).font("Helvetica-Bold").fillColor("#0f172a").text("Detailed Analysis & Score Breakdown");
      doc.moveDown(0.3);

      doc.fontSize(9).font("Helvetica").fillColor("#1e293b");
      doc.text(data.reason || "Score reflects your demonstrated strengths vs. role requirements.", { width: CONTENT_WIDTH });
      doc.moveDown(0.3);

      // ASSESSMENT
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("Assessment");
      doc.moveDown(0.15);
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b");
      doc.text(data.reason || "Assessment pending.", { width: CONTENT_WIDTH });
      doc.moveDown(0.3);

      // STRENGTHS
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#059669").text("✓ Strengths (Green Flags)");
      doc.moveDown(0.15);
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b");

      const greenFlags = (data.greenFlags || []).filter(f => f && f.trim());
      if (greenFlags.length > 0) {
        for (const flag of greenFlags) {
          doc.text(`• ${flag}`, { width: CONTENT_WIDTH });
        }
      } else {
        doc.text("• No strengths identified.");
      }
      doc.moveDown(0.3);

      // GAPS
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#dc2626").text("⚠ Areas for Improvement (Red Flags)");
      doc.moveDown(0.15);
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b");

      const redFlags = (data.redFlags || []).filter(f => f && f.trim());
      if (redFlags.length > 0) {
        for (const flag of redFlags) {
          doc.text(`• ${flag}`, { width: CONTENT_WIDTH });
        }
      } else {
        doc.text("• No gaps identified.");
      }
      doc.moveDown(0.3);

      // RESUME GAPS
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#7c3aed").text("📋 Resume Gaps");
      doc.moveDown(0.15);
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b");

      const resumeGaps = (data.resumeGaps || []).filter(f => f && f.trim());
      if (resumeGaps.length > 0) {
        for (const gap of resumeGaps) {
          doc.text(`• ${gap}`, { width: CONTENT_WIDTH });
        }
      } else {
        doc.text("• No specific gaps identified.");
      }
      doc.moveDown(0.3);

      // INTERVIEW QUESTIONS
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#2563eb").text("🎯 Potential Interview Questions");
      doc.moveDown(0.15);
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b");

      const questions = (data.interviewQuestions || []).filter(f => f && f.trim());
      if (questions.length > 0) {
        for (let i = 0; i < questions.length; i++) {
          doc.text(`Q${i + 1}: ${questions[i]}`, { width: CONTENT_WIDTH });
          doc.moveDown(0.15);
        }
      } else {
        doc.text("• Interview preparation pending.");
      }
      doc.moveDown(0.3);

      // RESUME CORRECTION TIPS
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("Resume Correction Tips");
      doc.moveDown(0.15);
      doc.fontSize(9).font("Helvetica").fillColor("#1e293b");

      if (greenFlags.length > 0 && redFlags.length > 0) {
        doc.text("Focus on highlighting experience in the following areas:", { width: CONTENT_WIDTH });
        doc.moveDown(0.12);
        for (const gap of redFlags.slice(0, 3)) {
          doc.text(`• Emphasize: ${gap}`, { width: CONTENT_WIDTH });
          doc.moveDown(0.12);
        }
      } else {
        doc.text("• Review resume structure and highlight key achievements.", { width: CONTENT_WIDTH });
      }
      doc.moveDown(0.3);

      // FOOTER
      doc.fontSize(7).font("Helvetica").fillColor("#94a3b8");
      doc.text("ScreenCV | AI-Powered Resume Analysis", MARGIN_LEFT, PAGE_HEIGHT - 20);
      doc.text("© 2026 ScreenCV. Confidential.", MARGIN_LEFT);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function getScoreColor(score) {
  if (score >= 80) return "#059669";
  if (score >= 60) return "#7c3aed";
  if (score >= 40) return "#ea580c";
  return "#dc2626";
}

function getScoreInterpretation(score) {
  if (score >= 80) return "Excellent Match ✓";
  if (score >= 60) return "Good Potential ✓";
  if (score >= 40) return "Developmental Opportunity";
  return "Significant Skill Gap";
}

module.exports = {
  generatePDFReport,
};