// screencv/api/admin/routes.js
// Admin dashboard routes

const express = require("express");
const router = express.Router();

// Import analytics controller
const {
  checkSuperAdmin,
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

// ===== PROTECTED ROUTES =====
// All routes below require super admin authentication

// POST /api/admin/login - Validate admin credentials
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
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

    console.log(`[ADMIN] ✅ Login successful: ${email}`);

    return res.json({
      success: true,
      email: admin.email,
      role: admin.role,
      message: "Login successful",
    });
  } catch (error) {
    console.error("[ADMIN] Login error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/analytics/stats - Get dashboard stats
router.get("/analytics/stats", checkSuperAdmin, async (req, res) => {
  try {
    return await getSubmissionStats(req, res);
  } catch (error) {
    console.error("[ADMIN] Stats error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/analytics/daily - Get daily analytics
router.get("/analytics/daily", checkSuperAdmin, async (req, res) => {
  try {
    return await getDailyAnalytics(req, res);
  } catch (error) {
    console.error("[ADMIN] Daily analytics error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/tool-status/toggle - Toggle tool active status
router.put("/tool-status/toggle", checkSuperAdmin, async (req, res) => {
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