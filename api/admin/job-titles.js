const bcrypt = require("bcrypt");
const { createClient } = require("@supabase/supabase-js");
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require("../../lib/constants");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verifyAdmin(req, res, next) {
  try {
    const adminEmail = req.headers["x-admin-email"];
    const adminPassword = req.headers["x-admin-password"];

    if (!adminEmail || !adminPassword) {
      console.log("[JobTitles] Missing email or password headers");
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Fetch admin from database
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("email", adminEmail)
      .eq("is_active", true)
      .single();

    if (error || !admin) {
      console.log("[JobTitles] Admin not found:", adminEmail);
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Compare password with bcrypt hash
    const passwordMatch = await bcrypt.compare(adminPassword, admin.password_hash);

    if (!passwordMatch) {
      console.log("[JobTitles] Password mismatch for:", adminEmail);
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    console.log(`[JobTitles] ✅ Authenticated: ${adminEmail}`);
    req.admin = admin;
    next();
  } catch (err) {
    console.error("[JobTitles] Auth error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

async function getJobTitles(req, res) {
  try {
    console.log("[JobTitles] Fetching job titles from submissions...");

    const { data: submissions, error } = await supabase
      .from("candidate_submissions")
      .select("job_title");

    if (error) {
      console.error("[JobTitles] Database error:", error);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    console.log("[JobTitles] Fetched", submissions.length, "submissions");

    const titleCounts = {};
    
    (submissions || []).forEach(sub => {
      if (sub.job_title && sub.job_title.trim()) {
        const title = sub.job_title.trim();
        titleCounts[title] = (titleCounts[title] || 0) + 1;
      }
    });

    const jobTitles = Object.entries(titleCounts)
      .map(([job_title, count]) => ({
        job_title,
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    console.log("[JobTitles] ✅ Found", jobTitles.length, "unique titles");
    console.log("[JobTitles] Top 5:", jobTitles.slice(0, 5));

    return res.json({
      success: true,
      jobTitles: jobTitles,
      totalUnique: jobTitles.length,
      totalSubmissions: submissions.length,
    });

  } catch (error) {
    console.error("[JobTitles] Error:", error.message);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

module.exports = (req, res, next) => {
  verifyAdmin(req, res, () => getJobTitles(req, res));
};