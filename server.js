// screencv/server.js
// Express server with candidate + admin + feedback + PAYMENT + PUBLIC STATUS routes

// ⭐ LOAD .env.local (Optional - Vercel uses environment variables)
require("dotenv").config({ path: ".env.local", override: true });
console.log("[OK] ✅ Environment loaded (local or Vercel)");

const express = require("express");
const fileUpload = require("express-fileupload");
const path = require("path");
const { supabase } = require("./lib/supabase-client");

// Import API handlers
const { submitResume } = require("./api/candidate/submit.js");
const adminRoutes = require("./api/admin/routes");

// Feedback routes (NEW)
const feedbackRoutes = require("./api/candidate/feedback");
const adminFeedbackMetrics = require("./api/admin/feedback-metrics");

// ==================== PAYMENT IMPORTS ====================
const { createRazorpayOrder } = require("./api/candidate/razorpay-order");
const { verifyPayment } = require("./api/candidate/razorpay-verify");
const { handlePaymentWebhook } = require("./api/candidate/razorpay-webhook");
const { 
  getIncidents, 
  getIncidentDetail,
  resolveIncidentTriggerAnalysis, 
  resolveIncidentCustom,
  getPaymentStats 
} = require("./api/admin/payment-incidents");

// ✅ NEW ADMIN ANALYTICS IMPORTS (FIXED)
const { getPaymentOrders } = require("./api/admin/payment-orders");
const jobTitlesRoute = require("./api/admin/job-titles");
const dailyReportRoute = require("./api/admin/daily-report");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());  // ✅ For multipart/form-data (file uploads)
app.use(express.static("public"));

console.log("[Server] Starting ScreenCV server...");

// ============================================
// PUBLIC: TOOL STATUS (No Auth Required)
// ============================================

app.get("/api/tool-status", async (req, res) => {
  try {
    console.log("[Tool Status] Checking public tool status...");

    // Get tool_active
    const { data: toolData } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "tool_active")
      .single();

    // Get maintenance message
    const { data: messageData } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "maintenance_message")
      .single();

    const toolActive = toolData?.setting_value === "true";
    const maintenanceMessage =
      messageData?.setting_value || "ScreenCV is under maintenance";

    console.log("[Tool Status] ✅ Active:", toolActive);

    res.json({
      active: toolActive,
      maintenanceMode: !toolActive,
      maintenanceMessage: maintenanceMessage,
    });
  } catch (error) {
    console.error("[Tool Status] Error:", error.message);
    // Default to active if there's an error (fail-safe)
    res.json({
      active: true,
      maintenanceMode: false,
      maintenanceMessage: "ScreenCV is under maintenance",
    });
  }
});

console.log("[Server] ✅ Public tool status route registered:");
console.log("  GET /api/tool-status (no auth required)");

// ============================================
// CANDIDATE ROUTES (Public)
// ============================================

app.post("/api/candidate/submit", submitResume);

console.log("[Server] ✅ Candidate routes registered:");
console.log("  POST /api/candidate/submit");

// ============================================
// FEEDBACK ROUTES (NEW)
// ============================================

app.use("/api/candidate/feedback", feedbackRoutes);
app.use("/api/admin/feedback-metrics", adminFeedbackMetrics);

console.log("[Server] ✅ Feedback routes registered:");
console.log("  POST /api/candidate/feedback");
console.log("  POST /api/candidate/feedback/validate-token");
console.log("  GET /api/admin/feedback-metrics (auth required)");

// ==================== PAYMENT ROUTES ====================
// Candidate Payment Routes
// ✅ Note: fileUpload() middleware handles multipart/form-data for razorpay-order
app.post("/api/candidate/razorpay-order", createRazorpayOrder);
app.post("/api/candidate/razorpay-verify", verifyPayment);
app.post("/api/candidate/razorpay-webhook", handlePaymentWebhook);

// Admin Payment Incidents Routes
app.get("/api/admin/payment-incidents", getIncidents);
app.get("/api/admin/payment-incidents/:incidentId", getIncidentDetail);
app.post("/api/admin/payment-incidents/:incidentId/resolve-trigger", resolveIncidentTriggerAnalysis);
app.post("/api/admin/payment-incidents/:incidentId/resolve-custom", resolveIncidentCustom);
app.get("/api/admin/payment-stats", getPaymentStats);

console.log("[Server] ✅ Payment routes registered:");
console.log("  POST /api/candidate/razorpay-order (with file upload)");
console.log("  POST /api/candidate/razorpay-verify");
console.log("  POST /api/candidate/razorpay-webhook");
console.log("  GET  /api/admin/payment-incidents");
console.log("  GET  /api/admin/payment-incidents/:incidentId");
console.log("  POST /api/admin/payment-incidents/:incidentId/resolve-trigger");
console.log("  POST /api/admin/payment-incidents/:incidentId/resolve-custom");
console.log("  GET  /api/admin/payment-stats");

// ============================================
// ADMIN ROUTES (Protected with Auth)
// ============================================

app.use("/api/admin", adminRoutes);

// ✅ NEW ANALYTICS ADMIN ROUTES (FIXED - Destructured Functions)
app.get("/api/admin/payment-orders", getPaymentOrders);
app.get("/api/admin/job-titles", jobTitlesRoute);
app.get("/api/admin/daily-report", dailyReportRoute);

console.log("[Server] ✅ Admin routes registered:");
console.log("  GET /api/admin/analytics/daily (auth required)");
console.log("  GET /api/admin/analytics/monthly (auth required)");
console.log("  GET /api/admin/analytics/stats (auth required)");
console.log("  GET /api/admin/tool-status (auth required)");
console.log("  POST /api/admin/tool-status/toggle (auth required)");
console.log("  GET /api/admin/payment-orders (auth required)");
console.log("  GET /api/admin/job-titles (auth required)");
console.log("  GET /api/admin/daily-report (auth required)");

// ============================================
// SERVE ADMIN DASHBOARD
// ============================================

app.get("/admin", (req, res) => {
  console.log("[Server] Serving admin dashboard...");
  res.sendFile(path.join(__dirname, "public", "admin_dashboard.html"));
});

console.log("[Server] ✅ Admin dashboard route registered:");
console.log("  GET /admin");

// ============================================
// HOME ROUTES
// ============================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "screener.html"));
});

app.get("/screener.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "screener.html"));
});

app.get("/success.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "success.html"));
});

// ============================================
// FEEDBACK FORM ROUTE (NEW)
// ============================================

app.get("/feedback", (req, res) => {
  console.log("[Server] Serving public feedback form...");
  res.sendFile(path.join(__dirname, "public", "feedback.html"));
});

console.log("[Server] ✅ Public feedback form route registered:");
console.log("  GET /feedback");

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
  console.error("[Server] Error:", err.message);
  res.status(500).json({ success: false, error: "Server error" });
});

// ============================================
// START SERVER
// ============================================


app.listen(PORT, () => {
  console.log(
    `\n╔════════════════════════════════════════════╗\n║     ScreenCV Server Started ✅             ║\n║     http://localhost:${PORT}                  ║\n║     App: http://localhost:${PORT}/screener.html\n║     Admin: http://localhost:${PORT}/admin      ║\n║     Feedback: http://localhost:${PORT}/feedback\n║     Payment APIs: Ready ✅                   ║\n║     File Upload: Ready ✅                    ║\n║     Analytics APIs: Ready ✅                 ║\n╚════════════════════════════════════════════╝\n`
  );
});

module.exports = app;
