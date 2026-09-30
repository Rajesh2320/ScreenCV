// api/admin/daily-report.js
// Generate daily analytics report for the last 7 days

const { supabase } = require("../../lib/supabase-client");

async function getDailyReport(req, res) {
  try {
    console.log("[DailyReport] 🔵 getDailyReport() called");

    // Get data for the last 7 days (instead of just today)
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const startDate = sevenDaysAgo.toISOString();
    const endDate = today.toISOString();

    console.log("[DailyReport] 📅 Query period:", startDate, "to", endDate);

    // ✅ Query submissions created in the last 7 days (for extraction cost & payment status)
    const { data: submissions, error: submError } = await supabase
      .from("candidate_submissions")
      .select("id, created_at, payment_status, extraction_cost_inr")
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .order("created_at", { ascending: false });

    if (submError) {
      console.log("[DailyReport] ❌ Submissions error:", submError);
      throw submError;
    }

    console.log("[DailyReport] ✅ Got", submissions?.length || 0, "submissions in last 7 days");

    // ✅ Query reviews created in the last 7 days (for analysis cost)
    const { data: reviews, error: revError } = await supabase
      .from("candidate_reviews")
      .select("submission_id, analysis_cost_inr, created_at")
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    if (revError) {
      console.log("[DailyReport] ❌ Reviews error:", revError);
      throw revError;
    }

    console.log("[DailyReport] ✅ Got", reviews?.length || 0, "reviews in last 7 days");

    // ✅ Group by date and build daily report
    const dailyStats = {};

    // Initialize all days in range
    for (let d = new Date(sevenDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split("T")[0]; // YYYY-MM-DD
      dailyStats[dateKey] = {
        date: dateKey,
        submissions: 0,
        analyzed: 0,
        extractionCost: 0,   // Cost to extract PDF text
        analysisCost: 0,     // Cost to analyze with Claude
        claudeCost: 0,       // Total Claude cost (extraction + analysis)
        ibeAmount: 0,        // Income Before Expenses (customer paid ₹99 per submission)
        razorpayCost: 0,     // Razorpay charges (5.4%)
        netProfit: 0         // Net profit after all costs
      };
    }

    // Count submissions by date (extraction cost + payment status)
    (submissions || []).forEach(s => {
      const dateKey = s.created_at.split("T")[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].submissions += 1;
        const extractCost = parseFloat(s.extraction_cost_inr) || 0;
        dailyStats[dateKey].extractionCost += extractCost;
        dailyStats[dateKey].claudeCost += extractCost;  // Add to Claude cost
        
        // Track IBE (Income Before Expenses) from paid submissions
        if (s.payment_status === "captured") {
          dailyStats[dateKey].ibeAmount += 99;
        }
      }
    });

    // Count reviews by date (analysis cost)
    (reviews || []).forEach(r => {
      const dateKey = r.created_at.split("T")[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].analyzed += 1;
        const analysisCost = parseFloat(r.analysis_cost_inr) || 0;
        dailyStats[dateKey].analysisCost += analysisCost;
        dailyStats[dateKey].claudeCost += analysisCost;  // Add to Claude cost
      }
    });

    // Calculate Razorpay charges and Net Profit for each day
    // Razorpay formula: 2% + ₹3 per transaction (standard card rate)
    const razorpayPercentage = 0.02;
    const razorpayFixedPerTransaction = 3;
    
    Object.values(dailyStats).forEach(day => {
      // Count paid submissions for this day (those with IBE)
      const paidCount = day.ibeAmount > 0 ? (day.ibeAmount / 99) : 0;
      
      // Razorpay charge: (2% of IBE) + (₹3 per paid submission)
      day.razorpayCost = parseFloat((
        (day.ibeAmount * razorpayPercentage) + (razorpayFixedPerTransaction * paidCount)
      ).toFixed(2));
      
      day.netProfit = parseFloat((day.ibeAmount - day.claudeCost - day.razorpayCost).toFixed(2));
    });

    // Convert to array and sort by date descending
    const reportArray = Object.values(dailyStats).sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );

    console.log("[DailyReport] ✅ Generated report for", reportArray.length, "days");
    console.log("[DailyReport] 📊 Report data:", reportArray);

    return res.json({
      success: true,
      period: {
        start: startDate,
        end: endDate
      },
      daily: reportArray.map(d => ({
        date: d.date,
        submissions: d.submissions,
        analyzed: d.analyzed,
        ibe: d.ibeAmount,  // Income Before Expenses (customer payment)
        claudeCost: d.claudeCost.toFixed(2),  // Claude API costs
        razorpayCost: d.razorpayCost.toFixed(2),  // Razorpay fees
        netProfit: d.netProfit.toFixed(2)  // Net profit after all deductions
      }))
    });

  } catch (error) {
    console.error("[DailyReport] ❌ Error fetching daily report:", error.message);
    
    // Return graceful error response
    return res.json({
      success: false,
      error: error.message,
      daily: []
    });
  }
}

module.exports = getDailyReport;