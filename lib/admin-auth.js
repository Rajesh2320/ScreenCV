// screencv/lib/admin-auth.js
// Admin sessions: a signed cookie issued at login, and the gate that checks it.
//
// HOW IT WORKS
//  - After a correct email + password, the server issues a session token and
//    stores it in an HttpOnly cookie. The token is signed with
//    ADMIN_SESSION_SECRET, so only this server can create or alter one.
//  - adminGate() sits in front of everything under /api/admin and refuses any
//    request that does not carry a valid, unexpired token.
//  - Uses only Node's built-in crypto module. No extra packages.
//
// REQUIRED SETTING: ADMIN_SESSION_SECRET (at least 32 characters) in each
// Vercel project. If it is missing, admin access is refused; the public site
// is unaffected.

const crypto = require("crypto");

const COOKIE_NAME = "admin_session";
const COOKIE_PATH = "/api/admin";
const SESSION_HOURS = 12;

// Addresses under /api/admin that work without logging in.
// Matched exactly (method + path). Anything else needs a session.
const PUBLIC_ADMIN_ROUTES = [
  ["POST", "/login"],
  ["POST", "/logout"],
  ["GET", "/tool-status"],
];

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

function sign(payloadB64, secret) {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

// Returns a token string, or null if ADMIN_SESSION_SECRET is not configured
function createSessionToken(admin) {
  const secret = getSecret();
  if (!secret || !admin || !admin.email) return null;

  const payload = {
    email: admin.email,
    role: admin.role || null,
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

// Returns { email, role, exp } for a valid, unexpired token; otherwise null
function verifySessionToken(token) {
  const secret = getSecret();
  if (!secret || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;

  const expected = Buffer.from(sign(payloadB64, secret), "utf8");
  const received = Buffer.from(signature, "utf8");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (err) {
    return null;
  }

  if (!payload || typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}

function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch (err) {
        return null;
      }
    }
  }
  return null;
}

function isHttps(req) {
  return !!req.secure || req.headers["x-forwarded-proto"] === "https";
}

function buildCookie(req, value, maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",          // page scripts cannot read it
    "SameSite=Strict",   // other websites cannot make the browser send it
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps(req)) parts.push("Secure");
  return parts.join("; ");
}

function setSessionCookie(req, res, token) {
  res.setHeader("Set-Cookie", buildCookie(req, token, SESSION_HOURS * 60 * 60));
}

function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", buildCookie(req, "", 0));
}

function getAdminFromRequest(req) {
  return verifySessionToken(readCookie(req, COOKIE_NAME));
}

// Middleware: allow the request only if it carries a valid admin session
function requireAdmin(req, res, next) {
  if (!getSecret()) {
    console.error("[AdminAuth] ❌ ADMIN_SESSION_SECRET is missing or shorter than 32 characters - admin access is disabled");
    return res.status(503).json({ success: false, error: "Admin access is not configured" });
  }

  const admin = getAdminFromRequest(req);
  if (!admin) {
    return res.status(401).json({ success: false, error: "Not logged in", loginRequired: true });
  }

  req.admin = admin;
  req.adminUser = { email: admin.email, role: admin.role };
  // Older handlers read the admin's email from this header. Replace whatever
  // the browser sent with the verified value, so it can be trusted.
  req.headers["x-admin-email"] = admin.email;
  next();
}

// Mount with app.use("/api/admin", adminGate), before every admin route
function adminGate(req, res, next) {
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, "") : req.path;
  const isPublic = PUBLIC_ADMIN_ROUTES.some(
    ([method, publicPath]) => method === req.method && publicPath === path
  );
  if (isPublic) return next();
  return requireAdmin(req, res, next);
}

module.exports = {
  createSessionToken,
  verifySessionToken,
  setSessionCookie,
  clearSessionCookie,
  getAdminFromRequest,
  requireAdmin,
  adminGate,
  isConfigured: () => !!getSecret(),
};
