// screencv/lib/constants.js
// Global configuration for ScreenCV APIs

module.exports = {
  // ===== PRICING =====
  REVIEW_PRICE_INR: 9900, // ₹99 in paise
  REVIEW_PRICE_DISPLAY: "₹99",

  // ===== CLAUDE HAIKU PRICING =====
  // Updated for Claude Haiku 4.5 (Sept 2026)
  CLAUDE_INPUT_COST_PER_M: 0.80, // $0.80 per 1M input tokens
  CLAUDE_OUTPUT_COST_PER_M: 4.0, // $4.00 per 1M output tokens
  CLAUDE_MODEL: "claude-haiku-4-5-20251001",

  // ===== CLAUDE PROMPTS =====
  CLAUDE_RECRUITER_ANALYSIS_PROMPT: (resume, jobDescription) => `You are an expert HR recruiter analyzing a candidate's fit for a role.

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resume}

Provide a comprehensive recruiter analysis. Return ONLY minified JSON (no markdown):
{"es":"Executive summary (2-3 sentences)","jma":[{"req":"requirement","pct":XX,"ast":"assessment"}],"exp":"Experience assessment (1-2 sentences)","sk":{"s":["skill1","skill2"],"m":["skill3","skill4"],"w":["skill5"]},"cp":"Career progression assessment (1 sentence)","as":XX,"con":["concern1","concern2","concern3"],"ir":"Interview recommendation (PROCEED/CONSIDER/REVISIT)","iq":["q1","q2","q3","q4","q5"],"os":XX}

Keys:
- es: executive_summary (2-3 sentences on overall fit)
- jma: job_match_analysis (array of {req, pct (0-100), ast (short assessment)})
- exp: experience_assessment (1-2 sentences)
- sk: skills {s: [strong], m: [moderate], w: [weak/missing]}
- cp: career_progression (1 sentence assessment)
- as: achievement_score (0-100)
- con: concerns (3 specific, actionable concerns)
- ir: interview_recommendation (one of: "PROCEED TO INTERVIEW", "CONSIDER", "REVISIT")
- iq: interview_questions (5 strategic questions for functional round)
- os: overall_score (0-100)`,

  CLAUDE_EXTRACT_INFO_PROMPT: (resumeText) => `Extract ONLY name, email, phone from this text. Return minified JSON only.
{"n":"name or null","e":"email or null","p":"phone or null"}

Text:
${resumeText}`,

  CLAUDE_EXTRACT_LANGUAGE_PROMPT: (text) => `Detect the language of this text. Return ONLY one of: English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, or Other.

Text:
${text.substring(0, 500)}`,

  // ===== MOCK PAYMENT =====
  MOCK_PAYMENT_SUCCESS_RATE: 0.95, // 95% success for testing
  MOCK_ORDER_ID_PREFIX: "mock_order_",
  MOCK_PAYMENT_ID_PREFIX: "mock_pay_",

  // ===== EMAIL =====
  EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID,
  EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY: process.env.EMAILJS_PUBLIC_KEY,
  EMAILJS_PRIVATE_KEY: process.env.EMAILJS_PRIVATE_KEY,

  // ===== RAZORPAY PAYMENT =====
  RAZORPAY_MODE: process.env.RAZORPAY_MODE || 'test',
  RAZORPAY_KEY_ID: (() => {
    const mode = process.env.RAZORPAY_MODE || 'test';
    return mode === 'live' 
      ? process.env.RAZORPAY_KEY_ID_LIVE 
      : process.env.RAZORPAY_KEY_ID_TEST;
  })(),
  RAZORPAY_KEY_SECRET: (() => {
    const mode = process.env.RAZORPAY_MODE || 'test';
    return mode === 'live'
      ? process.env.RAZORPAY_KEY_SECRET_LIVE
      : process.env.RAZORPAY_KEY_SECRET_TEST;
  })(),
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  ENABLE_PAYMENTS: process.env.ENABLE_PAYMENTS === 'true',

  // ===== SUPABASE =====
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // ===== ANTHROPIC =====
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,

  // ===== VERCEL =====
  VERCEL_URL: process.env.VERCEL_URL || "http://localhost:3000",

  // ===== APP CONFIG =====
  APP_NAME: "ScreenCV",
  APP_ENVIRONMENT: process.env.NODE_ENV || "development",
  PDF_EXPIRY_DAYS: 30,
  SUBMISSION_RETENTION_DAYS: 30,
  FEEDBACK_BASE_URL: process.env.FEEDBACK_BASE_URL || "http://localhost:3000",

  // ===== CORS =====
  CORS_HEADERS: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  },

  // ===== STATUS CODES =====
  STATUS_CODES: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
  },

  // ===== VALIDATION =====
  MIN_RESUME_LENGTH: 100,
  MAX_RESUME_LENGTH: 50000,
  VALID_FILE_TYPES: ["pdf", "docx", "doc", "txt"],
  EMAIL_REGEX: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/,
};