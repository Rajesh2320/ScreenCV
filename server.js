// screencv/server.js
// Simple Express server - back to basics, no routing complexity
//
// CHANGE: two new public addresses: /api/candidate/status (report progress,
// used by the success page) and /report/:reviewId (a finished report as a web
// page). Both live in api/candidate/report-status.js.
//
// CHANGE: every address under /api/admin now passes through adminGate, which
// requires a logged-in admin session. The only exceptions are the login,
// logout and public tool-status addresses (see lib/admin-auth.js).

require("dotenv").config({ path: ".env.local", override: true });
console.log("[OK] ✅ Environment loaded (local or Vercel)");

const express = require("express");
const fileUpload = require("express-fileupload");
const path = require("path");
const { supabase } = require("./lib/supabase-client");

// Admin session gate. If the file cannot be loaded for any reason, admin
// access is refused outright; the public site keeps working.
let adminGate;
try {
  ({ adminGate } = require("./lib/admin-auth"));
} catch (err) {
  console.error("[Server] ❌ Could not load lib/admin-auth.js - all admin access is DISABLED:", err.message);
  adminGate = (req, res) => res.status(503).json({ success: false, error: "Admin access is unavailable" });
}

// Import API handlers
const { submitResume } = require("./api/candidate/submit.js");

// Admin routes depend on lib/admin-auth.js too. Same rule: if they cannot be
// loaded, admin access is refused and the public site keeps working.
let adminRoutes;
try {
  adminRoutes = require("./api/admin/routes");
} catch (err) {
  console.error("[Server] ❌ Could not load api/admin/routes.js - admin routes are DISABLED:", err.message);
  adminRoutes = (req, res) => res.status(503).json({ success: false, error: "Admin access is unavailable" });
}

// Report progress + "view your report" page. If the file cannot be loaded,
// these two addresses answer "unavailable" and the rest of the site keeps working.
let getReportStatus, viewReport;
try {
  ({ getReportStatus, viewReport } = require("./api/candidate/report-status"));
} catch (err) {
  console.error("[Server] ❌ Could not load api/candidate/report-status.js:", err.message);
  getReportStatus = (req, res) => res.status(503).json({ success: false, error: "Status is unavailable" });
  viewReport = (req, res) => res.status(503).send("This report is unavailable at the moment. Please use the copy attached to your email.");
}

// Feedback routes
const feedbackRoutes = require("./api/candidate/feedback");
const adminFeedbackMetrics = require("./api/admin/feedback-metrics");

// Payment routes
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

// Analytics
const { getPaymentOrders } = require("./api/admin/payment-orders");
const jobTitlesRoute = require("./api/admin/job-titles");
const dailyReportRoute = require("./api/admin/daily-report");

const app = express();
const PORT = process.env.PORT || 3000;

console.log("[Server] Starting ScreenCV server...");

// ============================================
// ⭐ CRITICAL: Capture raw body for webhook
// This MUST come BEFORE express.json()
// ============================================

const captureRawBody = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || "utf8");
  }
};

// ============================================
// Register WEBHOOK first (with raw body capture)
// ============================================

app.post(
  "/api/candidate/razorpay-webhook",
  express.json({ verify: captureRawBody }),
  (req, res) => {
    console.log("[Webhook] Received with raw body:", req.rawBody ? "✅ YES" : "❌ NO");
    handlePaymentWebhook(req, res);
  }
);

console.log("[Server] ✅ Webhook route registered (with raw body capture)");

// ============================================
// MIDDLEWARE (now that webhook is registered)
// ============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static("public"));

// ============================================
// 🔒 ADMIN GATE
// Must stay ABOVE every /api/admin route below.
// ============================================

app.use("/api/admin", adminGate);

console.log("[Server] ✅ Admin session gate registered");

// ============================================
// PUBLIC: TOOL STATUS
// ============================================

app.get("/api/tool-status", async (req, res) => {
  try {
    console.log("[Tool Status] Checking public tool status...");

    const { data: toolData } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "tool_active")
      .single();

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
    res.json({
      active: true,
      maintenanceMode: false,
      maintenanceMessage: "ScreenCV is under maintenance",
    });
  }
});

console.log("[Server] ✅ Public tool status route registered");

// ============================================
// CANDIDATE ROUTES
// ============================================

app.post("/api/candidate/submit", submitResume);

// Progress of a report after payment (polled by success.html)
app.get("/api/candidate/status", getReportStatus);

// A finished report, opened from the private link in the email
app.get("/report/:reviewId", viewReport);

console.log("[Server] ✅ Candidate routes registered");

// ============================================
// FEEDBACK ROUTES
// ============================================

app.use("/api/candidate/feedback", feedbackRoutes);
app.use("/api/admin/feedback-metrics", adminFeedbackMetrics);

console.log("[Server] ✅ Feedback routes registered");

// ============================================
// PAYMENT ROUTES
// ============================================

app.post("/api/candidate/razorpay-order", createRazorpayOrder);
app.post("/api/candidate/razorpay-verify", verifyPayment);

// Admin Payment Routes
app.get("/api/admin/payment-incidents", getIncidents);
app.get("/api/admin/payment-incidents/:incidentId", getIncidentDetail);
app.post("/api/admin/payment-incidents/:incidentId/resolve-trigger", resolveIncidentTriggerAnalysis);
app.post("/api/admin/payment-incidents/:incidentId/resolve-custom", resolveIncidentCustom);
app.get("/api/admin/payment-stats", getPaymentStats);

console.log("[Server] ✅ Payment routes registered");

// ============================================
// ADMIN ROUTES
// ============================================

app.use("/api/admin", adminRoutes);

app.get("/api/admin/payment-orders", getPaymentOrders);
app.get("/api/admin/job-titles", jobTitlesRoute);
app.get("/api/admin/daily-report", dailyReportRoute);

console.log("[Server] ✅ Admin routes registered");

// ============================================
// SERVE ADMIN DASHBOARD
// ============================================

app.get("/admin", (req, res) => {
  console.log("[Server] Serving admin dashboard...");
  res.sendFile(path.join(__dirname, "public", "admin_dashboard.html"));
});

console.log("[Server] ✅ Admin dashboard route registered");

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
// FEEDBACK FORM ROUTE
// ============================================

app.get("/feedback", (req, res) => {
  console.log("[Server] Serving public feedback form...");
  res.sendFile(path.join(__dirname, "public", "feedback.html"));
});

console.log("[Server] ✅ Public feedback form route registered");

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
    `\n╔════════════════════════════════════════════╗\n║     ScreenCV Server Started ✅             ║\n║     http://localhost:${PORT}                  ║\n║     App: http://localhost:${PORT}/screener.html\n║     Admin: http://localhost:${PORT}/admin      ║\n║     Payment APIs: Ready ✅                   ║\n║     Webhook: Ready ✅                        ║\n╚════════════════════════════════════════════╝\n`
  );
});

module.exports = app;
