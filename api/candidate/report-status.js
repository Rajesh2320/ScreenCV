// screencv/api/candidate/report-status.js
// Two public addresses used after payment:
//
//   GET /api/candidate/status?submissionId=...
//       Tells the success page how far along a report is, so it can show real
//       progress: payment received -> analysing -> sending -> done.
//       Every stage reflects something that has actually happened in the
//       database; nothing is simulated.
//
//   GET /report/:reviewId
//       Shows a finished report as a web page. The link is private in the same
//       way an unlisted document link is: the id is a long random value that
//       cannot be guessed, and the link stops working after 30 days.
//
// Neither address needs a database change. They read what the payment and
// analysis code already saves.

const { supabase } = require("../../lib/supabase-client");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_LINK_DAYS = 30;
// If a report is not finished this long after payment, tell the customer it is delayed
const DELAYED_AFTER_SECONDS = 150;
const FAILURE_INCIDENTS = ["ANALYSIS_FAILED", "ANALYSIS_ERROR", "REPORT_EMAIL_FAILED", "ACCESS_CODE_EXHAUSTED"];

function secondsBetween(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 1000);
}

// "priya.desai@gmail.com" -> "p••••••••i@gmail.com"
function maskEmail(email) {
  const text = String(email || "");
  const at = text.lastIndexOf("@");
  if (at < 1) return "";
  const name = text.slice(0, at);
  const domain = text.slice(at);
  if (name.length <= 2) return name[0] + "•" + domain;
  return name[0] + "•".repeat(Math.min(name.length - 2, 8)) + name[name.length - 1] + domain;
}

function countRequirements(jobMatchAnalysis) {
  try {
    const rows = typeof jobMatchAnalysis === "string" ? JSON.parse(jobMatchAnalysis) : jobMatchAnalysis;
    return Array.isArray(rows) && rows.length > 0 ? rows.length : null;
  } catch (err) {
    return null;
  }
}

// GET /api/candidate/status?submissionId=...
async function getReportStatus(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const submissionId = String(req.query?.submissionId || "").trim();
    if (!UUID_PATTERN.test(submissionId)) {
      return res.status(400).json({ success: false, error: "Invalid submission id" });
    }

    const { data: submission, error: submissionError } = await supabase
      .from("candidate_submissions")
      .select("id, email, payment_status, payment_date, email_sent, updated_at")
      .eq("id", submissionId)
      .single();

    if (submissionError || !submission) {
      return res.status(404).json({ success: false, error: "Submission not found" });
    }

    if (submission.payment_status !== "captured") {
      return res.json({ success: true, stage: "awaiting_payment" });
    }

    const { data: reviews } = await supabase
      .from("candidate_reviews")
      .select("id, created_at, job_match_analysis")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false })
      .limit(1);
    const review = Array.isArray(reviews) && reviews.length > 0 ? reviews[0] : null;

    const elapsedSeconds = secondsBetween(submission.payment_date, new Date().toISOString());
    const base = {
      success: true,
      emailHint: maskEmail(submission.email),
      elapsedSeconds: elapsedSeconds !== null && elapsedSeconds >= 0 && elapsedSeconds < 86400 ? elapsedSeconds : null,
      requirementCount: review ? countRequirements(review.job_match_analysis) : null,
      reportUrl: review ? `/report/${review.id}` : null,
    };

    // Finished: the report is saved and the email has gone
    if (review && submission.email_sent === true) {
      const seconds = secondsBetween(submission.payment_date, submission.updated_at);
      return res.json({
        ...base,
        stage: "done",
        // Only reported when it is a believable processing time
        seconds: seconds !== null && seconds >= 3 && seconds <= 600 ? seconds : null,
      });
    }

    // Not finished: has something gone wrong?
    const { data: incidents } = await supabase
      .from("payment_incidents")
      .select("incident_type")
      .eq("submission_id", submissionId)
      .in("incident_type", FAILURE_INCIDENTS)
      .limit(5);
    const incidentTypes = (Array.isArray(incidents) ? incidents : []).map((incident) => incident.incident_type);

    // A test payment made with an access code that had no uses left: no report is coming
    if (!review && incidentTypes.includes("ACCESS_CODE_EXHAUSTED")) {
      return res.json({ ...base, stage: "code_used_up" });
    }

    // The report exists but the email could not be sent: the customer can still read it here
    if (review && incidentTypes.includes("REPORT_EMAIL_FAILED")) {
      return res.json({ ...base, stage: "ready_no_email" });
    }

    if (incidentTypes.some((type) => type !== "REPORT_EMAIL_FAILED" && type !== "ACCESS_CODE_EXHAUSTED")) {
      return res.json({ ...base, stage: "delayed" });
    }

    if (base.elapsedSeconds !== null && base.elapsedSeconds > DELAYED_AFTER_SECONDS) {
      return res.json({ ...base, stage: review ? "sending" : "delayed" });
    }

    return res.json({ ...base, stage: review ? "sending" : "analysing" });
  } catch (error) {
    console.error("[Status] Error:", error.message);
    return res.status(500).json({ success: false, error: "Could not check the status" });
  }
}

function messagePage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f5f7fa; color: #2c3e50; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .box { background: #fff; border-radius: 12px; padding: 40px 30px; max-width: 460px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
    h1 { font-size: 22px; margin: 0 0 12px; }
    p { font-size: 15px; line-height: 1.6; color: #555; margin: 0; }
  </style>
</head>
<body><div class="box"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
}

// GET /report/:reviewId
async function viewReport(req, res) {
  // The report page runs no scripts and loads nothing from other sites
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );

  try {
    const reviewId = String(req.params?.reviewId || "").trim();
    if (!UUID_PATTERN.test(reviewId)) {
      return res.status(404).send(messagePage("Report not found", "This report link is not valid. Please use the link from your email."));
    }

    const { data: review, error } = await supabase
      .from("candidate_reviews")
      .select("html_report, created_at")
      .eq("id", reviewId)
      .single();

    if (error || !review || !review.html_report) {
      return res.status(404).send(messagePage("Report not found", "We could not find this report. Please use the link from your email."));
    }

    const created = Date.parse(review.created_at);
    if (Number.isFinite(created) && Date.now() - created > REPORT_LINK_DAYS * 24 * 60 * 60 * 1000) {
      return res.status(410).send(
        messagePage("This link has expired", `Report links stay active for ${REPORT_LINK_DAYS} days. Your report is still attached to the email we sent you.`)
      );
    }

    return res.status(200).send(review.html_report);
  } catch (err) {
    console.error("[Report] Error:", err.message);
    return res.status(500).send(messagePage("Something went wrong", "We could not open this report just now. Please try again in a moment."));
  }
}

module.exports = {
  getReportStatus,
  viewReport,
  maskEmail,
  REPORT_LINK_DAYS,
};
