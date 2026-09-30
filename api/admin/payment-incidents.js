// screencv/api/admin/payment-incidents.js
// Admin dashboard: View and resolve payment incidents

const { supabase } = require("../../lib/supabase-client");
const { analyzeResumeVsJob } = require("../candidate/analyze");

// Get all unresolved payment incidents
async function getIncidents(req, res) {
  try {
    const { status = "unresolved", limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from("payment_incidents")
      .select("*", { count: "exact" });

    if (status) {
      query = query.eq("status", status);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      incidents: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Incidents] Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// Get incident details
async function getIncidentDetail(req, res) {
  try {
    const { incidentId } = req.params;

    const { data: incident, error } = await supabase
      .from("payment_incidents")
      .select("*")
      .eq("id", incidentId)
      .single();

    if (error || !incident) {
      return res.status(404).json({
        success: false,
        error: "Incident not found",
      });
    }

    // Get submission details if incident_type allows
    let submissionData = null;
    if (incident.submission_id) {
      const { data: submission } = await supabase
        .from("candidate_submissions")
        .select("*")
        .eq("id", incident.submission_id)
        .single();

      submissionData = submission;
    }

    res.json({
      success: true,
      incident,
      submission: submissionData,
    });
  } catch (error) {
    console.error("[IncidentDetail] Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// Resolve incident by triggering analysis manually
async function resolveIncidentTriggerAnalysis(req, res) {
  try {
    const { incidentId } = req.params;
    const { adminEmail } = req.body;

    if (!adminEmail) {
      return res.status(400).json({
        success: false,
        error: "Admin email required",
      });
    }

    // Get incident
    const { data: incident, error: incidentError } = await supabase
      .from("payment_incidents")
      .select("*")
      .eq("id", incidentId)
      .single();

    if (incidentError || !incident) {
      return res.status(404).json({
        success: false,
        error: "Incident not found",
      });
    }

    // Get submission
    const { data: submission, error: submissionError } = await supabase
      .from("candidate_submissions")
      .select("*")
      .eq("id", incident.submission_id)
      .single();

    if (submissionError || !submission) {
      return res.status(404).json({
        success: false,
        error: "Submission not found",
      });
    }

    console.log(`[ResolveIncident] Triggering analysis for submission ${submission.id}...`);

    // Trigger analysis
    try {
      const analysisResult = await analyzeResumeVsJob(
        submission.id,
        submission.resume_text,
        submission.job_description,
        submission.job_title,
        submission.email,
        submission.feedback_token,
        {
          orderId: incident.razorpay_order_id,
          paymentId: incident.razorpay_payment_id,
          amount: incident.amount,
          timestamp: new Date().toISOString(),
        }
      );

      if (!analysisResult.success) {
        throw new Error(analysisResult.error);
      }

      // Mark incident as resolved
      const { error: updateError } = await supabase
        .from("payment_incidents")
        .update({
          status: "resolved",
          resolution_action: "TRIGGER_ANALYSIS",
          resolution_notes: "Analysis triggered manually by admin",
          resolved_by: adminEmail,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", incidentId);

      if (updateError) {
        throw updateError;
      }

      console.log(`[ResolveIncident] ✅ Incident resolved and analysis complete`);

      res.json({
        success: true,
        message: "Analysis triggered and email sent",
        incident: {
          id: incidentId,
          status: "resolved",
          action: "TRIGGER_ANALYSIS",
        },
      });
    } catch (analysisError) {
      console.error("[ResolveIncident] Analysis error:", analysisError);

      return res.status(500).json({
        success: false,
        error: analysisError.message,
      });
    }
  } catch (error) {
    console.error("[ResolveIncident] Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// Resolve incident with custom action
async function resolveIncidentCustom(req, res) {
  try {
    const { incidentId } = req.params;
    const { resolution_action, resolution_notes, adminEmail } = req.body;

    if (!resolution_action || !resolution_notes || !adminEmail) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: resolution_action, resolution_notes, adminEmail",
      });
    }

    const { error } = await supabase
      .from("payment_incidents")
      .update({
        status: "resolved",
        resolution_action,
        resolution_notes,
        resolved_by: adminEmail,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", incidentId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    console.log(`[ResolveCustom] ✅ Incident ${incidentId} resolved with action: ${resolution_action}`);

    res.json({
      success: true,
      message: `Incident resolved with action: ${resolution_action}`,
    });
  } catch (error) {
    console.error("[ResolveCustom] Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// Get payment stats
async function getPaymentStats(req, res) {
  try {
    const { data: incidents, error } = await supabase
      .from("payment_incidents")
      .select("*");

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    const stats = {
      total: incidents.length,
      unresolved: incidents.filter((i) => i.status === "unresolved").length,
      resolved: incidents.filter((i) => i.status === "resolved").length,
      refunded: incidents.filter((i) => i.status === "refunded").length,
      byIncidentType: {},
      byResolution: {},
    };

    // Count by incident type
    incidents.forEach((inc) => {
      stats.byIncidentType[inc.incident_type] =
        (stats.byIncidentType[inc.incident_type] || 0) + 1;
      if (inc.resolution_action) {
        stats.byResolution[inc.resolution_action] =
          (stats.byResolution[inc.resolution_action] || 0) + 1;
      }
    });

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("[PaymentStats] Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

module.exports = {
  getIncidents,
  getIncidentDetail,
  resolveIncidentTriggerAnalysis,
  resolveIncidentCustom,
  getPaymentStats,
};