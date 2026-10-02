// Example: How to add logging to razorpay-verify.js
// Add this after calling analyzeResumeVsJob

// ... existing code ...

try {
  console.log('[Verify] Calling analyzeResumeVsJob...');
  
  const result = await analyzeResumeVsJob(
    submission.id,
    submission.resume_text,
    submission.job_description,
    submission.job_title,
    submission.email,
    submission.feedback_token,
    {
      orderId: order.id,
      paymentId: payment.id,
      amount: amountINR,
      timestamp: new Date().toISOString(),
    }
  );

  // ✅ LOG ALL ANALYSIS LOGS TO BROWSER CONSOLE
  if (result.logs && Array.isArray(result.logs)) {
    console.group('%c🔍 ScreenCV Analysis Pipeline Logs', 'color: #667eea; font-weight: bold; font-size: 14px;');
    result.logs.forEach(log => {
      if (log.includes('✅')) {
        console.log('%c' + log, 'color: #4caf50; font-weight: bold;');
      } else if (log.includes('❌')) {
        console.log('%c' + log, 'color: #f44336; font-weight: bold;');
      } else if (log.includes('⚙️')) {
        console.log('%c' + log, 'color: #ff9800;');
      } else {
        console.log('%c' + log, 'color: #666;');
      }
    });
    console.groupEnd();
  }

  if (!result.success) {
    console.error('[Verify] ❌ Analysis failed:', result.error);
    return res.status(500).json({
      success: false,
      error: result.error || 'Analysis failed',
      logs: result.logs
    });
  }

  console.log('[Verify] ✅ Analysis successful, score:', result.score);
  
  return res.status(200).json({
    success: true,
    message: 'Payment verified and analysis complete',
    logs: result.logs,
    score: result.score,
    reviewId: result.reviewId
  });

} catch (error) {
  console.error('[Verify] Error:', error);
  return res.status(500).json({
    success: false,
    error: error.message
  });
}
