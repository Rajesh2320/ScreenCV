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
//  8. The report explains why the overall score differs from the average of
//     the requirement scores: it states the average, and names the must-have
//     requirements that pulled the score down. Must-have rows are tagged in
//     the table.
//  9. New sections: "Suggested Rewrites for Your Resume", "Keywords Missing
//     From Your Resume", interview questions with talking points, and (for
//     weak matches) "Roles That May Suit Your Resume Better". Each appears
//     only when there is content for it.
// 10. The top row shows three cards in this order: match score, role applied
//     for, recommendation.
// 11. The BIOSYNC name is now shown at the top of the report itself. It was
//     previously only in the browser tab title and the footer.
// 12. The hiring company is shown next to the role when the job description
//     names it.
// 14. New section "Practical Points to Confirm": job conditions such as
//     location, shift timings and joining date are listed there and are not
//     part of the score.
// 15. The footer now invites the reader to reply if anything in the report
//     looks wrong, with a free re-check.
// 13. The overall score is now calculated from the requirement rows by a fixed
//     rule ("two halves"): half is the average of the must-have requirements,
//     half is the average of the others. The report shows the working as a
//     small table with both averages and their midpoint. The area ratings are shown separately and labelled as not being
//     part of the calculation.

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

// Shows how the overall score was calculated ("two halves"): the must-have
// requirements and their average, the other requirements and their average,
// and the midpoint of the two.
// "calc" is the score_calculation object produced by lib/claude-scoring.js.
// Returns "" when there is no calculation to show, or when the working would
// not reproduce the score printed on the report.
function buildScoreCalculationHTML(calc, overallScore, jobMatchAnalysis) {
  if (!calc || typeof calc !== "object" || calc.method !== "two-halves") return "";
  const n = (value) => (value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null);
  const uncapped = n(calc.uncappedScore), final = n(calc.finalScore);
  if (uncapped === null || final === null || final !== Number(overallScore)) return "";

  const rows = (Array.isArray(jobMatchAnalysis) ? jobMatchAnalysis : [])
    .map((item) => ({
      name: String(item.req ?? item.requirement ?? "").trim(),
      pct: parsePercent(item.pct ?? item.percentage ?? item.match),
      must: item.must === true,
    }))
    .filter((row) => row.pct !== null && row.name);
  if (rows.length === 0) return "";

  const mustRows = rows.filter((row) => row.must);
  const otherRows = rows.filter((row) => !row.must);
  const average = (list) => (list.length > 0 ? Math.round(list.reduce((sum, row) => sum + row.pct, 0) / list.length) : null);
  const mustAverage = average(mustRows), otherAverage = average(otherRows);

  // Recalculate from the rows on this report; show the working only if it matches
  const exact = mustAverage !== null && otherAverage !== null ? (mustAverage + otherAverage) / 2 : (mustAverage !== null ? mustAverage : otherAverage);
  if (Math.round(exact) !== uncapped) return "";

  const list = (items) => (Array.isArray(items) ? items : []).map((row) => `${esc(row.req)} (${n(row.pct)}%)`).join(", ");
  const group = (title, groupRows, avg, avgLabel) => groupRows.length === 0 ? "" : `
            <tr class="calc-group"><td colspan="2">${title}</td></tr>${groupRows.map((row) => `
            <tr><td>${esc(row.name)}</td><td class="num">${row.pct}</td></tr>`).join("")}
            <tr class="calc-average"><td>${avgLabel}</td><td class="num">${avg}</td></tr>`;

  let intro, result;
  if (mustAverage !== null && otherAverage !== null) {
    intro = `Half of your score comes from the job's <strong>must-have</strong> requirements, and half from its other requirements.`;
    result = Number.isInteger(exact)
      ? `(${mustAverage} + ${otherAverage}) &divide; 2 = <strong>${uncapped}</strong>`
      : `(${mustAverage} + ${otherAverage}) &divide; 2 = ${exact}, which rounds to <strong>${uncapped}</strong>`;
  } else if (mustAverage !== null) {
    intro = `Every requirement for this job is a must-have, so your score is the average of your requirement scores.`;
    result = `Average of the ${mustRows.length} requirements = <strong>${uncapped}</strong>`;
  } else {
    intro = `None of the requirements for this job is marked as a must-have, so your score is the average of your requirement scores.`;
    result = `Average of the ${otherRows.length} requirements = <strong>${uncapped}</strong>`;
  }

  let cap = "";
  if (calc.capped === true && Array.isArray(calc.missingMustHaves) && calc.missingMustHaves.length > 0) {
    cap =
      `<p>Because ${calc.missingMustHaves.length === 1 ? "a must-have" : "must-haves"} scored below ${n(calc.missingBelow)} ` +
      `(${list(calc.missingMustHaves)}), the score cannot go above ${final}. Your score is <strong>${final}</strong>.</p>`;
  }

  let weakest = "";
  if (Array.isArray(calc.weakMustHaves) && calc.weakMustHaves.length > 0) {
    weakest =
      `<p>${calc.weakMustHaves.length === 1 ? "The must-have" : "The must-haves"} holding your score back most: ` +
      `<strong>${list(calc.weakMustHaves)}</strong>.</p>`;
  }

  return `
        <div class="score-logic">
          <p><strong>How your score is calculated.</strong> ${intro}</p>
          <table class="calc-table">
            <thead>
              <tr><th>Requirement</th><th class="num">Your score</th></tr>
            </thead>
            <tbody>${group("Must-have requirements", mustRows, mustAverage, "Average of the must-haves")}${group(mustRows.length > 0 ? "Other requirements" : "Requirements", otherRows, otherAverage, mustRows.length > 0 ? "Average of the other requirements" : "Average")}
            </tbody>
          </table>
          <p class="calc-result">${result}${calc.capped === true ? "" : ` &nbsp;&rarr;&nbsp; your score is <strong>${final}</strong> out of 100`}</p>
          ${cap}
          ${weakest}
          <p class="calc-note">Averages are rounded to whole numbers.</p>
        </div>`;
}

// Explains the difference between the overall score and the plain average of
// the requirement scores, using only numbers that are in the report.
function buildScoreGapHTML(jobMatchAnalysis, overallScore) {
  const overall = Number(overallScore);
  const rows = (Array.isArray(jobMatchAnalysis) ? jobMatchAnalysis : [])
    .map((item) => ({
      name: String(item.req ?? item.requirement ?? "").trim(),
      pct: parsePercent(item.pct ?? item.percentage ?? item.match),
      must: item.must === true,
    }))
    .filter((row) => row.pct !== null && row.name);

  if (rows.length === 0 || !Number.isFinite(overall)) return "";

  const average = Math.round(rows.reduce((sum, row) => sum + row.pct, 0) / rows.length);
  const list = (items) => items.map((row) => `${esc(row.name)} (${row.pct}%)`).join(", ");
  const box = (text) => `<div class="score-logic"><strong>How this compares with the table below:</strong> ${text}</div>`;

  if (overall <= average - 5) {
    const unmetMustHaves = rows.filter((row) => row.must && row.pct < 50);
    if (unmetMustHaves.length > 0) {
      return box(
        `The plain average of the requirement scores is <strong>${average}%</strong>. Your overall score is lower because it is not a simple average: ` +
        `must-have requirements count the most, and ${unmetMustHaves.length === 1 ? "this one" : "these"} scored below 50%: <strong>${list(unmetMustHaves)}</strong>. ` +
        `A low score on a must-have pulls the overall score down more than a low score elsewhere.`
      );
    }
    const lowest = rows.filter((row) => row.pct < 50).sort((a, b) => a.pct - b.pct).slice(0, 3);
    return box(
      `The plain average of the requirement scores is <strong>${average}%</strong>. Your overall score is lower because it is not a simple average: ` +
      `requirements that are essential for the job count the most.` +
      (lowest.length > 0 ? ` The lowest-scoring requirements are: <strong>${list(lowest)}</strong>.` : "")
    );
  }

  if (overall >= average + 5) {
    return box(
      `The plain average of the requirement scores is <strong>${average}%</strong>. Your overall score is higher because it is not a simple average: ` +
      `requirements that are essential for the job count the most.`
    );
  }

  return box(`Your overall score is in line with the plain average of the requirement scores, which is <strong>${average}%</strong>.`);
}

// ===== MAIN =====

async function generateRecruiterReportHTML(data) {
  const {
    candidateName,
    jobTitle,
    companyName = "",
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
    scoreCalculation = null,
    scoringLogic = "",
    top5Improvements = [],
    matchCategory: suppliedCategory = "",
    practicalPoints = [],
    resumeRewrites = [],
    missingKeywords = [],
    interviewPrep = [],
    betterFitRoles = [],
  } = data;

  const strongSkills = Array.isArray(skills?.strong) ? skills.strong : [];
  const moderateSkills = Array.isArray(skills?.moderate) ? skills.moderate : [];
  const weakSkills = Array.isArray(skills?.weak) ? skills.weak : [];

  // The category always follows the score, so the badge and the score agree
  const matchCategory = Number.isFinite(Number(overallScore))
    ? getMatchCategoryFromScore(Number(overallScore))
    : (suppliedCategory || "");

  const hasImprovements = Array.isArray(top5Improvements) && top5Improvements.length > 0;

  // Practical conditions (location, shifts, joining date...) are not scored
  const practical = (Array.isArray(practicalPoints) ? practicalPoints : []).filter((p) => p && p.req);

  // Practical extras. Each section is shown only when it has real content.
  const rewrites = (Array.isArray(resumeRewrites) ? resumeRewrites : []).filter((r) => r && r.before && r.after);
  const keywords = (Array.isArray(missingKeywords) ? missingKeywords : []).filter((k) => k && k.term);
  const prep = (Array.isArray(interviewPrep) ? interviewPrep : []).filter((p) => p && p.question);
  const isWeakMatch = Number.isFinite(Number(overallScore)) && Number(overallScore) < 60;
  const roles = isWeakMatch ? (Array.isArray(betterFitRoles) ? betterFitRoles : []).filter((r) => r && r.role) : [];

  const scoreColor = getScoreColor(overallScore);
  const recommendationColor = getRecommendationColor(interviewRecommendation);
  const categoryColor = getCategoryColor(matchCategory);

  const recommendationExplanation = getRecommendationExplanation(interviewRecommendation, {
    hasImprovements,
    hasRewrites: rewrites.length > 0,
    hasKeywords: keywords.length > 0,
    hasRoles: roles.length > 0,
  });
  const matchCategoryDetailedExplanation = getMatchCategoryExplanation(matchCategory);

  // Area ratings: only real numbers are shown. Nothing is filled in.
  const areaCards = [
    ["Skills Alignment", scoringBreakdown?.skillsAlignment, "How well your skills match the skills this job asks for"],
    ["Experience Relevance", scoringBreakdown?.experienceLevel, "How relevant your work experience is to this role"],
    ["Job Requirements Match", scoringBreakdown?.jobRequirementsMatch, "Average of the requirement scores in the Job Match Analysis table"],
    ["Career Fit", scoringBreakdown?.careerProgression, "How well your career path so far fits this role"],
  ]
    .map(([label, value, description]) => ({ label, value: parsePercent(value), description }))
    .filter((card) => card.value !== null);

  // When the score was calculated from the requirement rows, the report shows
  // the working. Otherwise it falls back to comparing the score with the
  // plain average of the rows.
  const scoreCalculationHTML = buildScoreCalculationHTML(scoreCalculation, overallScore, jobMatchAnalysis);
  const isCalculated = scoreCalculationHTML !== "";

  const scoreIntro = isCalculated
    ? `Your overall score is <strong>${esc(overallScore)}/100</strong>. The table below shows exactly how it is worked out.`
    : `Your overall score is <strong>${esc(overallScore)}/100</strong>. It reflects how well your resume meets the requirements of this job.${jobMatchAnalysis.length > 0 ? " The Job Match Analysis below shows the score for each requirement." : ""}`;

  const overallCardHTML = `
        <div class="breakdown-grid">
          <div class="breakdown-card breakdown-center">
            <div class="breakdown-card-label">Your Overall Match</div>
            <div class="breakdown-card-value">${esc(overallScore)}</div>
            <div class="breakdown-card-description">${isCalculated
              ? "Half from the job's must-have requirements, half from its other requirements."
              : "Your overall fit for this role. Must-have requirements count most."}</div>
          </div>
        </div>`;

  const areaCardsHTML = areaCards.length > 0
    ? `
        <p style="color: #666; margin: 25px 0 0; font-size: 14px;"><strong>Your fit by area.</strong> These are separate ratings of each area. They are not part of the score calculation.</p>
        <div class="breakdown-grid area-grid">
          ${areaCards.map((card) => `
          <div class="breakdown-card">
            <div class="breakdown-card-label">${card.label}</div>
            <div class="breakdown-card-value">${card.value}%</div>
            <div class="breakdown-card-description">${card.description}</div>
          </div>
          `).join('')}
        </div>`
    : "";

  const scoreGapHTML = isCalculated ? "" : buildScoreGapHTML(jobMatchAnalysis, overallScore);

  const scoringLogicHTML = scoringLogic && String(scoringLogic).trim()
    ? `<div class="score-logic"><strong>What most affects your match:</strong> ${esc(scoringLogic)}</div>`
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

    .brand {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.3);
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

    .must-tag {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 8px;
      border-radius: 10px;
      background: #fde8e8;
      color: #b42318;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .section-note {
      color: #666;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 15px;
    }

    .practical-item {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      border-radius: 6px;
      padding: 12px 15px;
      margin-bottom: 10px;
      font-size: 14px;
      line-height: 1.6;
    }

    .practical-name {
      font-weight: 600;
      color: #2c3e50;
    }

    .practical-note {
      color: #555;
    }

    .rewrite-item {
      background: #f8f9fa;
      border-radius: 6px;
      border-left: 4px solid #10b981;
      padding: 15px;
      margin-bottom: 12px;
      font-size: 14px;
      line-height: 1.6;
    }

    .rewrite-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #666;
      margin-bottom: 3px;
    }

    .rewrite-before {
      color: #555;
      margin-bottom: 12px;
    }

    .rewrite-after {
      color: #065f46;
      font-weight: 600;
      margin-bottom: 10px;
    }

    .rewrite-why {
      font-size: 13px;
      color: #666;
    }

    .keyword-item {
      padding: 12px 0;
      border-bottom: 1px solid #e0e0e0;
      font-size: 14px;
      line-height: 1.5;
    }

    .keyword-item:last-child {
      border-bottom: none;
    }

    .keyword-term {
      display: inline-block;
      margin-bottom: 6px;
      background: #e7f3ff;
      color: #0c5460;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 13px;
    }

    .keyword-where {
      color: #555;
    }

    .prep-points {
      margin: 10px 0 0 38px;
      font-size: 13px;
      color: #333;
    }

    .prep-points-label {
      font-weight: 600;
      color: #0c5460;
      margin-bottom: 4px;
    }

    .prep-points ul {
      margin-left: 18px;
    }

    .role-item {
      background: #f0fdf4;
      border-left: 4px solid #10b981;
      border-radius: 6px;
      padding: 12px 15px;
      margin-bottom: 10px;
      font-size: 14px;
      line-height: 1.6;
    }

    .role-name {
      font-weight: 600;
      color: #065f46;
    }

    .score-logic p {
      margin-bottom: 10px;
    }

    .score-logic p:last-child {
      margin-bottom: 0;
    }

    .calc-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      background: white;
      font-size: 13px;
    }

    .calc-table th,
    .calc-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #e0e0e0;
      text-align: left;
    }

    .calc-table th {
      background: #f0f2f5;
      font-weight: 600;
      color: #2c3e50;
    }

    .calc-table .num {
      text-align: right;
      white-space: nowrap;
    }

    .calc-table .calc-group td {
      background: #f8f9fa;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #555;
    }

    .calc-table .calc-average td {
      font-weight: 700;
      border-top: 2px solid #2c3e50;
    }

    .calc-note {
      font-size: 12px;
      color: #777;
    }

    .calc-result {
      font-size: 15px;
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

    .area-grid {
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
      <div class="brand">BIOSYNC</div>
      <h1>Your Resume Vs The Job: AI-Powered Match Analysis</h1>
      <p>Know your fit. Get interview-ready. Land the role.</p>
      
      <div class="header-grid">
        <div class="header-card">
          <h3>Your Match Score</h3>
          <div class="score-big">${esc(overallScore)}</div>
          <div class="score-label">/100</div>
        </div>
        <div class="header-card">
          <h3>Role Applied For</h3>
          <div class="score-big" style="font-size: 18px; margin-top: 8px; line-height: 1.3; overflow-wrap: anywhere;">${esc(jobTitle)}</div>
          ${companyName ? `<div class="score-label" style="overflow-wrap: anywhere;">at ${esc(companyName)}</div>` : ""}
        </div>
        <div class="header-card">
          <h3>Our Recommendation</h3>
          <div class="score-big" style="font-size: 18px; margin-top: 8px;">${getRecommendationEmoji(interviewRecommendation)} ${esc(getRecommendationLabel(interviewRecommendation))}</div>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="info-box">
        <strong>Candidate:</strong> ${esc(candidateName)} | <strong>Target Role:</strong> ${esc(jobTitle)}${companyName ? ` | <strong>Company:</strong> ${esc(companyName)}` : ""}
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
        ${overallCardHTML}
        ${scoreCalculationHTML}
        ${scoreGapHTML}
        ${scoringLogicHTML}
        ${areaCardsHTML}
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
                <td><strong>${esc(item.req ?? item.requirement ?? "")}</strong>${item.must === true ? `<br><span class="must-tag">Must-have</span>` : ""}</td>
                <td class="match-percentage">${requirementPercent(item)}</td>
                <td>${esc(item.ast ?? item.assessment ?? "")}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      ${practical.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">📍</span>
          Practical Points to Confirm
        </div>
        <p class="section-note">These conditions of the job are <strong>not part of your score</strong>, because a resume cannot show them. Check that each one works for you before you apply.</p>
        ${practical.map((point) => `
          <div class="practical-item">
            <div class="practical-name">${esc(point.req)}</div>
            ${point.note ? `<div class="practical-note">${esc(point.note)}</div>` : ''}
          </div>
        `).join('')}
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

      ${rewrites.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">✍️</span>
          Suggested Rewrites for Your Resume
        </div>
        <p class="section-note">These lines from your resume could be stronger for this job. Where you see square brackets, fill in your own real figures. Use a suggestion only if it is true for you.</p>
        ${rewrites.map((item) => `
          <div class="rewrite-item">
            <div class="rewrite-label">Your resume says</div>
            <div class="rewrite-before">${esc(item.before)}</div>
            <div class="rewrite-label">Try this instead</div>
            <div class="rewrite-after">${esc(item.after)}</div>
            ${item.why ? `<div class="rewrite-why"><strong>Why:</strong> ${esc(item.why)}</div>` : ''}
          </div>
        `).join('')}
      </div>
      ` : ''}

      ${keywords.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">🔑</span>
          Keywords Missing From Your Resume
        </div>
        <p class="section-note">These terms appear in the job description but not in your resume. Many employers filter resumes by keyword, so it helps to include the ones that apply to you. For each term we suggest where in your own resume it could go. Add a term only if it is true for you.</p>
        ${keywords.map((item) => `
          <div class="keyword-item">
            <div class="keyword-term">${esc(item.term)}</div>
            ${item.where ? `<div class="keyword-where"><strong>Where it could go in your resume:</strong> ${esc(item.where)}</div>` : ""}
          </div>
        `).join('')}
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

      ${roles.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">🧭</span>
          Roles That May Suit Your Resume Better
        </div>
        <p class="section-note">Based on your resume, these types of role are a closer match to your experience.</p>
        ${roles.map((item) => `
          <div class="role-item">
            <span class="role-name">${esc(item.role)}</span>${item.why ? `<br>${esc(item.why)}` : ''}
          </div>
        `).join('')}
      </div>
      ` : ''}

      ${prep.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">❓</span>
          Interview Questions to Prepare For
        </div>
        <p class="section-note">These are questions you are likely to be asked for this role, with points you could make in your answer.</p>
        ${prep.map((item, i) => `
          <div class="question-item">
            <span class="question-number">${i + 1}</span>
            <strong>${esc(item.question)}</strong>
            ${Array.isArray(item.points) && item.points.length > 0 ? `
            <div class="prep-points">
              <div class="prep-points-label">Points you could make:</div>
              <ul>
                ${item.points.map((point) => `<li>${esc(textOf(point))}</li>`).join('')}
              </ul>
            </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
      ` : (interviewQuestions.length > 0 ? `
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
      ` : '')}

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
        <p>Spotted something that looks wrong in this report?</p>
        <p style="font-weight: 400;">Reply to the email it came with and tell us what. We will re-check your report free of charge.</p>
        <p style="margin-top: 12px;">We would also value your feedback.</p>
        <p style="font-weight: 400;">To share comments or suggestions, reply to the same email. Thank you.</p>
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

function getRecommendationExplanation(recommendation, sections = {}) {
  const { hasImprovements = false, hasRewrites = false, hasKeywords = false, hasRoles = false } = sections;
  const r = normalise(recommendation);

  if (!r) {
    return "A recommendation could not be produced for this analysis. Please refer to your overall score and the Job Match Analysis above.";
  }

  const helpSections = [];
  if (hasImprovements) helpSections.push(`"Top 5 Changes to Improve Your Match"`);
  if (hasRewrites) helpSections.push(`"Suggested Rewrites for Your Resume"`);
  if (hasKeywords) helpSections.push(`"Keywords Missing From Your Resume"`);
  const improvementsPointer = helpSections.length > 0
    ? ` The ${helpSections.join(" and ")} section${helpSections.length > 1 ? "s show" : " shows"} where to start.`
    : ` The Job Match Analysis and Skills Assessment sections show where the gaps are.`;
  const rolesPointer = hasRoles
    ? ` The "Roles That May Suit Your Resume Better" section below suggests where to look.`
    : "";

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
      <strong>👉 NEXT STEP:</strong> We suggest focusing on roles that fit your background more closely.${rolesPointer} If this type of role is what you want,
      the requirements to meet first are listed in the Job Match Analysis.
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
