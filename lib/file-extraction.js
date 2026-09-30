// screencv/lib/file-extraction.js
// File extraction with pdf-parse for PDFs, mammoth for DOCX, and Claude fallback

const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { ANTHROPIC_API_KEY } = require("./constants");

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

// Extraction attempt 2: PDF using pdf-parse library (no cost!)
async function extractPDFWithPdfParse(fileBuffer) {
  try {
    console.log("[Extract] Attempting PDF extraction with pdf-parse...");
    
    const data = await pdfParse(fileBuffer);
    const extractedText = data.text || "";

    if (extractedText.length > 100) {
      console.log(`[Extract] ✅ PDF extraction succeeded! Extracted ${extractedText.length} characters`);
      return { success: true, text: extractedText, method: "pdfparse", tokens: 0, cost: 0 };
    } else {
      console.log("[Extract] ⚠️ PDF extraction returned too little text");
      return null;
    }
  } catch (err) {
    console.error("[Extract] PDF parse error:", err.message);
    return null;
  }
}

// Extraction attempt 2.5: DOCX extraction using mammoth (FREE!)
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

// Extraction attempt 3: Claude vision fallback for DOC/TXT (WITH COST)
async function extractWithClaudeFallback(fileContent, fileName) {
  try {
    console.log("[Claude Fallback] Starting extraction...");
    
    // Convert file to base64
    const base64Data = fileContent.toString("base64");
    console.log(`[Claude Fallback] File data size: ${base64Data.length} bytes`);
    
    // Detect media type based on file extension
    const extension = path.extname(fileName).toLowerCase();
    let mediaType = "text/plain"; // default for TXT
    
    if (extension === ".pdf") {
      mediaType = "application/pdf";
    } else if (extension === ".doc") {
      mediaType = "application/msword";
    } else if (extension === ".txt") {
      mediaType = "text/plain";
    }
    
    console.log(`[Claude Fallback] Detected media type: ${mediaType}`);
    console.log("[Claude Fallback] Calling Claude API...");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: mediaType,
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
    });

    console.log(`[Claude Fallback] API responded with status ${response.status}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Claude API error: ${JSON.stringify(error)}`);
    }

    const claudeData = await response.json();
    const extractedText = claudeData.content[0]?.text || "";
    
    // Get token usage for cost calculation
    const inputTokens = claudeData.usage?.input_tokens || 0;
    const outputTokens = claudeData.usage?.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    // Calculate cost (Claude Haiku rates)
    const inputCost = (inputTokens / 1_000_000) * 0.8;      // $0.80 per 1M
    const outputCost = (outputTokens / 1_000_000) * 4.0;    // $4.00 per 1M
    const totalCostUSD = inputCost + outputCost;
    const totalCostINR = totalCostUSD * 83;  // Current rate

    console.log(`[Claude Fallback] ✅ Success! Extracted ${extractedText.length} characters`);
    console.log(`[Claude Fallback] Tokens - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
    console.log(`[Claude Fallback] Cost - USD: $${totalCostUSD.toFixed(6)}, INR: ₹${totalCostINR.toFixed(2)}`);

    return {
      success: true,
      text: extractedText,
      method: "claude_document",
      tokens: totalTokens,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      costUSD: parseFloat(totalCostUSD.toFixed(6)),
      costINR: parseFloat(totalCostINR.toFixed(2)),
    };
  } catch (err) {
    console.error(`[Claude Fallback] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ✅ Main function: Accept Buffer data from multer
async function extractTextFromResume(fileBuffer, fileName) {
  try {
    if (!fileBuffer) {
      return { success: false, error: "No file data provided" };
    }

    // Ensure fileBuffer is a Buffer
    if (!Buffer.isBuffer(fileBuffer)) {
      fileBuffer = Buffer.from(fileBuffer);
    }

    const extension = path.extname(fileName).toLowerCase();

    console.log(`[Extract] Processing file: ${fileName} (${extension})`);

    // Attempt 1: Direct text extraction (for .txt)
    if (extension === ".txt") {
      const result = await extractTextDirect(fileBuffer);
      if (result?.success) {
        return result;
      }
    }

    // Attempt 2: PDF extraction using pdf-parse (FREE! No cost)
    if (extension === ".pdf") {
      const result = await extractPDFWithPdfParse(fileBuffer);
      if (result?.success) {
        return result;
      }
      console.log("[Extract] ⚠️ PDF extraction failed, trying Claude fallback...");
    }

    // Attempt 2.5: DOCX extraction using mammoth (FREE! No cost)
    if (extension === ".docx") {
      const result = await extractDOCXWithMammoth(fileBuffer);
      if (result?.success) {
        return result;
      }
      console.log("[Extract] ⚠️ DOCX extraction failed, trying Claude fallback...");
    }

    // Attempt 3: Claude fallback for DOC/TXT (HAS COST)
    const claudeResult = await extractWithClaudeFallback(fileBuffer, fileName);
    
    if (claudeResult.success) {
      return claudeResult;
    } else {
      return { success: false, error: claudeResult.error || "All extraction methods failed" };
    }
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