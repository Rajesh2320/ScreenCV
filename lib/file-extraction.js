// screencv/lib/file-extraction.js
// File extraction: unpdf for PDFs, mammoth for DOCX, Claude fallback for scanned PDFs
//
// CHANGES
//  1. PDFs are read locally with "unpdf" instead of pdf-parse. pdf-parse v2
//     needs a native canvas package that is not present on Vercel, so it
//     crashed on load and every PDF went to the paid Claude fallback.
//  2. Claude fallback: output limit raised 2000 -> 8000 tokens (long resumes
//     were being cut off), a timeout was added, a cut-off response is flagged,
//     and the cost uses the current Haiku 4.5 rates.
//  3. The Claude fallback is used for PDFs only. The API cannot read .doc or
//     .docx files, so those now return a clear error instead of a failed call.
//
// REQUIRES: "unpdf" in package.json dependencies. If it is missing the site
// still works: PDFs simply go to the Claude fallback, as before.

const path = require("path");
const mammoth = require("mammoth");
const { ANTHROPIC_API_KEY } = require("./constants");

// Claude fallback settings (used only when a PDF has no readable text layer)
const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";
const EXTRACTION_INPUT_COST_PER_M = 1.0;   // USD per 1M input tokens (Haiku 4.5)
const EXTRACTION_OUTPUT_COST_PER_M = 5.0;  // USD per 1M output tokens (Haiku 4.5)
const EXTRACTION_MAX_TOKENS = 8000;
const EXTRACTION_TIMEOUT_MS = Number(process.env.CLAUDE_EXTRACT_TIMEOUT_MS) || 60000;

// Extraction attempt 1: Direct text (for .txt files)
async function extractTextDirect(fileContent) {
  try {
    const text = fileContent.toString("utf-8");
    if (text.length > 100) {
      console.log("[Extract] ✅ Direct text extraction succeeded");
      return { success: true, text, method: "direct", tokens: 0, cost: 0 };
    }
  } catch (err) {
    // Not plain text
  }
  return null;
}

// Extraction attempt 2: PDF text layer, read locally (no cost)
async function extractPDFLocally(fileBuffer) {
  let pdf = null;
  try {
    console.log("[Extract] Attempting local PDF extraction...");

    // Lazy load so a missing package can never stop the server from starting
    let unpdf;
    try {
      unpdf = require("unpdf");
    } catch (err) {
      console.warn(`[Extract] unpdf not available (${err.message.split("\n")[0]}), skipping local PDF extraction`);
      return null;
    }

    // Pass a copy: the PDF engine may take ownership of the bytes it is given,
    // and the original buffer is still needed if we fall back to Claude.
    pdf = await unpdf.getDocumentProxy(new Uint8Array(fileBuffer));
    const { totalPages, text: pages } = await unpdf.extractText(pdf, { mergePages: false });
    const extractedText = (Array.isArray(pages) ? pages.join("\n\n") : String(pages || "")).trim();

    if (extractedText.length > 100) {
      console.log(`[Extract] ✅ PDF extraction succeeded! ${totalPages} page(s), ${extractedText.length} characters`);
      // method stays "pdfparse" so stored values and anything that reads them are unchanged
      return { success: true, text: extractedText, method: "pdfparse", tokens: 0, cost: 0, pages: totalPages };
    }

    console.log(`[Extract] ⚠️ PDF has no readable text layer (${extractedText.length} chars) - probably a scan`);
    return null;
  } catch (err) {
    console.error("[Extract] PDF parse error:", err.message);
    return null;
  } finally {
    if (pdf && typeof pdf.destroy === "function") {
      try { await pdf.destroy(); } catch (e) { /* ignore */ }
    }
  }
}

// Extraction attempt 2.5: DOCX extraction using mammoth (no cost)
async function extractDOCXWithMammoth(fileBuffer) {
  try {
    console.log("[Extract] Attempting DOCX extraction with mammoth...");

    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    const extractedText = result.value || "";

    if (extractedText.length > 50) {
      console.log(`[Extract] ✅ DOCX extraction succeeded! Extracted ${extractedText.length} characters`);
      return { success: true, text: extractedText, method: "mammoth", tokens: 0, cost: 0 };
    } else {
      console.log("[Extract] ⚠️ DOCX extraction returned too little text");
      return null;
    }
  } catch (err) {
    console.error("[Extract] DOCX extraction error:", err.message);
    return null;
  }
}

// Extraction attempt 3: Claude reads the PDF itself (HAS COST).
// Used for scanned / image-only PDFs. The API accepts PDFs only in document blocks.
async function extractWithClaudeFallback(fileContent, fileName) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, EXTRACTION_TIMEOUT_MS);

  try {
    console.log("[Claude Fallback] Starting extraction...");

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const base64Data = fileContent.toString("base64");
    console.log(`[Claude Fallback] File size: ${fileContent.length} bytes (${fileName})`);
    console.log("[Claude Fallback] Calling Claude API...");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        max_tokens: EXTRACTION_MAX_TOKENS,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: "Extract ALL text from this document. Return ONLY the extracted text, nothing else.",
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    console.log(`[Claude Fallback] API responded with status ${response.status}`);

    if (!response.ok) {
      throw new Error(`Claude API error ${response.status}: ${rawBody.substring(0, 300)}`);
    }

    const claudeData = JSON.parse(rawBody);
    const textBlock = Array.isArray(claudeData.content)
      ? claudeData.content.find((block) => block.type === "text" && block.text)
      : null;
    const extractedText = textBlock ? textBlock.text : "";

    if (!extractedText) {
      throw new Error("Claude returned no text for this document");
    }

    const truncated = claudeData.stop_reason === "max_tokens";
    if (truncated) {
      console.warn(`[Claude Fallback] ⚠️ Output hit the ${EXTRACTION_MAX_TOKENS}-token limit - the end of this resume is MISSING`);
    }

    // Token usage and cost
    const inputTokens = claudeData.usage?.input_tokens || 0;
    const outputTokens = claudeData.usage?.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    const inputCost = (inputTokens / 1_000_000) * EXTRACTION_INPUT_COST_PER_M;
    const outputCost = (outputTokens / 1_000_000) * EXTRACTION_OUTPUT_COST_PER_M;
    const totalCostUSD = inputCost + outputCost;
    const totalCostINR = totalCostUSD * 83;

    console.log(`[Claude Fallback] ✅ Success! Extracted ${extractedText.length} characters`);
    console.log(`[Claude Fallback] Tokens - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
    console.log(`[Claude Fallback] Cost - USD: $${totalCostUSD.toFixed(6)}, INR: ₹${totalCostINR.toFixed(2)}`);

    return {
      success: true,
      text: extractedText,
      method: "claude_document",
      truncated: truncated,
      tokens: totalTokens,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      costUSD: parseFloat(totalCostUSD.toFixed(6)),
      costINR: parseFloat(totalCostINR.toFixed(2)),
    };
  } catch (err) {
    const message = timedOut
      ? `Claude extraction timed out after ${Math.round(EXTRACTION_TIMEOUT_MS / 1000)}s`
      : err.message;
    console.error(`[Claude Fallback] Error: ${message}`);
    return { success: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Main function: Accept Buffer data from multer
async function extractTextFromResume(fileBuffer, fileName) {
  try {
    if (!fileBuffer) {
      return { success: false, error: "No file data provided" };
    }

    // Ensure fileBuffer is a Buffer
    if (!Buffer.isBuffer(fileBuffer)) {
      fileBuffer = Buffer.from(fileBuffer);
    }

    const extension = path.extname(fileName || "").toLowerCase();

    console.log(`[Extract] Processing file: ${fileName} (${extension})`);

    // Plain text
    if (extension === ".txt") {
      const result = await extractTextDirect(fileBuffer);
      if (result?.success) {
        return result;
      }
      return { success: false, error: "This text file is empty or too short to analyse." };
    }

    // PDF: local text layer first (free), Claude for scans (has cost)
    if (extension === ".pdf") {
      const result = await extractPDFLocally(fileBuffer);
      if (result?.success) {
        return result;
      }
      console.log("[Extract] ⚠️ Local PDF extraction failed, trying Claude fallback...");

      const claudeResult = await extractWithClaudeFallback(fileBuffer, fileName);
      if (claudeResult.success) {
        return claudeResult;
      }
      return { success: false, error: claudeResult.error || "Could not read this PDF" };
    }

    // DOCX: mammoth (free). Claude cannot read Word files, so there is no fallback.
    if (extension === ".docx") {
      const result = await extractDOCXWithMammoth(fileBuffer);
      if (result?.success) {
        return result;
      }
      return { success: false, error: "Could not read this Word file. Please upload it as a PDF instead." };
    }

    if (extension === ".doc") {
      console.warn("[Extract] ⚠️ Legacy .doc file rejected");
      return { success: false, error: "Old Word (.doc) files are not supported. Please save the resume as .docx or PDF and upload again." };
    }

    console.warn(`[Extract] ⚠️ Unsupported file type: ${extension || "(none)"}`);
    return { success: false, error: "Unsupported file type. Please upload a PDF, .docx or .txt file." };
  } catch (error) {
    console.error("[Extract] Unexpected error:", error.message);
    return { success: false, error: error.message };
  }
}

// Sanitize extracted text
function sanitizeText(text) {
  if (!text) return "";
  return text
    .replace(/\x00/g, "")
    .replace(/[^\x20-\x7E\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  extractTextFromResume,
  sanitizeText,
};
