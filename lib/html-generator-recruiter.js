// screencv/lib/html-generator-recruiter.js
// Beautiful recruiter analysis report for job seekers

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
    achievementScore,
    concerns = [],
    interviewRecommendation,
    interviewQuestions = [],
    scoringBreakdown = {},
    top5Improvements = [],
    matchCategory = "STRONG MATCH",
  } = data;

  const scoreColor = getScoreColor(overallScore);
  const recommendationColor = getRecommendationColor(interviewRecommendation);
  const categoryColor = getCategoryColor(matchCategory);

  const scoringBreakdownHTML = Object.entries(scoringBreakdown).length > 0 
    ? Object.entries(scoringBreakdown).map(([key, value]) => {
        const percentage = typeof value === 'number' ? value : 0;
        return `
          <div class="score-item">
            <div class="score-item-label">${key}</div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="score-bar">
                <div class="score-bar-fill" style="width: ${percentage}%"></div>
              </div>
              <div class="score-item-value">${percentage}%</div>
            </div>
          </div>
        `;
      }).join('')
    : `<p style="color: #666; font-size: 13px;">Your overall score of <strong>${overallScore}/100</strong> is calculated from your skills match, experience alignment, achievement potential, and interview readiness.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ScreenCV Recruiter Analysis - ${candidateName}</title>
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

    .scoring-breakdown {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-top: 15px;
    }

    .score-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e0e0e0;
    }

    .score-item:last-child {
      border-bottom: none;
    }

    .score-item-label {
      font-size: 13px;
      font-weight: 500;
      color: #2c3e50;
    }

    .score-item-value {
      font-size: 14px;
      font-weight: 600;
      color: ${scoreColor};
    }

    .score-bar {
      width: 200px;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
      margin: 0 15px;
    }

    .score-bar-fill {
      height: 100%;
      background: ${scoreColor};
      border-radius: 4px;
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
      background-color: #fafafa;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
      margin-top: 20px;
    }

    .feedback-section p {
      color: #666;
      font-size: 13px;
      margin: 0 0 12px 0;
      font-weight: 500;
    }

    .feedback-button {
      display: inline-block;
      padding: 10px 25px;
      background-color: #ff6b35;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: bold;
      transition: background-color 0.3s ease;
    }

    .feedback-button:hover {
      background-color: #ff5722;
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
      .content {
        padding: 20px 15px;
      }
      .score-bar {
        width: 100px;
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
          <h3>Overall Score</h3>
          <div class="score-big">${overallScore}</div>
          <div class="score-label">/100</div>
        </div>
        <div class="header-card">
          <h3>Achievement Score</h3>
          <div class="score-big">${achievementScore}</div>
          <div class="score-label">/100</div>
        </div>
        <div class="header-card">
          <h3>Match Category</h3>
          <div class="score-big" style="font-size: 16px; margin-top: 8px;">${matchCategory === 'STRONG MATCH' ? '✅' : matchCategory === 'PARTIAL MATCH' ? '⚡' : '⚠️'} ${matchCategory}</div>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="info-box">
        <strong>Candidate:</strong> ${candidateName} | <strong>Target Role:</strong> ${jobTitle}
      </div>

      <div class="section">
        <div class="section-title">
          <span class="section-icon">🎯</span>
          Your Match Category
        </div>
        <div class="match-category-badge">${matchCategory}</div>
        <div class="match-category-explanation">
          ${
            matchCategory === 'STRONG MATCH' 
              ? 'You have strong alignment with the job requirements. Your skills, experience, and background closely match what the employer is looking for. You are well-positioned to succeed in this role.'
              : matchCategory === 'PARTIAL MATCH'
              ? 'You have a solid foundation and several key skills, but there are some areas where additional experience or skill development could strengthen your candidacy. Addressing these gaps will significantly improve your prospects.'
              : 'While your profile shows potential, there are notable gaps between your current experience and the job requirements. Consider gaining experience in the identified weak areas before applying, or be prepared to address these gaps candidly in interviews.'
          }
        </div>
      </div>

      <div class="section">
        <div class="section-title">
          <span class="section-icon">📋</span>
          Executive Summary
        </div>
        <div class="summary-box">
          ${executiveSummary}
        </div>
      </div>

      <div class="section">
        <div class="section-title">
          <span class="section-icon">🔍</span>
          Why You Got This Score
        </div>
        <div class="scoring-breakdown">
          ${scoringBreakdownHTML}
        </div>
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
                <td><strong>${item.req || item.requirement}</strong></td>
                <td class="match-percentage">${item.pct || item.percentage}%</td>
                <td>${item.ast || item.assessment}</td>
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
            <p>${experienceAssessment}</p>
          </div>
          <div class="assessment-card">
            <h4>Career Progression</h4>
            <p>${careerProgression}</p>
          </div>
        </div>
      </div>

      ${skills.strong.length > 0 || skills.moderate.length > 0 || skills.weak.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">🎯</span>
          Skills Assessment
        </div>
        <div class="skills-grid">
          ${skills.strong.length > 0 ? `
          <div class="skill-section strong">
            <h4>✅ Strong Evidence</h4>
            ${skills.strong.map(skill => `<div class="skill-item">${skill}</div>`).join('')}
          </div>
          ` : ''}
          
          ${skills.moderate.length > 0 ? `
          <div class="skill-section moderate">
            <h4>⚠️ Moderate Evidence</h4>
            ${skills.moderate.map(skill => `<div class="skill-item">${skill}</div>`).join('')}
          </div>
          ` : ''}
          
          ${skills.weak.length > 0 ? `
          <div class="skill-section weak">
            <h4>❌ Weak/Missing</h4>
            ${skills.weak.map(skill => `<div class="skill-item">${skill}</div>`).join('')}
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}

      ${top5Improvements.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">📈</span>
          Top 5 Changes to Improve Your Match
        </div>
        <div class="improvements-list">
          ${top5Improvements.map((improvement, index) => `
            <div class="improvement-item">
              <span class="improvement-number">${index + 1}</span>
              <div class="improvement-title">${improvement.title || improvement}</div>
              ${improvement.description ? `<div class="improvement-desc">${improvement.description}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      ${concerns.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">⚡</span>
          Areas to Validate in Interview
        </div>
        ${concerns.map(concern => `
          <div class="concern-item">
            <div class="concern-label">Validation Point</div>
            ${concern}
          </div>
        `).join('')}
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">
          <span class="section-icon">🎤</span>
          Interview Recommendation
        </div>
        <div class="recommendation-badge">${interviewRecommendation || "PENDING"}</div>
        <div class="info-box">
          Based on this analysis, the candidate should ${
            (interviewRecommendation && interviewRecommendation.includes('PROCEED')) 
              ? 'definitely be interviewed' 
              : (interviewRecommendation && interviewRecommendation.includes('REVISIT')) 
                ? 'be revisited after addressing key gaps'
                : 'be considered for interview'
          }. Focus on validating areas highlighted above.
        </div>
      </div>

      ${interviewQuestions.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">❓</span>
          Suggested Interview Questions
        </div>
        ${interviewQuestions.map((q, i) => `
          <div class="question-item">
            <span class="question-number">${i + 1}</span>
            ${q}
          </div>
        `).join('')}
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">
          <span class="section-icon">→</span>
          Next Steps for Candidate
        </div>
        <div class="summary-box">
          <strong>1. Review this analysis carefully.</strong> Understand your strengths and areas to develop.<br><br>
          <strong>2. Prepare for interview questions.</strong> Research the company and role thoroughly.<br><br>
          <strong>3. Address weak areas.</strong> If critical skills are missing, consider learning or gaining relevant experience.<br><br>
          <strong>4. Quantify achievements.</strong> Prepare examples with specific metrics and results.<br><br>
          <strong>5. Practice your story.</strong> Be ready to explain your career progression and motivation for this role.
        </div>
      </div>
    </div>

    <div class="footer">
      <p><strong>ScreenCV © 2026</strong></p>
      <p>Your Resume Vs The Job: AI-Powered Match Analysis</p>
      <p>Know your fit. Get interview-ready. Land the role.</p>
      <p style="margin-top: 15px; font-size: 12px; color: #999;">
        This recruiter analysis is generated by ScreenCV AI and is based on the resume and job description provided. Recommendations are for guidance only.
      </p>

      <div class="feedback-section">
        <p>Help us improve! Rate this analysis.</p>
        <a href="https://screencv.app/feedback?token=\${FEEDBACK_TOKEN}" class="feedback-button">
          ⭐ Rate This Analysis
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function getScoreColor(score) {
  if (score >= 85) return "#28a745";
  if (score >= 70) return "#0066cc";
  if (score >= 55) return "#ffc107";
  return "#dc3545";
}

function getRecommendationColor(recommendation) {
  if (!recommendation) return "#ffc107"; // Yellow for unknown
  if (recommendation.includes("PROCEED")) return "#28a745";
  if (recommendation.includes("CONSIDER")) return "#0066cc";
  return "#dc3545";
}

function getCategoryColor(category) {
  if (!category) return "#ffc107"; // Yellow for unknown
  if (category.includes("STRONG")) return "#28a745";
  if (category.includes("PARTIAL")) return "#0066cc";
  return "#dc3545";
}

function replaceFeedbackToken(htmlContent, feedbackToken) {
  return htmlContent.replace(/\$\{FEEDBACK_TOKEN\}/g, feedbackToken);
}

module.exports = { generateRecruiterReportHTML, replaceFeedbackToken };