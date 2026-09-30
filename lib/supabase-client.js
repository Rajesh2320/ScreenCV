// screencv/lib/supabase-client.js
// Supabase database client helper

const { createClient } = require("@supabase/supabase-js");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = require("./constants");

// Create Supabase client with service role (for backend operations)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// Helper: Create submission
async function createSubmission(data) {
  try {
    const { data: result, error } = await supabase
      .from("candidate_submissions")
      .insert([data])
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Create payment record
async function createPayment(data) {
  try {
    const { data: result, error } = await supabase
      .from("candidate_payments")
      .insert([data])
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Update payment status
async function updatePaymentStatus(paymentId, status, razorpayPaymentId = null) {
  try {
    const updateData = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (razorpayPaymentId) {
      updateData.razorpay_payment_id = razorpayPaymentId;
    }

    if (status === "COMPLETED") {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: result, error } = await supabase
      .from("candidate_payments")
      .update(updateData)
      .eq("id", paymentId)
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Get payment by Razorpay Order ID
async function getPaymentByOrderId(orderId) {
  try {
    const { data: result, error } = await supabase
      .from("candidate_payments")
      .select("*")
      .eq("razorpay_order_id", orderId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return { success: false, error: "Payment not found for this order ID" };
      }
      throw new Error(`DB Error: ${error.message}`);
    }
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Get payment by ID
async function getPayment(paymentId) {
  try {
    const { data: result, error } = await supabase
      .from("candidate_payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Get submission by ID
async function getSubmission(submissionId) {
  try {
    const { data: result, error } = await supabase
      .from("candidate_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Create review (analysis result)
async function createReview(data) {
  try {
    const { data: result, error } = await supabase
      .from("candidate_reviews")
      .insert([data])
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Create report record
async function createReport(data) {
  try {
    const { data: result, error } = await supabase
      .from("candidate_reports")
      .insert([data])
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Update report
async function updateReport(reportId, data) {
  try {
    const { data: result, error } = await supabase
      .from("candidate_reports")
      .update(data)
      .eq("id", reportId)
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Update or create session
async function upsertSession(email) {
  try {
    const { data: result, error } = await supabase
      .from("candidate_sessions")
      .upsert(
        {
          email,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      )
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Log token usage
async function logTokenUsage(data) {
  try {
    const { error } = await supabase
      .from("token_usage_logs")
      .insert([data]);

    if (error) throw new Error(`DB Error: ${error.message}`);
    return { success: true };
  } catch (err) {
    console.warn("[Token Log] Error:", err.message);
    return { success: false };
  }
}

module.exports = {
  supabase,
  createSubmission,
  createPayment,
  updatePaymentStatus,
  getPayment,
  getPaymentByOrderId,
  getSubmission,
  createReview,
  createReport,
  updateReport,
  upsertSession,
  logTokenUsage,
};