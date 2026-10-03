// screencv/lib/access-codes.js
// Access codes: a code can limit how many reports someone may run, give a
// discount, or both.
//
//   - Each code has a maximum number of uses and a count of uses so far.
//   - Each code has a discount of 0 to 99 percent off the normal price.
//   - A code can be switched off, and can have an expiry date.
//
// WHERE CODES ARE REQUIRED
//   If the Vercel setting REQUIRE_ACCESS_CODE is "true" (staging), nobody can
//   start without a valid code. Without that setting (production), a code is
//   optional: customers may enter one for a discount, or leave it blank.
//
// WHEN A USE IS COUNTED
//   At the moment a report starts being produced, straight after the payment is
//   confirmed. Getting as far as the payment window does not use one up.
//
// The codes live in the "access_codes" table. See the SQL script that came
// with this file for creating the table and adding codes.

const { supabase } = require("./supabase-client");
const { REVIEW_PRICE_INR } = require("./constants");

const BASE_PRICE_PAISE = Number(REVIEW_PRICE_INR) > 0 ? Number(REVIEW_PRICE_INR) : 9900;
const MIN_PRICE_RUPEES = 1;        // Razorpay cannot take a payment of zero
const MAX_DISCOUNT_PERCENT = 99;

function isRequired() {
  return String(process.env.REQUIRE_ACCESS_CODE || "").trim().toLowerCase() === "true";
}

// Codes are not case-sensitive: "tester-ravi" and "TESTER-RAVI" are the same code.
// Returns "" for anything that cannot be a code.
function normaliseCode(raw) {
  const code = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code) ? code : "";
}

function clampDiscount(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_DISCOUNT_PERCENT, n);
}

// The price after a discount, in whole rupees (never below 1 rupee)
function priceRupees(discountPercent) {
  const base = BASE_PRICE_PAISE / 100;
  return Math.max(MIN_PRICE_RUPEES, Math.round((base * (100 - clampDiscount(discountPercent))) / 100));
}

function pricePaise(discountPercent) {
  return priceRupees(discountPercent) * 100;
}

const MESSAGES = {
  missing: "Please enter your access code.",
  invalid: "This access code is not valid. Please check it and try again.",
  expired: "This access code has expired.",
  used_up: "This access code has no uses left.",
  error: "We could not check this access code just now. Please try again in a moment.",
};

function messageFor(reason) {
  return MESSAGES[reason] || MESSAGES.invalid;
}

// Looks a code up without using it.
// Returns { ok: true, code, discountPercent, remaining, maxUses }
//      or { ok: false, reason }   reason: missing | invalid | expired | used_up | error
async function lookupCode(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: false, reason: "missing" };
  }
  const code = normaliseCode(raw);
  if (!code) return { ok: false, reason: "invalid" };

  try {
    const { data, error } = await supabase
      .from("access_codes")
      .select("code, max_uses, used_count, discount_percent, active, expires_at")
      .eq("code", code)
      .limit(1);

    if (error) {
      console.error("[AccessCode] Lookup failed:", error.message);
      return { ok: false, reason: "error" };
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row || row.active !== true) return { ok: false, reason: "invalid" };

    if (row.expires_at) {
      const expires = Date.parse(row.expires_at);
      if (Number.isFinite(expires) && expires <= Date.now()) return { ok: false, reason: "expired" };
    }

    const maxUses = Number(row.max_uses) || 0;
    const usedCount = Number(row.used_count) || 0;
    if (usedCount >= maxUses) return { ok: false, reason: "used_up" };

    return {
      ok: true,
      code,
      discountPercent: clampDiscount(row.discount_percent),
      remaining: maxUses - usedCount,
      maxUses,
      usedCount,
    };
  } catch (err) {
    console.error("[AccessCode] Lookup error:", err.message);
    return { ok: false, reason: "error" };
  }
}

// Counts one use of a code. Safe when several requests arrive at once: the
// update only succeeds if the count is still what was just read, so a code
// with one use left can only ever be used once.
// Returns { ok: true, usedCount, maxUses } or { ok: false, reason }.
async function consumeCode(raw) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const found = await lookupCode(raw);
    if (!found.ok) return found;

    const { data, error } = await supabase
      .from("access_codes")
      .update({ used_count: found.usedCount + 1 })
      .eq("code", found.code)
      .eq("used_count", found.usedCount)
      .select("code");

    if (error) {
      console.error("[AccessCode] Could not count a use:", error.message);
      return { ok: false, reason: "error" };
    }
    if (Array.isArray(data) && data.length === 1) {
      console.log(`[AccessCode] ✅ ${found.code}: use ${found.usedCount + 1} of ${found.maxUses}`);
      return { ok: true, code: found.code, usedCount: found.usedCount + 1, maxUses: found.maxUses };
    }
    // Someone else used the code in the same instant. Read the new count and try again.
  }
  return { ok: false, reason: "error" };
}

// POST /api/candidate/check-code   body: { code }
// Used by the form page before it lets someone move past step 1.
async function checkCodeHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const required = isRequired();
  const raw = req.body?.code;
  const basePrice = priceRupees(0);

  // No code entered, and none needed
  if (!required && (raw === undefined || raw === null || String(raw).trim() === "")) {
    return res.json({ success: true, required, valid: true, applied: false, discountPercent: 0, price: basePrice, basePrice });
  }

  const found = await lookupCode(raw);
  if (!found.ok) {
    // A short pause makes guessing codes by trial and error impractical
    await new Promise((resolve) => setTimeout(resolve, 400));
    return res.json({ success: true, required, valid: false, reason: found.reason, message: messageFor(found.reason), basePrice });
  }

  return res.json({
    success: true,
    required,
    valid: true,
    applied: true,
    code: found.code,
    discountPercent: found.discountPercent,
    price: priceRupees(found.discountPercent),
    basePrice,
    remaining: found.remaining,
  });
}

module.exports = {
  isRequired,
  normaliseCode,
  lookupCode,
  consumeCode,
  priceRupees,
  pricePaise,
  messageFor,
  checkCodeHandler,
};
