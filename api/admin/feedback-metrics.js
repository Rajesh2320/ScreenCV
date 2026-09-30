// screencv/api/admin/feedback-metrics.js
// Fetch feedback metrics and analytics for admin dashboard

const express = require("express");
const supabase = require("../../lib/supabase-client");
const router = express.Router();

// ✅ Custom Auth Middleware (Header-based)
async function verifyAdminAuth(req, res, next) {
  const adminEmail = req.headers["x-admin-email"];
  const adminPassword = req.headers["x-admin-password"];

  console.log("[FeedbackMetrics Auth] Checking credentials...");

  if (!adminEmail || !adminPassword) {
    console.log("[FeedbackMetrics Auth] Missing credentials");
    return res.status(401).json({ error: "Missing admin credentials" });
  }

  try {
    // Check admin user in database
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("email", adminEmail)
      .single();

    if (error || !admin) {
      console.log("[FeedbackMetrics Auth] User not found:", adminEmail);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // For now, we'll use simple password check
    // In production, use bcrypt: await bcrypt.compare(adminPassword, admin.password_hash)
    if (adminPassword !== admin.password) {
      console.log("[FeedbackMetrics Auth] Invalid password");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log("[FeedbackMetrics Auth] ✅ Authenticated:", adminEmail);
    next();
  } catch (error) {
    console.error("[FeedbackMetrics Auth] Error:", error);
    res.status(500).json({ error: "Authentication error" });
  }
}

// ✅ GET /api/admin/feedback-metrics
router.get("/", verifyAdminAuth, async (req, res) => {
  try {
    console.log("[FeedbackMetrics] Fetching feedback data...");

    // Get all feedback
    const { data: allFeedback, error: feedbackError } = await supabase
      .from("candidate_submissions")
      .select("feedback_rating, feedback_remarks, feedback_date, feedback_submitted")
      .not("feedback_rating", "is", null)
      .order("feedback_date", { ascending: false });

    if (feedbackError) {
      throw feedbackError;
    }

    // Get total submissions
    const { data: allSubmissions, error: submissionError } = await supabase
      .from("candidate_submissions")
      .select("id", { count: "exact" });

    if (submissionError) {
      throw submissionError;
    }

    const totalSubmissions = allSubmissions.length;
    const totalFeedback = allFeedback.length;

    console.log("[FeedbackMetrics] Total submissions:", totalSubmissions);
    console.log("[FeedbackMetrics] Total feedback entries:", totalFeedback);

    // Calculate average rating
    const avgRating =
      totalFeedback > 0
        ? (
            allFeedback.reduce((sum, f) => sum + (f.feedback_rating || 0), 0) /
            totalFeedback
          ).toFixed(2)
        : 0;

    // Calculate feedback rate
    const feedbackRate =
      totalSubmissions > 0 ? ((totalFeedback / totalSubmissions) * 100).toFixed(2) : 0;

    // Calculate rating distribution
    const ratingDistribution = {};
    allFeedback.forEach((f) => {
      const rating = f.feedback_rating || 0;
      ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
    });

    // Get recent feedback (last 10)
    const recentFeedback = allFeedback.slice(0, 10);

    const response = {
      avgRating: parseFloat(avgRating),
      totalRatings: totalFeedback,
      totalFeedback: totalFeedback,
      feedbackRate: parseFloat(feedbackRate),
      ratingDistribution: ratingDistribution,
      recentFeedback: recentFeedback,
      totalSubmissions: totalSubmissions,
    };

    console.log("[FeedbackMetrics] ✅ Metrics calculated:", {
      avgRating: response.avgRating,
      totalFeedback: response.totalFeedback,
      feedbackRate: response.feedbackRate,
    });

    res.json(response);
  } catch (error) {
    console.error("[FeedbackMetrics] Error:", error);
    res.status(500).json({
      error: "Failed to fetch feedback metrics",
      details: error.message,
    });
  }
});

module.exports = router;