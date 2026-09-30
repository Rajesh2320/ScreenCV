// screencv/lib/claude-scoring.js
// Claude Haiku integration for recruiter analysis - ENHANCED
// ✅ CORRECTED: Extracts candidate name from Claude's response

const { ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_RECRUITER_ANALYSIS_PROMPT, CLAUDE_EXTRACT_LANGUAGE_PROMPT, CLAUDE_INPUT_COST_PER_M, CLAUDE_OUTPUT_COST_PER_M } = require("./constants");

function calculateTokenCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1_000_000) * CLAUDE_INPUT_COST_PER_M;
  const outputCost = (outputTokens / 1_000_000) * CLAUDE_OUTPUT_COST_PER_M;
  return parseFloat((inputCost + outputCost).toFixed(6));
}

function extractJSON(text) {
  let cleaned = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  cleaned = cleaned.replace(/^```\n?/, "").replace(/\n?```$/, "");
  return cleaned.trim();
}

// ===== GENERATE RECRUITER ANALYSIS =====

async function generateRecruiterAnalysis(resumeText, jobDescription) {
  try {
    if (!resumeText || resumeText.length < 100) {
      throw new Error("Resume text too short");
    }
    if (!jobDescription || jobDescription.length < 50) {
      throw new Error("Job description too short");
    }

    const prompt = CLAUDE_RECRUITER_ANALYSIS_PROMPT(resumeText, jobDescription);

    console.log("[Claude Analysis] Calling Claude Haiku for recruiter analysis...");
    console.log(`[DEBUG] Resume length: ${resumeText.length} chars`);
    console.log(`[DEBUG] Job description length: ${jobDescription.length} chars`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1500,  // Increased for new fields
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const claudeData = await response.json();

    if (!response.ok) {
      throw new Error(`Claude API error: ${JSON.stringify(claudeData)}`);
    }

    const responseText = claudeData.content[0].text;
    const inputTokens = claudeData.usage?.input_tokens || 0;
    const outputTokens = claudeData.usage?.output_tokens || 0;
    const costUsd = calculateTokenCost(inputTokens, outputTokens);

    console.log(`[DEBUG] Claude raw response: ${responseText.substring(0, 500)}...`);

    // Parse minified JSON
    const jsonText = extractJSON(responseText);
    
    let minified;
    try {
      minified = JSON.parse(jsonText);
      console.log(`[DEBUG] Parsed JSON keys:`, Object.keys(minified));
    } catch (parseErr) {
      console.error(`[DEBUG] JSON parse failed: ${parseErr.message}`);
      throw parseErr;
    }

    const result = {
      candidate_name: minified.cn || "Candidate",  // ✅ EXTRACT CANDIDATE NAME FROM CLAUDE
      executive_summary: minified.es || "Unable to assess resume comprehensively.",
      job_match_analysis: Array.isArray(minified.jma) ? minified.jma : [],
      experience_assessment: minified.exp || "Experience assessment unavailable.",
      skills: {
        strong: Array.isArray(minified.sk?.s) ? minified.sk.s : [],
        moderate: Array.isArray(minified.sk?.m) ? minified.sk.m : [],
        weak: Array.isArray(minified.sk?.w) ? minified.sk.w : [],
      },
      career_progression: minified.cp || "Career progression assessment unavailable.",
      achievement_score: Math.max(0, Math.min(100, minified.as || 0)),
      scoring_logic: minified.sl || "Score calculated based on overall experience and skill match.",
      match_category: minified.cat || "Partial Match",
      category_evidence: minified.cat_ev || "Assessment based on resume analysis.",
      improvements: Array.isArray(minified.imp) ? minified.imp.slice(0, 5) : [],
      concerns: Array.isArray(minified.con) ? minified.con.slice(0, 5) : [],
      interview_questions: Array.isArray(minified.iq) ? minified.iq.slice(0, 5) : [],
      interview_recommendation: minified.ir || "CONSIDER",
      overall_score: Math.max(0, Math.min(100, minified.os || 0)),
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        costUsd,
        costInr: parseFloat((costUsd * 83).toFixed(2)),
      },
    };

    console.log(`[Claude Analysis] Success: Name=${result.candidate_name}, Score=${result.overall_score}, Category=${result.match_category}, Tokens=${result.tokens.total}`);
    return { success: true, data: result };
  } catch (err) {
    console.error("[Claude Analysis] Error:", err.message);
    return { success: false, error: err.message };
  }
}

// ===== DETECT LANGUAGE =====

async function detectLanguage(text) {
  try {
    if (!text || text.length < 50) {
      return { success: true, language: "English" };
    }

    const prompt = CLAUDE_EXTRACT_LANGUAGE_PROMPT(text);

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
    });

    const claudeData = await response.json();

    if (!response.ok) {
      console.warn("[Language Detection] Claude error, defaulting to English");
      return { success: true, language: "English" };
    }

    const detectedLanguage = claudeData.content[0]?.text?.trim() || "English";
    return { success: true, language: detectedLanguage };
  } catch (err) {
    console.warn("[Language Detection] Error, defaulting to English:", err.message);
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
