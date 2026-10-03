// screencv/api/admin/analytics.js
// Admin analytics endpoints
//
// CHANGES
//  1. checkSuperAdmin used to accept any request that carried an admin's
//     email address in a header, with no proof of login. It now requires a
//     valid admin session (see lib/admin-auth.js).
//  2. getSubmissionStats no longer prints the request headers to the logs.
//     Those headers included the admin password on every dashboard refresh.
//  3. Income is now the sum of what customers actually paid, instead of ₹99
//     multiplied by the number of paid reports. Needed for discount codes.

const { supabase } = require("../../lib/supabase-client");
const { requireAdmin } = require("../../lib/admin-auth");

// ===== MIDDLEWARE: Check that the request comes from a logged-in admin =====
// Kept under its old name so any file that still imports it is protected.
function checkSuperAdmin(req, res, next) {
  return requireAdmin(req, res, next);
}

// ===== GET SUBMISSION STATS (for dashboard login + stats display) =====
async function getSubmissionStats(req, res) {
  try {
    console.log("[ADMIN] 🔵 getSubmissionStats() called by:", req.admin?.email || "unknown");

    // Fetch all submissions
    const { data: submissions, error: submissionsError } = await supabase
      .from("candidate_submissions")
      .select("id,created_at,extraction_cost_inr,email_sent,payment_status,payment_amount");

    if (submissionsError) {
      console.error("[ADMIN] ❌ Submissions error:", submissionsError);
      throw submissionsError;
    }

    // Fetch all reviews
    const { data: reviews, error: reviewsError } = await supabase
      .from("candidate_reviews")
      .select("id,submission_id,analysis_cost_inr,created_at");

    if (reviewsError) {
      console.error("[ADMIN] ❌ Reviews error:", reviewsError);
      throw reviewsError;
    }

    // Calculate totals
    const totalSubmissions = submissions?.length || 0;
    const analyzedCount = reviews?.length || 0;
    const emailsSent = submissions?.filter(s => s.email_sent === true).length || 0;

    let totalCost = 0;
    if (reviews && reviews.length > 0) {
      totalCost = reviews.reduce((sum, r) => sum + (parseFloat(r.analysis_cost_inr) || 0), 0);
    }
    if (submissions && submissions.length > 0) {
      totalCost += submissions.reduce((sum, s) => sum + (parseFloat(s.extraction_cost_inr) || 0), 0);
    }

    // Calculate today's and this month's counts
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayCount = 0;
    let monthCount = 0;

    if (submissions && submissions.length > 0) {
      submissions.forEach(s => {
        if (s.created_at) {
          const createdDate = new Date(s.created_at);
          if (createdDate >= todayStart) todayCount++;
          if (createdDate >= monthStart) monthCount++;
        }
      });
    }

    // Financial Breakdown
    // Income is what customers actually paid. With discount codes that is no
    // longer always ₹99, so the saved payment amounts are added up. A paid
    // submission with no amount saved (older rows) is counted at ₹99.
    const paidRows = submissions?.filter(s => s.payment_status === "captured") || [];
    const paidSubmissions = paidRows.length;
    const totalIBE = parseFloat(paidRows.reduce((sum, s) => {
      const paid = parseFloat(s.payment_amount);
      return sum + (Number.isFinite(paid) && paid > 0 ? paid : 99);
    }, 0).toFixed(2));  // Income Before Expenses (what customers paid)

    // Razorpay charges: 2% + ₹3 per transaction (standard for credit/debit cards)
    const razorpayPercentage = 0.02;
    const razorpayFixedPerTransaction = 3;
    const totalRazorpayCharges = parseFloat((
      (totalIBE * razorpayPercentage) + (razorpayFixedPerTransaction * paidSubmissions)
    ).toFixed(2));

    // Net Profit = IBE - Claude costs - Razorpay charges
    const netProfit = parseFloat((totalIBE - totalCost - totalRazorpayCharges).toFixed(2));

    const responseData = {
      success: true,
      totalSubmissions,
      analyzedCount,
      todayCount,
      monthCount,
      // Financial Breakdown
      ibeAmount: totalIBE,  // Income Before Expenses (customer paid)
      claudeCost: parseFloat(totalCost.toFixed(2)),  // Claude API costs
      razorpayCost: totalRazorpayCharges,  // Razorpay fees
      netProfit: netProfit,  // Actual profit after all deductions
      emailsSent,
    };

    console.log(`[ADMIN] ✅ Stats calculated - Submissions: ${totalSubmissions}, Analyzed: ${analyzedCount}, IBE: ₹${totalIBE}, Claude Cost: ₹${totalCost.toFixed(2)}, Razorpay: ₹${totalRazorpayCharges}, Net Profit: ₹${netProfit}`);

    res.json(responseData);
  } catch (error) {
    console.error("[ADMIN] Error fetching submission stats:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ===== GET DAILY ANALYTICS =====
async function getDailyAnalytics(req, res) {
  try {
    const { data, error } = await supabase.from("daily_analytics").select("*").order("report_date", { ascending: false });

    if (error) throw error;

    return res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error("[ADMIN] Error fetching daily analytics:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ===== GET TOOL STATUS =====
async function getToolStatus(req, res) {
  try {
    const { data, error } = await supabase
      .from("admin_settings")
      .select("setting_key,setting_value")
      .in("setting_key", ["tool_active", "maintenance_message"]);

    if (error) throw error;

    const settings = {};
    if (data && Array.isArray(data)) {
      data.forEach(item => {
        settings[item.setting_key] = item.setting_value;
      });
    }

    return res.json({
      success: true,
      tool_active: settings.tool_active || "true",
      maintenance_message: settings.maintenance_message || "ScreenCV is under maintenance",
    });
  } catch (error) {
    console.error("[ADMIN] Error fetching tool status:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ===== TOGGLE TOOL STATUS =====
async function toggleToolStatus(req, res) {
  try {
    const { data: current } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "tool_active")
      .single();

    const currentValue = current?.setting_value || "true";
    const newValue = currentValue === "true" ? "false" : "true";

    const { error } = await supabase
      .from("admin_settings")
      .update({ setting_value: newValue })
      .eq("setting_key", "tool_active");

    if (error) throw error;

    console.log(`[ADMIN] Tool status toggled to: ${newValue} by ${req.admin?.email || "unknown"}`);

    return res.json({
      success: true,
      tool_active: newValue,
    });
  } catch (error) {
    console.error("[ADMIN] Error toggling tool status:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  checkSuperAdmin,
  getSubmissionStats,
  getDailyAnalytics,
  getToolStatus,
  toggleToolStatus,
};
