// screencv/api/admin/analytics.js
// Clean, working analytics endpoint

const { supabase } = require("../../lib/supabase-client");

// ===== MIDDLEWARE: Check if user is super admin =====
async function checkSuperAdmin(req, res, next) {
  try {
    console.log("[ADMIN] 🔵 checkSuperAdmin middleware called");
    const userEmail = req.headers["x-admin-email"];
    console.log("[ADMIN] 🔵 Admin email from header:", userEmail);
    
    if (!userEmail) {
      console.log("[ADMIN] ❌ No admin email provided");
      return res.status(401).json({ error: "Unauthorized: No admin email provided" });
    }

    console.log("[ADMIN] 🔵 Querying admin_users table...");
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("email", userEmail)
      .eq("is_active", true)
      .single();

    if (error) {
      console.error("[ADMIN] ❌ Database error:", error);
    }

    if (error || !admin) {
      console.warn(`[ADMIN] ❌ Unauthorized access attempt by: ${userEmail}`);
      return res.status(403).json({ error: "Forbidden: User not authorized as super admin" });
    }

    console.log("[ADMIN] ✅ Admin verified:", admin.email);
    req.adminUser = admin;
    console.log("[ADMIN] 🟢 Calling next() to proceed to route handler");
    next();
  } catch (err) {
    console.error("[ADMIN] ❌ Middleware error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ===== GET SUBMISSION STATS (for dashboard login + stats display) =====
async function getSubmissionStats(req, res) {
  try {
    console.log("[ADMIN] 🔵 getSubmissionStats() called");
    console.log("[ADMIN] 🔵 Request headers:", req.headers);
    console.log("[ADMIN] 🔵 Admin user:", req.adminUser?.email || "NO ADMIN USER");

    // Fetch all submissions
    console.log("[ADMIN] 🔵 Fetching submissions...");
    const { data: submissions, error: submissionsError } = await supabase
      .from("candidate_submissions")
      .select("id,created_at,extraction_cost_inr,email_sent,payment_status");

    if (submissionsError) {
      console.error("[ADMIN] ❌ Submissions error:", submissionsError);
      throw submissionsError;
    }
    console.log(`[ADMIN] ✅ Got ${submissions?.length || 0} submissions`);

    // Fetch all reviews
    console.log("[ADMIN] 🔵 Fetching reviews...");
    const { data: reviews, error: reviewsError } = await supabase
      .from("candidate_reviews")
      .select("id,submission_id,analysis_cost_inr,created_at");

    if (reviewsError) {
      console.error("[ADMIN] ❌ Reviews error:", reviewsError);
      throw reviewsError;
    }
    console.log(`[ADMIN] ✅ Got ${reviews?.length || 0} reviews`);

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

    // ✅ Financial Breakdown
    const paidSubmissions = submissions?.filter(s => s.payment_status === "captured").length || 0;
    const totalIBE = paidSubmissions * 99;  // Income Before Expenses (what customer paid)
    
    // ✅ Razorpay charges: 2% + ₹3 per transaction (standard for credit/debit cards)
    // For UPI: 0% + ₹0, but we'll use standard card rate as default
    // Actual formula: (IBE × 0.02) + (3 × number_of_transactions)
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
    console.log("[ADMIN] 🟢 SENDING RESPONSE:", JSON.stringify(responseData));

    res.json(responseData);
    console.log("[ADMIN] ✅ Response sent successfully");
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

    console.log(`[ADMIN] Tool status toggled to: ${newValue}`);

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