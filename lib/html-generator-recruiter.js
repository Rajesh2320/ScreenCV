// screencv/lib/html-generator-recruiter.js
// Recruiter-style analysis report for job seekers (BIOSYNC branding)
//
// CHANGES
//  1. No placeholder numbers. The four factor cards used to show 72/75/72/76
//     whenever no real value was supplied. A card is now shown only when a
//     real score exists; otherwise the section explains the score in words.
//  2. A 0% requirement match is shown as "0%" (it used to print "undefined%").
//  3. The match category is set from the overall score, using the same ranges
//     the report prints in its legend, so the two can never disagree.
//  4. Claude's own explanation of the score (scoringLogic) is now displayed.
//  5. Wording is written to the candidate and kept respectful. Text that
//     assumed the reader was under-qualified, or told them what to do in two
//     different places, has been made neutral.
//  6. References to the "Top 5 Changes" section appear only when that section
//     is actually in the report.
//  7. All resume- and AI-supplied text is HTML-escaped before it is inserted.

// ===== SMALL HELPERS =====

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// Turns a string or a simple object into display text
function textOf(item) {
  if (item === null || item === undefined) return "";
  if (typeof item === "string") return item;
  if (typeof item === "number") return String(item);
  if (typeof item === "object") {
    return item.title || item.text || item.question || item.concern || item.description || Object.values(item).filter((v) => typeof v === "string").join(" - ");
  }
  return String(item);
}

// Returns a whole number 0-100, or null when there is no usable value.
// 0 is a real value and is kept.
function parsePercent(value) {
  let n = null;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "") n = parseFloat(value.replace("%", ""));
  if (n === null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function requirementPercent(item) {
  const p = parsePercent(item.pct ?? item.percentage ?? item.match);
  return p === null ? "&mdash;" : `${p}%`;
}

// Same ranges as the legend printed in the report
function getMatchCategoryFromScore(score) {
  if (score >= 85) return "Strong Match";
  if (score >= 60) return "Partial Match";
  return "Weak Match";
}

// ===== MAIN =====

async function generateRecruiterReportHTML(data) {
  const {
    candidateName,
    jobTitle,
    overallScore,
    executiveSummary,
    jobMatchAnalysis = [],
    experienceAssessment,
    skills = { strong: [], moderate: [], weak: [] },
    careerProgression,
    concerns = [],
    interviewRecommendation,
    interviewQuestions = [],
    scoringBreakdown = {},
    scoringLogic = "",
    top5Improvements = [],
    matchCategory: suppliedCategory = "",
  } = data;

  const strongSkills = Array.isArray(skills?.strong) ? skills.strong : [];
  const moderateSkills = Array.isArray(skills?.moderate) ? skills.moderate : [];
  const weakSkills = Array.isArray(skills?.weak) ? skills.weak : [];

  // The category always follows the score, so the badge and the score agree
  const matchCategory = Number.isFinite(Number(overallScore))
    ? getMatchCategoryFromScore(Number(overallScore))
    : (suppliedCategory || "");

  const hasImprovements = Array.isArray(top5Improvements) && top5Improvements.length > 0;

  const scoreColor = getScoreColor(overallScore);
  const recommendationColor = getRecommendationColor(interviewRecommendation);
  const categoryColor = getCategoryColor(matchCategory);

  const recommendationExplanation = getRecommendationExplanation(interviewRecommendation, hasImprovements);
  const matchCategoryDetailedExplanation = getMatchCategoryExplanation(matchCategory);

  // Factor cards: only real numbers are shown. Nothing is filled in.
  const factorCards = [
    ["Skills Alignment", scoringBreakdown?.skillsAlignment, "How well your skills match the skills this job asks for"],
    ["Experience Relevance", scoringBreakdown?.experienceLevel, "How relevant your work experience is to this role"],
    ["Job Requirements Match", scoringBreakdown?.jobRequirementsMatch, "Average of the requirement scores in the Job Match Analysis table"],
    ["Career Fit", scoringBreakdown?.careerProgression, "How well your career path so far fits this role"],
  ]
    .map(([label, value, description]) => ({ label, value: parsePercent(value), description }))
    .filter((card) => card.value !== null);

  const scoreIntro = factorCards.length > 0
    ? `Your overall score is <strong>${esc(overallScore)}/100</strong>. The scores below show how your resume compares with this job in each area.`
    : `Your overall score is <strong>${esc(overallScore)}/100</strong>. It reflects how well your resume meets the requirements of this job.${jobMatchAnalysis.length > 0 ? " The Job Match Analysis below shows the score for each requirement." : ""}`;

  const factorCardsHTML = factorCards.length > 0
    ? `
        <div class="breakdown-grid">
          ${factorCards.map((card) => `
          <div class="breakdown-card">
            <div class="breakdown-card-label">${card.label}</div>
            <div class="breakdown-card-value">${card.value}%</div>
            <div class="breakdown-card-description">${card.description}</div>
          </div>
          `).join('')}
          <div class="breakdown-card breakdown-center">
            <div class="breakdown-card-label">Your Overall Match</div>
            <div class="breakdown-card-value">${esc(overallScore)}</div>
            <div class="breakdown-card-description">Your overall fit for this role. Must-have requirements count most, so this is not a simple average of the areas above.</div>
          </div>
        </div>`
    : "";

  const scoringLogicHTML = scoringLogic && String(scoringLogic).trim()
    ? `<div class="score-logic"><strong>Why this score:</strong> ${esc(scoringLogic)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BIOSYNC Recruiter Analysis - ${esc(candidateName)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #2c3e50;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
    }

    .header h1 {
      font-size: 24px;
      margin-bottom: 10px;
      font-weight: 600;
    }

    .header p {
      font-size: 14px;
      opacity: 0.9;
    }

    .header-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
      margin-top: 25px;
    }

    .header-card {
      background: rgba(255, 255, 255, 0.15);
      padding: 15px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      text-align: center;
    }

    .header-card h3 {
      font-size: 12px;
      opacity: 0.8;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .score-big {
      font-size: 32px;
      font-weight: bold;
      margin: 8px 0;
    }

    .score-label {
      font-size: 13px;
      opacity: 0.85;
    }

    .content {
      padding: 40px 30px;
    }

    .section {
      margin-bottom: 45px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: ${scoreColor};
      margin-bottom: 20px;
      border-bottom: 2px solid ${scoreColor};
      padding-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .section-icon {
      font-size: 22px;
    }

    .summary-box {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid ${scoreColor};
      line-height: 1.7;
      font-size: 15px;
    }

    .match-category-badge {
      display: inline-block;
      background: ${categoryColor};
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .match-category-explanation {
      background: #f0f9ff;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid ${categoryColor};
      font-size: 13px;
      line-height: 1.6;
      color: #0c5460;
      margin-bottom: 20px;
    }

    .match-category-breakdown {
      background: #fafafa;
      padding: 15px;
      border-radius: 6px;
      font-size: 12px;
      line-height: 1.6;
      color: #555;
      margin-top: 15px;
      border-left: 4px solid #999;
    }

    .score-logic {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #667eea;
      font-size: 14px;
      line-height: 1.6;
      margin-top: 15px;
    }

    .improvements-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-top: 15px;
    }

    .improvement-item {
      background: #f0fdf4;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #10b981;
      font-size: 13px;
      line-height: 1.6;
    }

    .improvement-number {
      display: inline-block;
      background: #10b981;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      text-align: center;
      line-height: 24px;
      font-weight: bold;
      font-size: 11px;
      margin-right: 8px;
    }

    .improvement-title {
      font-weight: 600;
      color: #065f46;
      margin-bottom: 4px;
    }

    .improvement-desc {
      color: #047857;
      margin-left: 32px;
    }

    .match-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }

    .match-table th {
      background: #f0f2f5;
      padding: 12px 15px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      color: #2c3e50;
      border-bottom: 2px solid #e0e0e0;
    }

    .match-table td {
      padding: 12px 15px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 14px;
    }

    .match-percentage {
      font-weight: 600;
      color: ${scoreColor};
      font-size: 16px;
    }

    .skills-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 15px;
      margin-top: 15px;
    }

    .skill-section {
      padding: 15px;
      border-radius: 6px;
      background: #f8f9fa;
    }

    .skill-section h4 {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .skill-section.strong h4 {
      color: #28a745;
    }

    .skill-section.moderate h4 {
      color: #ffc107;
    }

    .skill-section.weak h4 {
      color: #dc3545;
    }

    .skill-item {
      background: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 8px;
      border-left: 3px solid;
    }

    .skill-section.strong .skill-item {
      border-color: #28a745;
    }

    .skill-section.moderate .skill-item {
      border-color: #ffc107;
    }

    .skill-section.weak .skill-item {
      border-color: #dc3545;
    }

    .concern-item {
      background: #fff3cd;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 12px;
      border-left: 4px solid #ffc107;
      font-size: 14px;
      line-height: 1.6;
    }

    .concern-label {
      font-weight: 600;
      color: #856404;
      font-size: 12px;
      margin-bottom: 5px;
    }

    .question-item {
      background: #e7f3ff;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 12px;
      border-left: 4px solid #0066cc;
      font-size: 14px;
      line-height: 1.6;
    }

    .question-number {
      display: inline-block;
      background: #0066cc;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      text-align: center;
      line-height: 28px;
      font-weight: bold;
      font-size: 12px;
      margin-right: 10px;
    }

    .recommendation-badge {
      display: inline-block;
      background: ${recommendationColor};
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .recommendation-explanation {
      background: #f0f9ff;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid ${recommendationColor};
      font-size: 13px;
      line-height: 1.6;
      color: #0c5460;
      margin-bottom: 20px;
    }

    .footer {
      background: #f8f9fa;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
      font-size: 13px;
      color: #666;
    }

    .footer p {
      margin-bottom: 10px;
    }

    .info-box {
      background: #e7f3ff;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #0066cc;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 20px;
      color: #0c5460;
    }

    .assessment-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-top: 15px;
    }

    .assessment-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid ${scoreColor};
    }

    .assessment-card h4 {
      font-size: 12px;
      font-weight: 600;
      color: ${scoreColor};
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .assessment-card p {
      font-size: 13px;
      line-height: 1.5;
    }

    .feedback-section {
      background-color: #f5f5f5;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin-top: 20px;
      border-left: 4px solid #667eea;
    }

    .feedback-section p {
      color: #333;
      font-size: 14px;
      margin: 0;
      line-height: 1.6;
      font-weight: 500;
    }

    .breakdown-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-top: 15px;
    }

    .breakdown-card {
      background: linear-gradient(135deg, #f5f7ff 0%, #f0f4ff 100%);
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
      text-align: center;
    }

    .breakdown-card-value {
      font-size: 32px;
      font-weight: 700;
      color: #667eea;
      margin: 8px 0;
    }

    .breakdown-card-label {
      font-size: 12px;
      font-weight: 600;
      color: #555;
      text-transform: uppercase;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .breakdown-card-description {
      font-size: 12px;
      color: #666;
      line-height: 1.5;
    }

    .breakdown-center {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border-left-color: #f59e0b;
      grid-column: 1 / -1;
    }

    .breakdown-center .breakdown-card-value {
      color: #d97706;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }
      .container {
        box-shadow: none;
      }
      .section {
        page-break-inside: avoid;
      }
    }

    @media (max-width: 600px) {
      .header-grid {
        grid-template-columns: 1fr;
      }
      .skills-grid {
        grid-template-columns: 1fr;
      }
      .assessment-grid {
        grid-template-columns: 1fr;
      }
      .breakdown-grid {
        grid-template-columns: 1fr;
      }
      .breakdown-center {
        grid-column: 1;
      }
      .content {
        padding: 20px 15px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Resume Vs The Job: AI-Powered Match Analysis</h1>
      <p>Know your fit. Get interview-ready. Land the role.</p>
      
      <div class="header-grid">
        <div class="header-card">
          <h3>Your Match Score</h3>
          <div class="score-big">${esc(overallScore)}</div>
          <div class="score-label">/100</div>
        </div>
        <div class="header-card">
          <h3>Our Recommendation</h3>
          <div class="score-big" style="font-size: 18px; margin-top: 8px;">${getRecommendationEmoji(interviewRecommendation)} ${esc(getRecommendationLabel(interviewRecommendation))}</div>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="info-box">
        <strong>Candidate:</strong> ${esc(candidateName)} | <strong>Target Role:</strong> ${esc(jobTitle)}
      </div>

      <div class="section">
        <div class="section-title">
          <span class="section-icon">📊</span>
          Match Category
        </div>
        <div class="match-category-badge">${esc(matchCategory)}</div>
        <div class="match-category-explanation">
          ${matchCategoryDetailedExplanation}
        </div>
        <div class="match-category-breakdown">
          <strong>How this category is determined:</strong><br>
          The category follows directly from your overall match score:
          <ul style="margin: 8px 0 0 20px; color: #555;">
            <li><strong>Strong Match (85 to 100):</strong> Your resume covers most or all of the key requirements.</li>
            <li><strong>Partial Match (60 to 84):</strong> Your resume covers several key requirements, with some gaps.</li>
            <li><strong>Weak Match (below 60):</strong> Important requirements of the job are not covered by your resume.</li>
          </ul>
        </div>
      </div>

      <div class="section">
        <div class="section-title">
          <span class="section-icon">📋</span>
          Executive Summary
        </div>
        <div class="summary-box">
          ${esc(executiveSummary)}
        </div>
      </div>

      <div class="section">
        <div class="section-title">
          <span class="section-icon">🔍</span>
          How We Calculated Your Score
        </div>
        <p style="color: #666; margin-bottom: 20px; font-size: 14px;">${scoreIntro}</p>
        ${factorCardsHTML}
        ${scoringLogicHTML}
      </div>

      ${jobMatchAnalysis.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">✓</span>
          Job Match Analysis
        </div>
        <table class="match-table">
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Match</th>
              <th>Assessment</th>
            </tr>
          </thead>
          <tbody>
            ${jobMatchAnalysis.map(item => `
              <tr>
                <td><strong>${esc(item.req ?? item.requirement ?? "")}</strong></td>
                <td class="match-percentage">${requirementPercent(item)}</td>
                <td>${esc(item.ast ?? item.assessment ?? "")}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">
          <span class="section-icon">💼</span>
          Experience & Career Assessment
        </div>
        <div class="assessment-grid">
          <div class="assessment-card">
            <h4>Experience</h4>
            <p>${esc(experienceAssessment)}</p>
          </div>
          <div class="assessment-card">
            <h4>Career Path</h4>
            <p>${esc(careerProgression)}</p>
          </div>
        </div>
      </div>

      ${strongSkills.length > 0 || moderateSkills.length > 0 || weakSkills.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">🎯</span>
          Skills Assessment
        </div>
        <div class="skills-grid">
          ${strongSkills.length > 0 ? `
          <div class="skill-section strong">
            <h4>✅ Strong Evidence</h4>
            ${strongSkills.map(skill => `<div class="skill-item">${esc(textOf(skill))}</div>`).join('')}
          </div>
          ` : ''}
          
          ${moderateSkills.length > 0 ? `
          <div class="skill-section moderate">
            <h4>⚠️ Some Evidence</h4>
            ${moderateSkills.map(skill => `<div class="skill-item">${esc(textOf(skill))}</div>`).join('')}
          </div>
          ` : ''}
          
          ${weakSkills.length > 0 ? `
          <div class="skill-section weak">
            <h4>❌ Not Shown in Your Resume</h4>
            ${weakSkills.map(skill => `<div class="skill-item">${esc(textOf(skill))}</div>`).join('')}
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}

      ${hasImprovements ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">📈</span>
          Top 5 Changes to Improve Your Match
        </div>
        <div class="improvements-list">
          ${top5Improvements.map((improvement, index) => `
            <div class="improvement-item">
              <span class="improvement-number">${index + 1}</span>
              <div class="improvement-title">${esc(textOf(improvement))}</div>
              ${improvement && typeof improvement === "object" && improvement.title && improvement.description ? `<div class="improvement-desc">${esc(improvement.description)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      ${concerns.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">⚡</span>
          Points an Interviewer May Raise
        </div>
        ${concerns.map(concern => `
          <div class="concern-item">
            <div class="concern-label">Point to address</div>
            ${esc(textOf(concern))}
          </div>
        `).join('')}
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">
          <span class="section-icon">💡</span>
          Our Recommendation & Next Steps
        </div>
        <div class="recommendation-badge">${esc(getRecommendationLabel(interviewRecommendation))}</div>
        <div class="recommendation-explanation">
          ${recommendationExplanation}
        </div>
      </div>

      ${interviewQuestions.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">❓</span>
          Interview Questions to Prepare For
        </div>
        ${interviewQuestions.map((q, i) => `
          <div class="question-item">
            <span class="question-number">${i + 1}</span>
            ${esc(textOf(q))}
          </div>
        `).join('')}
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">
          <span class="section-icon">→</span>
          Your Action Plan
        </div>
        <div class="summary-box">
          <strong>1. Review this analysis carefully.</strong> Note where your resume is strong for this role and where it has gaps.<br><br>
          <strong>2. Research the company and role thoroughly.</strong> Tailor your application and prepare targeted responses.<br><br>
          <strong>3. Address any gaps.</strong> If a required skill is missing, decide whether to build it now or to plan for a later application. Keep everything on your resume accurate: employers verify details through interviews and background checks.<br><br>
          <strong>4. Prepare concrete examples.</strong> Have specific examples ready with metrics, outcomes, and results from your experience.<br><br>
          <strong>5. Practice explaining your experience.</strong> Be ready to describe your career so far and what attracts you to this opportunity.
        </div>
      </div>
    </div>

    <div class="footer">
      <p><strong>BIOSYNC © 2026</strong></p>
      <p>Your Resume Vs The Target Job: AI-Powered Match Analysis</p>
      <p>Know your fit. Get interview-ready. Land the role.</p>
      <p style="margin-top: 15px; font-size: 12px; color: #999;">
        This analysis is generated by BIOSYNC AI from the resume and job description provided. It reflects how this resume matches this particular job, and is for guidance only.
      </p>

      <div class="feedback-section">
        <p>We would value your feedback.</p>
        <p>To share comments or suggestions, simply reply to the email this report came with. Thank you.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ===== RECOMMENDATION =====

function normalise(value) {
  return String(value ?? "").toUpperCase();
}

function getRecommendationEmoji(recommendation) {
  const r = normalise(recommendation);
  if (!r) return "❓";
  if (r.includes("PROCEED") || r.includes("STRONG")) return "✅";
  if (r.includes("CONSIDER")) return "👍";
  if (r.includes("REVISIT") || r.includes("MARGINAL")) return "⚠️";
  return "❌";
}

function getRecommendationLabel(recommendation) {
  const r = normalise(recommendation);
  if (!r) return "PENDING";
  if (r.includes("PROCEED") || r.includes("STRONG")) return "PROCEED TO APPLY";
  if (r.includes("CONSIDER")) return "REVIEW & APPLY";
  if (r.includes("REVISIT") || r.includes("MARGINAL")) return "NOT YET THERE";
  if (r.includes("NOT")) return "NOT RECOMMENDED";
  return String(recommendation);
}

function getRecommendationExplanation(recommendation, hasImprovements) {
  const r = normalise(recommendation);

  if (!r) {
    return "A recommendation could not be produced for this analysis. Please refer to your overall score and the Job Match Analysis above.";
  }

  const improvementsPointer = hasImprovements
    ? ` The "Top 5 Changes to Improve Your Match" section shows where to start.`
    : ` The Job Match Analysis and Skills Assessment sections show where the gaps are.`;

  if (r.includes("PROCEED") || r.includes("STRONG")) {
    return `
      <strong>Recommendation: ✅ PROCEED TO APPLY</strong><br><br>
      Your resume is a strong fit for this role. Your skills, experience, and background line up well with the job requirements.
      <br><br>
      <strong>👉 NEXT STEP: Apply.</strong> Use the interview questions in this report to prepare, back up your achievements with numbers where you can,
      and research the company before you interview.
    `;
  }

  if (r.includes("CONSIDER")) {
    return `
      <strong>Recommendation: 👍 REVIEW THE SUGGESTIONS, THEN APPLY</strong><br><br>
      Your resume covers several of the key requirements for this role, with some gaps. This is a worthwhile opportunity to pursue.
      <br><br>
      <strong>👉 NEXT STEP: Review this report, then apply.</strong> Be ready to explain how you would close the gaps, with examples of
      picking up new skills quickly.${improvementsPointer}
    `;
  }

  if (r.includes("REVISIT") || r.includes("MARGINAL")) {
    return `
      <strong>Recommendation: ⚠️ NOT YET THERE</strong><br><br>
      There are notable gaps between your resume and what this job asks for. Closing them before you apply would improve your chances considerably.
      <br><br>
      <strong>👉 NEXT STEP: Work on the gaps first.</strong>${improvementsPointer} Once they are addressed, this role and similar ones will be a much better match.
    `;
  }

  if (r.includes("NOT")) {
    return `
      <strong>Recommendation: ❌ NOT RECOMMENDED FOR THIS ROLE</strong><br><br>
      This role is not a close match for your resume as it stands. Core requirements of the job are not covered, so an application is unlikely to progress.
      This reflects the fit between this resume and this particular job, not your ability or the value of your experience.
      <br><br>
      <strong>👉 NEXT STEP:</strong> We suggest focusing on roles that fit your background more closely. If this type of role is what you want,
      the requirements to meet first are listed in this report.${improvementsPointer}
    `;
  }

  return `Recommendation: ${esc(recommendation)}. Please see the assessment above for details.`;
}

// ===== MATCH CATEGORY =====

function getMatchCategoryExplanation(category) {
  const c = normalise(category);

  if (!c) {
    return "A match category could not be determined. Please refer to your overall score and the Job Match Analysis.";
  }

  if (c.includes("STRONG")) {
    return `
      <strong>Your resume is a strong match for this role.</strong><br><br>
      It covers most or all of the key requirements, and your experience is at the level the role asks for.
    `;
  }

  if (c.includes("PARTIAL")) {
    return `
      <strong>Your resume is a partial match for this role.</strong><br><br>
      It covers several of the key requirements, with some gaps. The sections below show where your resume is strong and where the gaps are.
    `;
  }

  if (c.includes("WEAK") || c.includes("POOR")) {
    return `
      <strong>Your resume is a weak match for this role.</strong><br><br>
      Important requirements of this job are not covered by what is on your resume. The sections below show which ones.
      This reflects the fit between this resume and this particular job, not your ability or the value of your experience.
    `;
  }

  return `Match Category: ${esc(category)}.`;
}

// ===== COLOURS =====

function getScoreColor(score) {
  if (score >= 85) return "#28a745";
  if (score >= 70) return "#0066cc";
  if (score >= 55) return "#ffc107";
  return "#dc3545";
}

function getRecommendationColor(recommendation) {
  const r = normalise(recommendation);
  if (!r) return "#ffc107";
  if (r.includes("PROCEED") || r.includes("STRONG")) return "#28a745";
  if (r.includes("CONSIDER")) return "#0066cc";
  if (r.includes("REVISIT") || r.includes("MARGINAL")) return "#ffc107";
  if (r.includes("NOT")) return "#dc3545";
  return "#ffc107";
}

function getCategoryColor(category) {
  const c = normalise(category);
  if (!c) return "#ffc107";
  if (c.includes("STRONG")) return "#28a745";
  if (c.includes("PARTIAL")) return "#0066cc";
  if (c.includes("WEAK") || c.includes("POOR")) return "#dc3545";
  return "#ffc107";
}

function replaceFeedbackToken(htmlContent, feedbackToken) {
  return htmlContent.replace(/\$\{FEEDBACK_TOKEN\}/g, feedbackToken);
}

module.exports = { generateRecruiterReportHTML, replaceFeedbackToken, getMatchCategoryFromScore };
