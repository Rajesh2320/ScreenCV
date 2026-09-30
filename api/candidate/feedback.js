const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase-client');

// ✅ POST /api/candidate/feedback - Store feedback
router.post('/', async (req, res) => {
  try {
    const { feedbackToken, rating, remarks } = req.body;

    // Validate token exists and find submission
    const { data: submission, error: findError } = await supabase
      .from('candidate_submissions')
      .select('id, email')
      .eq('feedback_token', feedbackToken)
      .single();

    if (findError || !submission) {
      return res.status(404).json({ 
        success: false, 
        error: 'Submission not found or token expired' 
      });
    }

    // Validate rating if provided
    if (rating !== null && (rating < 0 || rating > 5 || ![0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].includes(rating))) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid rating value' 
      });
    }

    // Validate remarks if provided
    if (remarks && remarks.length > 500) {
      return res.status(400).json({ 
        success: false, 
        error: 'Remarks cannot exceed 500 characters' 
      });
    }

    // Update submission with feedback
    const { error: updateError } = await supabase
      .from('candidate_submissions')
      .update({
        feedback_submitted: true,
        feedback_rating: rating || null,
        feedback_remarks: remarks || null,
        feedback_date: new Date().toISOString()
      })
      .eq('feedback_token', feedbackToken);

    if (updateError) {
      throw updateError;
    }

    res.json({ 
      success: true, 
      message: 'Thank you for your feedback!' 
    });

  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to store feedback: ' + error.message 
    });
  }
});

// ✅ POST /api/candidate/validate-token - Validate feedback token
router.post('/validate-token', async (req, res) => {
  try {
    const { feedbackToken } = req.body;

    if (!feedbackToken) {
      return res.json({ valid: false });
    }

    const { data, error } = await supabase
      .from('candidate_submissions')
      .select('id')
      .eq('feedback_token', feedbackToken)
      .single();

    if (error || !data) {
      return res.json({ valid: false });
    }

    res.json({ valid: true });

  } catch (error) {
    console.error('Token validation error:', error);
    res.json({ valid: false });
  }
});

module.exports = router;