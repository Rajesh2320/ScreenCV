// screencv/lib/claude-scoring.js
// Claude Haiku integration for recruiter analysis
//
// CHANGES (generateRecruiterAnalysis only; the other functions are untouched)
//  1. Timeout raised from 8s to 45s (override with CLAUDE_ANALYSIS_TIMEOUT_MS).
//     It now covers reading the response body too, and is always cleared.
//  2. One retry on transient API errors (429 / 5xx / 529 overloaded).
//  3. A response cut off at max_tokens is reported as such, instead of
//     surfacing as a confusing JSON parse error. max_tokens raised 1500 -> 2500.
//  4. extractJSON tolerates text before/after the JSON object.
//  5. A missing or non-numeric overall score is an error, not a score of 0.
//  6. Report accuracy and tone:
//     - A system prompt tells Claude the report is read by the candidate, must
//       be respectful, and must not speculate about personal circumstances.
//     - Claude now returns real factor scores ("fs"); the requirement average
//       is calculated here from the requirement rows.
//     - The match category is set from the overall score, not taken on trust.
//     - A missing recommendation is derived from the score instead of
//       defaulting to "CONSIDER".
//     - Each requirement row is marked must-have or not, so the report can
//       explain why the overall score differs from the average of the rows.
//     - A mismatch in seniority (candidate clearly more senior or more junior
//       than the role) must always be stated in the summary and concerns.
//     - Over-qualification in the same or a related field is flagged but does
//       not lower the score. A background in a different field is scored on
//       whether the candidate's skills would actually let them do the job.

const { ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_RECRUITER_ANALYSIS_PROMPT, CLAUDE_EXTRACT_LANGUAGE_PROMPT, CLAUDE_INPUT_COST_PER_M, CLAUDE_OUTPUT_COST_PER_M } = require("./constants");

const ANALYSIS_TIMEOUT_MS = Number(process.env.CLAUDE_ANALYSIS_TIMEOUT_MS) || 45000;
const ANALYSIS_MAX_TOKENS = 2500;
const ANALYSIS_MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 2000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

// Sent as the system prompt on every analysis. The existing prompt in
// constants.js still defines the JSON format; this sets audience, tone and
// accuracy rules, and asks for two extra fields.
const REPORT_RULES = `You are writing a resume-versus-job match report. The report is read by the candidate themselves, not by a recruiter. Follow the JSON format and keys requested in the user message exactly. The rules below apply to every text field and take priority over any conflicting instruction about voice or tone.

AUDIENCE AND TONE
- Address the candidate directly as "you" and "your". Do not refer to them in the third person or by name inside text fields. (The candidate-name field itself must still contain their name.)
- Be honest and specific, and be respectful. A poor match must still receive a low score and a clear recommendation; say so plainly and politely.
- Describe gaps as facts about the resume compared with the job, for example: "The role requires spoken Hindi; your resume does not mention it." Do not pass judgement on the person.
- Never speculate about the candidate's motives, personal circumstances, finances, state of mind or character. Do not use words such as desperate, desperation, distress, crisis, flight risk, red flag, demotion, step backward or unsuitable.
- If the candidate has far more experience than the role needs, say neutrally that the role is at a more junior level than their recent positions and that employers may ask why they are interested. Do not describe this as a downgrade.
- If something is simply absent from the resume, say it is "not mentioned in your resume" rather than stating that the candidate lacks it.
- Interview questions must be questions the candidate should prepare to answer, phrased neutrally.

LEVEL OF THE ROLE
- Always compare the level of the role with the candidate's level of experience. If the candidate is clearly more senior than the role, or clearly more junior, say so plainly in the summary ("es") and include it as one of the points an interviewer may raise ("con"). Use the neutral wording described above.
- Being more senior than the role is not, by itself, a reason to lower any score. If the candidate's past roles are in the same or a closely related field and they could clearly do this job, score the requirements they meet in full. Mention the difference in level only as a point an interviewer may raise.
- Do not lower a requirement percentage because the candidate exceeds it. A requirement such as "entry-level" or "freshers welcome" describes a minimum, and a more experienced candidate meets it.
- If the candidate's background is in a different field (for example, a head of sales applying for a software engineering role), reason carefully about whether their actual skills and experience would let them do this specific job. Give credit for skills that genuinely transfer and none for seniority alone. The scores must reflect how well they could do this job, and "sl" must explain that reasoning.
- These rules on level and field take priority over any conflicting scoring instruction in the user message.

ACCURACY
- Base every statement only on the resume and the job description. Do not invent facts.
- Every requirement percentage must be a whole number from 0 to 100. Use 0 when the resume shows no evidence. Never omit it.
- Must-have requirements count most. If a must-have requirement is not met, the overall score must be low even when other areas are strong.
- The overall score, the requirement percentages and the recommendation must be consistent with each other.

ALWAYS INCLUDE THESE TWO KEYS, even if the format in the user message does not list them:
- "sl": one or two plain sentences, addressed to the candidate, explaining why the overall score is what it is and naming the requirements that affected it most.
- "fs": an object with three whole numbers from 0 to 100, consistent with the rest of your analysis:
  { "sk": how well the candidate's skills match the skills this job asks for, "exp": how relevant their work experience is to this role, "cp": how well their career path so far fits this role }

IN EVERY REQUIREMENT ROW, also add:
- "must": true if the job description treats the requirement as essential (the job cannot be done without it), otherwise false.

Return only the JSON object.`;

// Same ranges as the legend printed in the report (html-generator-recruiter.js)
function getMatchCategoryFromScore(score) {
  if (score >= 85) return "Strong Match";
  if (score >= 60) return "Partial Match";
  return "Weak Match";
}

// Used only when Claude does not return a recommendation
function getRecommendationFromScore(score) {
  if (score >= 85) return "PROCEED";      // Strong Match
  if (score >= 60) return "CONSIDER";     // Partial Match
  if (score >= 40) return "REVISIT";      // Weak Match, upper half
  return "NOT RECOMMENDED";
}

// Whole number 0-100, or null when there is no usable value. 0 is kept.
function parsePercent(value) {
  let n = null;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "") n = parseFloat(value.replace("%", ""));
  if (n === null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function calculateTokenCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1_000_000) * CLAUDE_INPUT_COST_PER_M;
  const outputCost = (outputTokens / 1_000_000) * CLAUDE_OUTPUT_COST_PER_M;
  return parseFloat((inputCost + outputCost).toFixed(6));
}

function extractJSON(text) {
  let cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  // If the model wrapped the object in extra prose, keep only the object.
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }
  return cleaned;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One request to the Messages API. The timeout covers the whole exchange,
// including reading the body, and the timer is always cleared.
async function callClaudeOnce(requestBody, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    console.error(`[Claude Analysis] ❌ API request timeout (${Math.round(timeoutMs / 1000)}s) - aborting fetch`);
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const rawText = await response.text();
    return { ok: response.ok, status: response.status, rawText };
  } catch (err) {
    if (timedOut) {
      throw new Error(`Claude API timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===== GENERATE RECRUITER ANALYSIS =====

async function generateRecruiterAnalysis(resumeText, jobDescription) {
  const startTime = Date.now();

  try {
    // VALIDATION 1: Input validation
    if (!resumeText || resumeText.length < 100) {
      console.error("[Claude Analysis] ❌ Resume text too short");
      throw new Error("Resume text too short");
    }
    if (!jobDescription || jobDescription.length < 50) {
      console.error("[Claude Analysis] ❌ Job description too short");
      throw new Error("Job description too short");
    }

    // VALIDATION 2: API Key check
    if (!ANTHROPIC_API_KEY) {
      console.error("[Claude Analysis] ❌ ANTHROPIC_API_KEY is not set!");
      throw new Error("ANTHROPIC_API_KEY environment variable not found");
    }

    const prompt = CLAUDE_RECRUITER_ANALYSIS_PROMPT(resumeText, jobDescription);

    console.log("[Claude Analysis] ✅ Validation passed");
    console.log("[Claude Analysis] Calling Claude Haiku for recruiter analysis...");
    console.log(`[Claude Analysis] Resume length: ${resumeText.length} chars`);
    console.log(`[Claude Analysis] Job description length: ${jobDescription.length} chars`);
    console.log(`[Claude Analysis] Model: ${CLAUDE_MODEL}`);

    const requestBody = {
      model: CLAUDE_MODEL,
      max_tokens: ANALYSIS_MAX_TOKENS,
      system: REPORT_RULES,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    };

    // FETCH with timeout, and one retry on transient API errors
    let apiResult;
    for (let attempt = 1; ; attempt++) {
      console.log(`[Claude Analysis] 📡 Starting fetch to api.anthropic.com... (attempt ${attempt}/${ANALYSIS_MAX_ATTEMPTS})`);
      apiResult = await callClaudeOnce(requestBody, ANALYSIS_TIMEOUT_MS);
      console.log(`[Claude Analysis] 📡 Fetch returned, status: ${apiResult.status}`);

      if (apiResult.ok) break;

      console.error(`[Claude Analysis] ❌ HTTP ${apiResult.status}: ${apiResult.rawText.substring(0, 500)}`);

      if (attempt < ANALYSIS_MAX_ATTEMPTS && RETRYABLE_STATUS.has(apiResult.status)) {
        console.warn(`[Claude Analysis] ⚠️ Transient error, retrying in ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      throw new Error(`Claude API HTTP error ${apiResult.status}: ${apiResult.rawText.substring(0, 300)}`);
    }

    console.log("[Claude Analysis] 📄 Parsing JSON response...");
    let claudeData;
    try {
      claudeData = JSON.parse(apiResult.rawText);
      console.log("[Claude Analysis] ✅ JSON parsed successfully");
    } catch (jsonErr) {
      console.error(`[Claude Analysis] ❌ JSON parse error: ${jsonErr.message}`);
      throw new Error(`Failed to parse Claude response JSON: ${jsonErr.message}`);
    }

    // VALIDATE CLAUDE RESPONSE STRUCTURE
    if (!claudeData.content || !Array.isArray(claudeData.content) || claudeData.content.length === 0) {
      console.error("[Claude Analysis] ❌ Invalid response structure - no content");
      console.error(`[Claude Analysis] Response keys: ${Object.keys(claudeData).join(", ")}`);
      throw new Error("Claude API returned empty or invalid content");
    }

    const textBlock = claudeData.content.find((block) => block.type === "text" && block.text);
    const responseText = textBlock ? textBlock.text : "";
    if (!responseText) {
      console.error("[Claude Analysis] ❌ Empty response text from Claude");
      throw new Error("Claude returned empty text");
    }

    const inputTokens = claudeData.usage?.input_tokens || 0;
    const outputTokens = claudeData.usage?.output_tokens || 0;
    const costUsd = calculateTokenCost(inputTokens, outputTokens);

    console.log(`[Claude Analysis] 📊 Tokens - Input: ${inputTokens}, Output: ${outputTokens}`);
    console.log(`[Claude Analysis] 💰 Cost - USD: $${costUsd.toFixed(6)}, INR: ₹${(costUsd * 83).toFixed(2)}`);
    console.log(`[Claude Analysis] 📝 Response preview: ${responseText.substring(0, 200)}...`);

    // A response that hit the token limit is incomplete JSON. Say so plainly.
    if (claudeData.stop_reason === "max_tokens") {
      console.error(`[Claude Analysis] ❌ Response cut off at max_tokens (${ANALYSIS_MAX_TOKENS})`);
      throw new Error(`Claude response was cut off at ${ANALYSIS_MAX_TOKENS} tokens - analysis incomplete`);
    }

    // EXTRACT AND PARSE JSON
    console.log("[Claude Analysis] 🔍 Extracting JSON from response...");
    const jsonText = extractJSON(responseText);
    console.log(`[Claude Analysis] Cleaned JSON preview: ${jsonText.substring(0, 200)}...`);

    let minified;
    try {
      minified = JSON.parse(jsonText);
      console.log(`[Claude Analysis] ✅ JSON parsed, keys: ${Object.keys(minified).join(", ")}`);
    } catch (parseErr) {
      console.error(`[Claude Analysis] ❌ JSON parse failed: ${parseErr.message}`);
      console.error(`[Claude Analysis] Raw text: ${responseText.substring(0, 1000)}`);
      throw new Error(`Analysis was not valid JSON: ${parseErr.message}`);
    }

    // The overall score is the product. Without it there is no report to sell.
    const overallScore = Number(minified.os);
    if (minified.os === undefined || minified.os === null || minified.os === "" || !Number.isFinite(overallScore)) {
      console.error(`[Claude Analysis] ❌ No usable overall score in response (os=${JSON.stringify(minified.os)})`);
      throw new Error("Claude response has no usable overall score");
    }
    const achievementScore = Number.isFinite(Number(minified.as)) ? Number(minified.as) : 0;
    const clampedOverall = Math.max(0, Math.min(100, overallScore));

    // Requirement rows: make every percentage a real number (0 stays 0) or null
    const jobMatchAnalysis = (Array.isArray(minified.jma) ? minified.jma : [])
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        ...item,
        pct: parsePercent(item.pct ?? item.percentage ?? item.match),
        must: item.must === true || String(item.must).toLowerCase() === "true",
      }));

    // Factor scores: only real values. Anything missing is left out, and the
    // report then shows no card for it rather than a made-up number.
    const factorScores = {};
    const fs = minified.fs && typeof minified.fs === "object" ? minified.fs : {};
    const skillsScore = parsePercent(fs.sk);
    const experienceScore = parsePercent(fs.exp);
    const careerScore = parsePercent(fs.cp);
    if (skillsScore !== null) factorScores.skillsAlignment = skillsScore;
    if (experienceScore !== null) factorScores.experienceLevel = experienceScore;
    if (careerScore !== null) factorScores.careerProgression = careerScore;

    const requirementPercents = jobMatchAnalysis.map((item) => item.pct).filter((p) => p !== null);
    if (requirementPercents.length > 0) {
      factorScores.jobRequirementsMatch = Math.round(
        requirementPercents.reduce((sum, p) => sum + p, 0) / requirementPercents.length
      );
    }

    // BUILD RESULT OBJECT
    console.log("[Claude Analysis] 🏗️ Building result object...");
    const result = {
      candidate_name: minified.cn || "Candidate",
      executive_summary: minified.es || "Unable to assess resume comprehensively.",
      job_match_analysis: jobMatchAnalysis,
      experience_assessment: minified.exp || "Experience assessment unavailable.",
      skills: {
        strong: Array.isArray(minified.sk?.s) ? minified.sk.s : [],
        moderate: Array.isArray(minified.sk?.m) ? minified.sk.m : [],
        weak: Array.isArray(minified.sk?.w) ? minified.sk.w : [],
      },
      career_progression: minified.cp || "Career progression assessment unavailable.",
      achievement_score: Math.max(0, Math.min(100, achievementScore)),
      scoring_logic: typeof minified.sl === "string" ? minified.sl.trim() : "",
      match_category: getMatchCategoryFromScore(clampedOverall),
      category_evidence: minified.cat_ev || "Assessment based on resume analysis.",
      improvements: Array.isArray(minified.imp) ? minified.imp.slice(0, 5) : [],
      concerns: Array.isArray(minified.con) ? minified.con.slice(0, 5) : [],
      interview_questions: Array.isArray(minified.iq) ? minified.iq.slice(0, 5) : [],
      interview_recommendation: (typeof minified.ir === "string" && minified.ir.trim()) || getRecommendationFromScore(clampedOverall),
      overall_score: clampedOverall,
      factor_scores: factorScores,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        costUsd,
        costInr: parseFloat((costUsd * 83).toFixed(2)),
      },
    };

    const elapsed = Date.now() - startTime;
    console.log(`[Claude Analysis] ✅ SUCCESS: Name=${result.candidate_name}, Score=${result.overall_score}/100, Category=${result.match_category}`);
    console.log(`[Claude Analysis] ⏱️ Total time: ${elapsed}ms`);

    return { success: true, data: result };

  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Claude Analysis] ❌ ERROR: ${err.message}`);
    console.error(`[Claude Analysis] ⏱️ Failed after ${elapsed}ms`);
    console.error(`[Claude Analysis] Stack: ${err.stack}`);
    return { success: false, error: err.message };
  }
}

// ===== DETECT LANGUAGE =====

async function detectLanguage(text) {
  try {
    if (!text || text.length < 50) {
      console.log("[Language Detection] Text too short, defaulting to English");
      return { success: true, language: "English" };
    }

    if (!ANTHROPIC_API_KEY) {
      console.warn("[Language Detection] API key not set, defaulting to English");
      return { success: true, language: "English" };
    }

    const prompt = CLAUDE_EXTRACT_LANGUAGE_PROMPT(text);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Language Detection] HTTP ${response.status}, defaulting to English`);
      return { success: true, language: "English" };
    }

    const claudeData = await response.json();
    const detectedLanguage = claudeData.content[0]?.text?.trim() || "English";
    console.log(`[Language Detection] Detected: ${detectedLanguage}`);
    return { success: true, language: detectedLanguage };

  } catch (err) {
    console.warn(`[Language Detection] Error: ${err.message}, defaulting to English`);
    return { success: true, language: "English" };
  }
}

// ===== SANITIZE RESUME =====

function sanitizeResumeText(rawText) {
  if (!rawText) return "";

  return rawText
    .replace(/data:image\/[^;]+;base64,[^\s]+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, 8000)
    .trim();
}

module.exports = {
  generateRecruiterAnalysis,
  detectLanguage,
  sanitizeResumeText,
  calculateTokenCost,
};
