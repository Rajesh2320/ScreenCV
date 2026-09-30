// screencv/api/candidate/extract-job-url.js
// Endpoint 4: Extract job description from URL
// Accepts: jobUrl
// Returns: jobDescription, jobTitle, company
// Note: Manual paste is the fallback if extraction fails

const axios = require("axios");
const cheerio = require("cheerio");
const { CORS_HEADERS, STATUS_CODES } = require("../../lib/constants");

// ===== CORS HANDLER =====
function handleCORS(req, res) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeader("Content-Type", "application/json").end("ok");
    return true;
  }
  return false;
}

// ===== EXTRACTION STRATEGIES =====

// LinkedIn Job Post
async function extractFromLinkedIn(url) {
  try {
    console.log("[Extract LinkedIn] Attempting extraction from:", url);

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);

    // LinkedIn might require authentication, try to extract from visible elements
    let jobTitle = $('h1[class*="title"]').first().text().trim();
    let company = $('span[class*="company"]').first().text().trim();
    let description = $('div[class*="description"]').first().text().trim();

    if (!description) {
      description = $("article").first().text().trim();
    }

    return {
      success: description ? true : false,
      jobTitle: jobTitle || "LinkedIn Job Posting",
      company: company || "Unknown Company",
      jobDescription: description || null,
    };
  } catch (err) {
    console.warn("[Extract LinkedIn] Error:", err.message);
    return { success: false };
  }
}

// Indeed Job Post
async function extractFromIndeed(url) {
  try {
    console.log("[Extract Indeed] Attempting extraction from:", url);

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);

    let jobTitle = $(".jobsearch-JobInfoHeader-title").text().trim();
    let company = $('[data-company-name="true"]').text().trim();
    let description = $("#jobDescriptionText").text().trim();

    return {
      success: description ? true : false,
      jobTitle: jobTitle || "Indeed Job Posting",
      company: company || "Unknown Company",
      jobDescription: description || null,
    };
  } catch (err) {
    console.warn("[Extract Indeed] Error:", err.message);
    return { success: false };
  }
}

// Generic HTML extraction
async function extractFromGeneric(url) {
  try {
    console.log("[Extract Generic] Attempting generic extraction from:", url);

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);

    // Try to find job title and description in common places
    let jobTitle = $("h1").first().text().trim();
    let description = $("main, article, section").first().text().trim();

    if (!description) {
      description = $("body").text().trim().substring(0, 2000);
    }

    return {
      success: description ? true : false,
      jobTitle: jobTitle || "Job Posting",
      company: "Unknown Company",
      jobDescription: description || null,
    };
  } catch (err) {
    console.warn("[Extract Generic] Error:", err.message);
    return { success: false };
  }
}

// ===== MAIN EXTRACTION ORCHESTRATOR =====
async function extractJobFromUrl(jobUrl) {
  if (!jobUrl) {
    throw new Error("Job URL is required");
  }

  // Validate URL format
  try {
    new URL(jobUrl);
  } catch {
    throw new Error("Invalid URL format");
  }

  // Determine source and extract accordingly
  if (jobUrl.includes("linkedin.com")) {
    return await extractFromLinkedIn(jobUrl);
  } else if (jobUrl.includes("indeed.com")) {
    return await extractFromIndeed(jobUrl);
  } else {
    return await extractFromGeneric(jobUrl);
  }
}

// ===== MAIN HANDLER =====
module.exports = async (req, res) => {
  // Set CORS headers
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle CORS preflight
  if (handleCORS(req, res)) return;

  // Only POST allowed
  if (req.method !== "POST") {
    return res.status(STATUS_CODES.BAD_REQUEST).json({
      success: false,
      error: "Only POST method is allowed",
    });
  }

  try {
    const startTime = Date.now();
    const body = req.body || {};

    console.log("[ExtractJobUrl] Processing URL:", body.jobUrl);

    // ===== VALIDATE INPUT =====
    if (!body.jobUrl) {
      console.warn("[ExtractJobUrl] Missing jobUrl");
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        error: "jobUrl is required",
      });
    }

    // ===== EXTRACT JOB DETAILS =====
    console.log("[ExtractJobUrl] Extracting job details...");
    const extractionResult = await extractJobFromUrl(body.jobUrl);

    if (!extractionResult.success) {
      console.warn("[ExtractJobUrl] Extraction failed for URL:", body.jobUrl);
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        error:
          "Could not extract job description from URL. Please copy and paste the job description manually.",
        fallback: {
          message: "Copy the full job description from the website and paste it in the form",
          include: ["Job title", "Company", "Required skills", "Job responsibilities"],
        },
      });
    }

    const executionTime = Date.now() - startTime;

    console.log(
      `[ExtractJobUrl] SUCCESS: Extracted job details in ${executionTime}ms`
    );

    // ===== RETURN RESPONSE =====
    return res.status(STATUS_CODES.OK).json({
      success: true,
      jobTitle: extractionResult.jobTitle,
      company: extractionResult.company,
      jobDescription: extractionResult.jobDescription,
      executionTime: executionTime,
      characterCount: extractionResult.jobDescription
        ? extractionResult.jobDescription.length
        : 0,
      message: "Job details extracted successfully",
    });
  } catch (error) {
    console.error("[ExtractJobUrl] Error:", error.message);

    // Return helpful fallback
    return res.status(STATUS_CODES.INTERNAL_ERROR).json({
      success: false,
      error: error.message || "Failed to extract job description",
      fallback: {
        message: "Please paste the job description manually",
        note: "Some websites block automated scraping. Copy-paste is reliable.",
      },
    });
  }
};
