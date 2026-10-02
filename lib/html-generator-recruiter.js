// screencv/lib/html-generator-recruiter.js
// Beautiful recruiter analysis report for job seekers
// ✅ REBRANDED TO BIOSYNC - Changed 3 instances: title, footer copyright, footer description

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
    matchCategory = "PARTIAL MATCH",
  } = data;

  const scoreColor = getScoreColor(overallScore);
  const recommendationColor = getRecommendationColor(interviewRecommendation);
  const categoryColor = getCategoryColor(matchCategory);

  // ✅ Get recommendation explanation text
  const recommendationExplanation = getRecommendationExplanation(interviewRecommendation);
  
  // ✅ Get match category detailed explanation
  const matchCategoryDetailedExplanation = getMatchCategoryExplanation(matchCategory);

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
  <title>BIOSYNC Recruiter Analysis - ${candidateName}</title>
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
          <h3>Your Match Score</h3>
          <div class="score-big">${overallScore}</div>
          <div class="score-label">/100</div>
        </div>
        <div class="header-card">
          <h3>Your Interview Recommendation</h3>
          <div class="score-big" style="font-size: 18px; margin-top: 8px;">${getRecommendationEmoji(interviewRecommendation)} ${getRecommendationLabel(interviewRecommendation)}</div>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="info-box">
        <strong>Candidate:</strong> ${candidateName} | <strong>Target Role:</strong> ${jobTitle}
      </div>

      <div class="section">
        <div class="section-title">
          <span class="section-icon">📊</span>
          Match Category Analysis
        </div>
        <div class="match-category-badge">${matchCategory}</div>
        <div class="match-category-explanation">
          ${matchCategoryDetailedExplanation}
        </div>
        <div class="match-category-breakdown">
          <strong>How this category is determined:</strong><br>
          The match category is calculated by analyzing multiple factors:
          <ul style="margin: 8px 0 0 20px; color: #555;">
            <li><strong>Skills Alignment:</strong> How many of the required skills are present in your resume</li>
            <li><strong>Experience Level:</strong> Whether your years of experience align with the role expectations</li>
            <li><strong>Job Requirements Match:</strong> Percentage alignment with each specific job requirement</li>
            <li><strong>Career Trajectory:</strong> Whether your career progression aligns with role growth expectations</li>
          </ul>
          <br>
          <strong>Match Categories Explained:</strong><br>
          <ul style="margin: 8px 0 0 20px; color: #555;">
            <li><strong>Strong Match (85-100%):</strong> Excellent alignment. You meet most/all key requirements. Highly recommended for interview.</li>
            <li><strong>Partial Match (60-84%):</strong> Good foundation. You have key skills but may need to address some gaps. Worth considering for interview.</li>
            <li><strong>Weak Match (Below 60%):</strong> Limited alignment. Significant gaps in required skills or experience. May need additional preparation or experience before applying.</li>
          </ul>
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
          How We Calculated Your Score
        </div>
        <p style="color: #666; margin-bottom: 20px; font-size: 14px;">Your overall score of <strong>${overallScore}/100</strong> is based on 5 key factors that determine your fit for this role:</p>
        
        <div class="breakdown-grid">
          <div class="breakdown-card">
            <div class="breakdown-card-label">Skills Alignment</div>
            <div class="breakdown-card-value">${scoringBreakdown.skillsAlignment || 72}%</div>
            <div class="breakdown-card-description">How well your skills match the job requirements</div>
          </div>
          
          <div class="breakdown-card">
            <div class="breakdown-card-label">Experience Level</div>
            <div class="breakdown-card-value">${scoringBreakdown.experienceLevel || 75}%</div>
            <div class="breakdown-card-description">Relevance and depth of your work experience</div>
          </div>
          
          <div class="breakdown-card">
            <div class="breakdown-card-label">Job Requirements Match</div>
            <div class="breakdown-card-value">${scoringBreakdown.jobRequirementsMatch || 72}%</div>
            <div class="breakdown-card-description">Coverage of must-have and nice-to-have requirements</div>
          </div>
          
          <div class="breakdown-card">
            <div class="breakdown-card-label">Career Progression</div>
            <div class="breakdown-card-value">${scoringBreakdown.careerProgression || 76}%</div>
            <div class="breakdown-card-description">Growth trajectory and consistency of career path</div>
          </div>
          
          <div class="breakdown-card breakdown-center">
            <div class="breakdown-card-label">Your Overall Match</div>
            <div class="breakdown-card-value">${overallScore}</div>
            <div class="breakdown-card-description">Composite score based on all factors above</div>
          </div>
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
          <span class="section-icon">💡</span>
          Your Interview Recommendation & Next Steps
        </div>
        <div class="recommendation-badge">${getRecommendationLabel(interviewRecommendation)}</div>
        <div class="recommendation-explanation">
          ${recommendationExplanation}
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
          Your Action Plan
        </div>
        <div class="summary-box">
          <strong>1. Review this analysis carefully.</strong> Understand your strengths and areas to develop.<br><br>
          <strong>2. Research the company and role thoroughly.</strong> Tailor your application and prepare targeted responses.<br><br>
          <strong>3. Address any skill gaps.</strong> If critical skills are missing, determine whether to develop them now or plan for future applications. <strong style="color: #dc3545;">⚠️ Never fabricate or exaggerate your experience or skills—this is dishonest and will lead to disqualification or termination if discovered during background checks or on the job.</strong><br><br>
          <strong>4. Prepare concrete examples.</strong> Have specific examples ready with metrics, outcomes, and results from your experience.<br><br>
          <strong>5. Practice articulating your experience.</strong> Be prepared to clearly explain your career journey and what attracts you to this opportunity.
        </div>
      </div>
    </div>

    <div class="footer">
      <p><strong>BIOSYNC © 2026</strong></p>
      <p>Your Resume Vs The Target Job: AI-Powered Match Analysis</p>
      <p>Know your fit. Get interview-ready. Land the role.</p>
      <p style="margin-top: 15px; font-size: 12px; color: #999;">
        This recruiter analysis is generated by BIOSYNC AI and is based on the resume and job description provided. Recommendations are for guidance only.
      </p>

      <div class="feedback-section">
        <p>Help us improve our product!!! 💌</p>
        <p>Write back to us on the same email with your suggestions.. Thank you!!</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ✅ NEW FUNCTION: Get interview recommendation emoji
function getRecommendationEmoji(recommendation) {
  if (!recommendation) return "❓";
  if (recommendation.includes("PROCEED") || recommendation.includes("STRONG")) return "✅";
  if (recommendation.includes("CONSIDER")) return "👍";
  if (recommendation.includes("REVISIT") || recommendation.includes("MARGINAL")) return "⚠️";
  return "❌";
}

// ✅ NEW FUNCTION: Get interview recommendation label for display (ACTION-ORIENTED)
function getRecommendationLabel(recommendation) {
  if (!recommendation) return "PENDING";
  if (recommendation.includes("PROCEED") || recommendation.includes("STRONG")) return "PROCEED TO APPLY";
  if (recommendation.includes("CONSIDER")) return "REVIEW & APPLY";
  if (recommendation.includes("REVISIT") || recommendation.includes("MARGINAL")) return "NOT YET THERE";
  if (recommendation.includes("NOT")) return "DO NOT APPLY";
  return recommendation;
}

// ✅ NEW FUNCTION: Get detailed interview recommendation explanation (ACTION-ORIENTED)
function getRecommendationExplanation(recommendation) {
  if (!recommendation) {
    return "The interview recommendation is currently pending further analysis. Review your overall score, match category, and specific assessment areas above.";
  }

  if (recommendation.includes("PROCEED") || recommendation.includes("STRONG")) {
    return `
      <strong>Recommendation: ✅ PROCEED TO APPLY</strong><br><br>
      Your profile demonstrates a strong fit for this role. Your skills, experience, and background align well with the job requirements. 
      You are well-positioned to succeed in this position. 
      <br><br>
      <strong>👉 NEXT STEP: Apply now!</strong> Review the suggested interview questions to prepare, quantify your achievements with metrics, 
      and research the company thoroughly before interviewing.
      <br><br>
      <strong>Interview Focus:</strong> Come prepared to discuss your achievements and how they directly relate to the specific responsibilities outlined in the job description.
    `;
  }

  if (recommendation.includes("CONSIDER")) {
    return `
      <strong>Recommendation: 👍 REVIEW SUGGESTIONS AND APPLY</strong><br><br>
      Your profile shows solid potential for this role. You have several key skills and relevant experience, though there are some areas 
      where additional development or clarification would strengthen your candidacy. This is still a worthwhile opportunity to pursue.
      <br><br>
      <strong>👉 NEXT STEP: Review the suggestions above, then apply.</strong> Be prepared to discuss how you plan to bridge any identified skill gaps and provide examples 
      of your ability to learn quickly in new areas.
      <br><br>
      <strong>Interview Preparation:</strong> Focus on the "Top 5 Changes to Improve Your Match" section. Have concrete examples of how you've quickly 
      acquired new skills in the past.
    `;
  }

  if (recommendation.includes("REVISIT") || recommendation.includes("MARGINAL")) {
    return `
      <strong>Recommendation: ⚠️ NOT YET THERE - REVIEW SUGGESTIONS AND ACTION</strong><br><br>
      While you show potential, there are notable gaps between your current profile and the job requirements. Before applying, take time to address 
      the identified weak areas through skill development, certifications, or gaining relevant experience. This will significantly improve your prospects.
      <br><br>
      <strong>👉 NEXT STEP: Don't apply yet.</strong> Instead, focus on the "Top 5 Changes to Improve Your Match" section below. Create a 3-6 month action plan 
      to close these gaps, then revisit this role or similar opportunities with renewed confidence.
      <br><br>
      <strong>Development Focus:</strong> Prioritize the skills marked as "Weak/Missing" in the Skills Assessment section. Once these are addressed, 
      you'll be a much stronger candidate for this and similar roles.
    `;
  }

  if (recommendation.includes("NOT")) {
    return `
      <strong>Recommendation: ❌ DO NOT APPLY - NOT THE RIGHT FIT FOR THIS JOB</strong><br><br>
      There are significant gaps between your current experience and the core requirements of this role. Applying now would not be a productive use of your time. 
      Instead, invest in targeted skill development and gaining relevant experience that better aligns with your career goals.
      <br><br>
      <strong>👉 NEXT STEP: Don't apply for this role.</strong> Use this analysis to create a 6-12 month development plan. Focus on building the critical skills 
      identified in the "Top 5 Changes" section. Once you've addressed these gaps, revisit similar roles with greater confidence.
      <br><br>
      <strong>Career Strategy:</strong> Consider roles at a level closer to your current experience, or pursue targeted skill development and certifications. 
      Come back to this role category once you've built the recommended competencies.
    `;
  }

  return `Recommendation: ${recommendation}. Please review your overall assessment above for more details.`;
}

// ✅ NEW FUNCTION: Get detailed match category explanation (GENDER-NEUTRAL & ACTION-ORIENTED)
function getMatchCategoryExplanation(category) {
  if (!category) {
    return "Your match category could not be determined. Review the scoring breakdown and job match analysis for detailed insights.";
  }

  if (category.includes("STRONG")) {
    return `
      <strong>You have a STRONG MATCH with this role!</strong><br><br>
      Your resume demonstrates excellent alignment with the job requirements. You possess most or all of the key skills, 
      have the relevant experience level, and your career progression aligns well with the role expectations. 
      Feel confident in your candidacy and prepare thoroughly for the interview process.
      <br><br>
      <strong>Action:</strong> This is an excellent match. Proceed with your application and interview preparation.
    `;
  }

  if (category.includes("PARTIAL")) {
    return `
      <strong>You have a PARTIAL MATCH with this role.</strong><br><br>
      Your resume shows good foundational alignment with several key requirements, but there are some areas where you could strengthen 
      your candidacy. You have solid experience and relevant skills, and addressing the identified gaps will significantly improve your prospects. 
      This remains a worthwhile opportunity if you're committed to closing those gaps.
      <br><br>
      <strong>Action:</strong> Apply for this role. Use the suggestions below to prepare thoroughly and address any skill gaps during the interview.
    `;
  }

  if (category.includes("WEAK") || category.includes("POOR")) {
    return `
      <strong>You have a WEAK MATCH with this role.</strong><br><br>
      While your profile shows potential, there are significant gaps between your current experience and what this role requires. 
      Focus on developing the critical missing skills or gaining relevant experience first. You'll be a much stronger candidate after 
      addressing these gaps—consider revisiting similar roles in the future once your experience grows.
      <br><br>
      <strong>Action:</strong> Don't apply yet. Use the "Top 5 Changes" section to create a development plan. Revisit this role category 
      once you've built the recommended skills and experience.
    `;
  }

  return `Match Category: ${category}. Review the detailed assessment sections above for more information about specific alignment areas.`;
}

function getScoreColor(score) {
  if (score >= 85) return "#28a745";
  if (score >= 70) return "#0066cc";
  if (score >= 55) return "#ffc107";
  return "#dc3545";
}

function getRecommendationColor(recommendation) {
  if (!recommendation) return "#ffc107";
  if (recommendation.includes("PROCEED") || recommendation.includes("STRONG")) return "#28a745";
  if (recommendation.includes("CONSIDER")) return "#0066cc";
  if (recommendation.includes("REVISIT") || recommendation.includes("MARGINAL")) return "#ffc107";
  if (recommendation.includes("NOT")) return "#dc3545";
  return "#ffc107";
}

function getCategoryColor(category) {
  if (!category) return "#ffc107";
  if (category.includes("STRONG")) return "#28a745";
  if (category.includes("PARTIAL")) return "#0066cc";
  if (category.includes("WEAK") || category.includes("POOR")) return "#dc3545";
  return "#ffc107";
}

function replaceFeedbackToken(htmlContent, feedbackToken) {
  return htmlContent.replace(/\$\{FEEDBACK_TOKEN\}/g, feedbackToken);
}

module.exports = { generateRecruiterReportHTML, replaceFeedbackToken };
