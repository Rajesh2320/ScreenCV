// screencv/lib/constants.js
// Global configuration for ScreenCV APIs
//
// CHANGE: the Claude prices below were 0.80 / 4.00, which are the rates of an
// older Haiku model. Claude Haiku 4.5 costs $1 per million input tokens and $5
// per million output tokens, so every saved cost was about 20% too low.
//
// CHANGE: CLAUDE_RECRUITER_ANALYSIS_PROMPT now takes the fixed requirement
// list and asks for every field the report uses (company, area ratings,
// "what most affects the match") in one place. Claude is no longer asked for
// an overall score or a recommendation; both are worked out in code.
//
// CHANGE: practical conditions of a job (location, shift timings, joining
// date, travel, salary) are passed separately and are not scored. Claude
// writes a one-line note on each, which the report lists for the candidate.
//
// CHANGE: each requirement is now graded on five fixed levels (full, mostly,
// partly, weak, none) instead of a free percentage. The levels are converted
// to 100 / 75 / 50 / 25 / 0 in lib/claude-scoring.js. Free percentages were
// drifting by 20-30 points between runs of the same resume.
//
// CHANGE: for each requirement Claude now writes its assessment BEFORE the
// percentage, so the number follows from the evidence instead of being chosen
// first. (A row had been scored 0% while its own text said the candidate held
// the qualification.)

module.exports = {
  // ===== PRICING =====
  REVIEW_PRICE_INR: 9900, // ₹99 in paise
  REVIEW_PRICE_DISPLAY: "₹99",

  // ===== CLAUDE HAIKU PRICING =====
  // Claude Haiku 4.5. If CLAUDE_MODEL is ever changed, change these two with it.
  CLAUDE_INPUT_COST_PER_M: 1.0, // $1.00 per 1M input tokens
  CLAUDE_OUTPUT_COST_PER_M: 5.0, // $5.00 per 1M output tokens
  CLAUDE_MODEL: "claude-haiku-4-5-20251001",

  // ===== CLAUDE PROMPTS =====
  // The resume analysis. When "requirements" is given (the normal case), Claude
  // scores the resume against that fixed, numbered list, which was produced
  // from the job description alone. Without it, Claude lists the requirements
  // itself. Either way the overall score is calculated in lib/claude-scoring.js
  // from the requirement scores; Claude does not choose it.
  CLAUDE_RECRUITER_ANALYSIS_PROMPT: (resume, jobDescription, requirements, practicalConditions) => {
    const hasList = Array.isArray(requirements) && requirements.length > 0;
    const practical = hasList && Array.isArray(practicalConditions) ? practicalConditions : [];

    // Practical conditions (location, shifts, joining date...) are never scored.
    // Claude only writes a one-line note on each for the candidate.
    const practicalBlock = practical.length > 0
      ? `
PRACTICAL CONDITIONS OF THE JOB (do NOT score these and do NOT include them in jma):
${practical.map((c, i) => `${i + 1}. ${c.req}`).join("\n")}
`
      : "";

    const pcShape = hasList
      ? (practical.length > 0 ? `,"pc":[{"n":1,"note":"note"}]` : "")
      : `,"pc":[{"req":"condition","note":"note"}]`;

    const pcKey = hasList
      ? (practical.length > 0 ? `
- pc: one entry for EVERY numbered practical condition above. n = its number, note = one sentence stating what the job asks and what the resume shows about it, for example "The role is based in Mumbai or Pune; your resume shows Chennai." If the resume says nothing about it, say so. Do not judge it and do not give it a score.` : "")
      : `
- pc: practical conditions of the job that a resume cannot demonstrate (work location or relocation, shift timings, joining date or notice period, travel, salary). Do NOT put these in jma. req = short label, note = one sentence stating what the job asks and what the resume shows about it. Use an empty list if the job description mentions none.`;

    const requirementBlock = hasList
      ? `
REQUIREMENTS TO SCORE (score every one, in this order; do not add, remove, merge or reword any):
${requirements.map((r, i) => `${i + 1}. ${r.must ? "[MUST-HAVE] " : ""}${r.req}`).join("\n")}
`
      : "";

    const jmaShape = hasList
      ? `"jma":[{"n":1,"ast":"assessment","lvl":"full|mostly|partly|weak|none"}]`
      : `"jma":[{"req":"requirement","must":true,"ast":"assessment","lvl":"full|mostly|partly|weak|none"}]`;

    const jmaKey = hasList
      ? `- jma: one entry for EVERY numbered requirement above, in the same order. n = the requirement's number. Write ast first: one or two sentences giving the evidence from the resume. Then lvl: exactly one of "full", "mostly", "partly", "weak", "none", as defined in your instructions. lvl must agree with what ast says.`
      : `- jma: job_match_analysis, 6 to 12 requirements taken from the job description. req = short label, must = true if the job description treats the requirement as essential and false otherwise. Write ast first: one or two sentences giving the evidence from the resume. Then lvl: exactly one of "full", "mostly", "partly", "weak", "none", as defined in your instructions. lvl must agree with what ast says.`;

    const overallShape = hasList ? "" : `,"os":XX`;
    const overallKey = hasList ? "" : `
- os: overall_score (0-100)`;

    return `You are an expert HR recruiter assessing how well a candidate's resume matches a job. The report you produce is read by the candidate.

JOB DESCRIPTION:
${jobDescription}
${requirementBlock}${practicalBlock}
RESUME:
${resume}

Return ONLY minified JSON (no markdown) in exactly this shape:
{"cn":"Candidate Full Name","co":"Company name or null","es":"Executive summary","jma":[...],"exp":"Experience assessment","sk":{"s":["skill1","skill2"],"m":["skill3"],"w":["skill4"]},"cp":"Career path assessment","fs":{"sk":XX,"exp":XX,"cp":XX},"as":XX,"sl":"What most affects the match","con":["point1","point2","point3"],"iq":["q1","q2","q3","q4","q5"]${pcShape}${overallShape}}

where ${jmaShape}

Keys (every key is required):
- cn: candidate_name (the candidate's full name from the resume; if not found, use "Candidate")
- co: the hiring company's name exactly as written in the job description, or null if the job description does not name it. Never guess.
- es: executive_summary (2-3 sentences on overall fit)
${jmaKey}
- exp: experience_assessment (1-2 sentences)
- sk: skills {s: strong evidence in the resume, m: some evidence, w: asked for by the job but not shown in the resume}
- cp: career_path (1 sentence on how the career so far relates to this role)
- fs: three whole numbers 0-100. sk = how well the candidate's skills match the skills the job asks for, exp = how relevant their work experience is to this role, cp = how well their career path so far fits this role
- as: achievement_score (0-100)
- sl: one or two sentences naming the scored requirements that help the match most and the ones that hold it back most. Do not mention an overall score or any number, and do not mention the practical conditions.
- con: 3 points an interviewer is likely to raise, each stated as a fact about the resume compared with the job
- iq: 5 interview questions the candidate should prepare to answer${pcKey}${overallKey}`;
  },

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

  // ===== VERCEL (Auto-provided by Vercel, add https prefix) =====
  VERCEL_URL: process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000",

  // ===== APP CONFIG =====
  APP_NAME: "ScreenCV",
  APP_ENVIRONMENT: process.env.NODE_ENV || "development",
  PDF_EXPIRY_DAYS: 30,
  SUBMISSION_RETENTION_DAYS: 30,
  FEEDBACK_BASE_URL: process.env.FEEDBACK_BASE_URL || (() => {
    // On Vercel, use VERCEL_URL; locally use localhost
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    return "http://localhost:3000";
  })(),

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
