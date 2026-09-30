// api/admin/payment-orders.js
// Fetch payment orders from candidate_submissions table (actual payment data location)

const { supabase } = require("../../lib/supabase-client");

async function getPaymentOrders(req, res) {
  try {
    console.log("[PaymentOrders] 🔵 getPaymentOrders() called");

    // ✅ Payment data is stored in candidate_submissions, NOT candidate_payments
    // Query for submissions that have payment data
    const { data: payments, error: paymentError } = await supabase
      .from("candidate_submissions")
      .select(`
        id,
        email,
        candidate_name,
        job_title,
        payment_amount,
        payment_status,
        payment_date,
        razorpay_order_id,
        razorpay_payment_id,
        created_at
      `)
      .not("payment_status", "is", null)  // Only records with payment status
      .order("payment_date", { ascending: false })
      .limit(100);

    if (paymentError) {
      console.log("[PaymentOrders] ❌ Payments error:", paymentError);
      throw paymentError;
    }

    console.log("[PaymentOrders] ✅ Got", payments?.length || 0, "payment records");

    // ✅ Format payment records for display
    if (payments && payments.length > 0) {
      const formattedPayments = payments.map(payment => ({
        id: payment.id,
        date: payment.payment_date 
          ? new Date(payment.payment_date).toLocaleDateString("en-IN")
          : new Date(payment.created_at).toLocaleDateString("en-IN"),
        email: payment.email || "N/A",
        name: payment.candidate_name || "N/A",
        jobTitle: payment.job_title || "N/A",
        amount: "₹" + (payment.payment_amount || 99),
        status: payment.payment_status || "pending",
        razorpayOrderId: payment.razorpay_order_id || "N/A",
        razorpayPaymentId: payment.razorpay_payment_id || "N/A"
      }));

      console.log("[PaymentOrders] ✅ Formatted", formattedPayments.length, "payments for display");
      return res.json({
        success: true,
        count: formattedPayments.length,
        payments: formattedPayments
      });
    }

    // No payments found, return empty array
    console.log("[PaymentOrders] ℹ️ No payment records found");
    return res.json({
      success: true,
      count: 0,
      payments: []
    });

  } catch (error) {
    console.error("[PaymentOrders] ❌ Error fetching payment orders:", error.message);
    
    // Return empty array on error instead of 500
    return res.json({
      success: false,
      error: error.message,
      count: 0,
      payments: []
    });
  }
}

module.exports = { getPaymentOrders };