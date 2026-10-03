// screencv/api/admin/routes.js
// Admin dashboard routes
//
// CHANGES
//  1. A successful login now issues a signed session cookie. Before, login
//     only replied "success" and the server could not recognise the admin on
//     later requests.
//  2. New: POST /logout (clears the session) and GET /session (tells the
//     dashboard whether it is still logged in).
//  3. Protected routes check the session, not an email typed into a header.

const express = require("express");
const router = express.Router();

const {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin,
} = require("../../lib/admin-auth");

// Import analytics controller
const {
  getSubmissionStats,
  getDailyAnalytics,
  getToolStatus,
  toggleToolStatus,
} = require("./analytics");

// ===== PUBLIC ROUTES =====

// GET /api/admin/tool-status - Check if tool is active (no auth needed for frontend)
router.get("/tool-status", async (req, res) => {
  try {
    return await getToolStatus(req, res);
  } catch (error) {
    console.error("[ADMIN] Tool status error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/login - Validate admin credentials and start a session
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    const { supabase } = require("../../lib/supabase-client");
    const bcrypt = require("bcrypt");

    // Fetch admin user
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (error || !admin) {
      console.warn(`[ADMIN] Failed login attempt: ${email}`);
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, admin.password_hash);

    if (!passwordMatch) {
      console.warn(`[ADMIN] Failed password for: ${email}`);
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // Start the session
    const token = createSessionToken(admin);
    if (!token) {
      console.error("[ADMIN] ❌ Cannot start a session: ADMIN_SESSION_SECRET is missing or shorter than 32 characters");
      return res.status(503).json({ success: false, error: "Admin login is not configured on the server" });
    }
    setSessionCookie(req, res, token);

    console.log(`[ADMIN] ✅ Login successful: ${email}`);

    return res.json({
      success: true,
      email: admin.email,
      role: admin.role,
      message: "Login successful",
    });
  } catch (error) {
    console.error("[ADMIN] Login error:", error.message);
    return res.status(500).json({ success: false, error: "Login failed" });
  }
});

// POST /api/admin/logout - End the session
router.post("/logout", (req, res) => {
  clearSessionCookie(req, res);
  return res.json({ success: true });
});

// ===== PROTECTED ROUTES =====
// Everything below requires a valid admin session. server.js also puts the
// same check in front of every /api/admin address; it is repeated here so
// these routes stay protected even if that line is ever removed.

// GET /api/admin/session - Is this browser logged in?
router.get("/session", requireAdmin, (req, res) => {
  return res.json({ success: true, email: req.admin.email, role: req.admin.role });
});

// GET /api/admin/analytics/stats - Get dashboard stats
router.get("/analytics/stats", requireAdmin, async (req, res) => {
  try {
    return await getSubmissionStats(req, res);
  } catch (error) {
    console.error("[ADMIN] Stats error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/analytics/daily - Get daily analytics
router.get("/analytics/daily", requireAdmin, async (req, res) => {
  try {
    return await getDailyAnalytics(req, res);
  } catch (error) {
    console.error("[ADMIN] Daily analytics error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/tool-status/toggle - Toggle tool active status
router.put("/tool-status/toggle", requireAdmin, async (req, res) => {
  try {
    return await toggleToolStatus(req, res);
  } catch (error) {
    console.error("[ADMIN] Toggle tool status error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ===== ERROR HANDLER =====
router.use((err, req, res, next) => {
  console.error("[ADMIN] Route error:", err.message);
  res.status(500).json({ error: err.message });
});

module.exports = router;
