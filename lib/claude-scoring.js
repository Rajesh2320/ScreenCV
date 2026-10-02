// screencv/lib/claude-scoring.js
// Claude Haiku integration for recruiter analysis - ENHANCED + TIMEOUT PROTECTION
// ✅ CORRECTED: Timeout protection, comprehensive error logging, API key validation

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
  const startTime = Date.now();
  
  try {
    // ✅ VALIDATION 1: Input validation
    if (!resumeText || resumeText.length < 100) {
      console.error("[Claude Analysis] ❌ Resume text too short");
      throw new Error("Resume text too short");
    }
    if (!jobDescription || jobDescription.length < 50) {
      console.error("[Claude Analysis] ❌ Job description too short");
      throw new Error("Job description too short");
    }

    // ✅ VALIDATION 2: API Key check
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

    // ✅ TIMEOUT PROTECTION: 8 second abort signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error("[Claude Analysis] ❌ API request timeout (8s) - aborting fetch");
      controller.abort();
    }, 8000);

    // ✅ FETCH CALL with comprehensive error logging
    console.log("[Claude Analysis] 📡 Starting fetch to api.anthropic.com...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1500,
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
    console.log(`[Claude Analysis] 📡 Fetch returned, status: ${response.status}`);

    // ✅ RESPONSE VALIDATION
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Claude Analysis] ❌ HTTP ${response.status}: ${errorText.substring(0, 500)}`);
      throw new Error(`Claude API HTTP error ${response.status}: ${errorText}`);
    }

    console.log("[Claude Analysis] 📄 Parsing JSON response...");
    let claudeData;
    try {
      claudeData = await response.json();
      console.log("[Claude Analysis] ✅ JSON parsed successfully");
    } catch (jsonErr) {
      console.error(`[Claude Analysis] ❌ JSON parse error: ${jsonErr.message}`);
      throw new Error(`Failed to parse Claude response JSON: ${jsonErr.message}`);
    }

    // ✅ VALIDATE CLAUDE RESPONSE STRUCTURE
    if (!claudeData.content || !Array.isArray(claudeData.content) || claudeData.content.length === 0) {
      console.error("[Claude Analysis] ❌ Invalid response structure - no content");
      console.error(`[Claude Analysis] Response keys: ${Object.keys(claudeData).join(", ")}`);
      throw new Error("Claude API returned empty or invalid content");
    }

    const responseText = claudeData.content[0].text;
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

    // ✅ EXTRACT AND PARSE JSON
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
      throw parseErr;
    }

    // ✅ BUILD RESULT OBJECT with validation
    console.log("[Claude Analysis] 🏗️ Building result object...");
    const result = {
      candidate_name: minified.cn || "Candidate",
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
