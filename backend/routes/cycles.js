const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Cycle = require('../models/Cycle');
const Group = require('../models/Group');
const Payment = require('../models/Payment');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// record payment for a cycle (creates pending record; admin must approve)
router.post('/:id/pay', auth, upload.single('proof'), async (req, res) => {
  try {
    const cycle = await Cycle.findById(req.params.id).populate('group');
    if (!cycle) {
      return res.status(404).json({ message: 'Payment cycle not found' });
    }

    // Check if user is a member of the group
    const group = await Group.findById(cycle.group);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    
    // Prevent payments on closed groups
    if (group.closedAt) {
      return res.status(403).json({ message: 'This group has been closed. Payments are no longer accepted' });
    }

    const isMember = group.members.some(m => m.user.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: 'You must be a member of this group to make payments' });
    }
    
    // Check if member is locked
    const member = group.members.find(m => m.user.toString() === req.user._id.toString());
    if (member && member.isLocked === true) {
      return res.status(403).json({ message: 'Your account has been locked. Please contact the group admin.' });
    }

    // Validate amount
    const amount = req.body.amount ? Number(req.body.amount) : group.monthlyContribution;
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Invalid payment amount' });
    }

    // Require proof
    if (!req.file && !req.body.proofUrl) {
      return res.status(400).json({ message: 'Payment proof is required' });
    }

    const proofUrl = req.file ? `/uploads/${req.file.filename}` : req.body.proofUrl;

    // Check existing record for this member
    const existing = cycle.payments.find(p => p.member.toString() === req.user._id.toString());
    if (existing) {
      if (existing.status === 'paid') {
        return res.status(400).json({ message: 'Payment already approved for this cycle' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ message: 'You already submitted a payment for approval' });
      }
      if (existing.status === 'rejected') {
        existing.status = 'pending';
        existing.paidAt = null;
        existing.amount = amount;
        existing.proofUrl = proofUrl;
        await cycle.save();

        const payment = new Payment({
          from: req.user._id,
          group: cycle.group,
          cycle: cycle._id,
          amount,
          proofUrl
        });
        await payment.save();

        return res.status(201).json({ message: 'Payment resubmitted for approval', cycle, payment });
      }
    }

    // Payment window is active for the entire cycle duration
    // Penalties will be calculated when admin approves the payment
    // No need to check window or calculate penalty here

    // Add payment record as pending (requires admin approval)
    // Penalty will be calculated based on approval date
    const paymentRecord = {
      member: req.user._id,
      paidAt: null,  // Will be set when admin approves
      proofUrl,
      amount,
      penaltyAmount: 0,  // Will be calculated on approval
      penaltyDays: 0,   // Will be calculated on approval
      status: 'pending'
    };
    cycle.payments.push(paymentRecord);
    await cycle.save();

    // Create payment log
    const payment = new Payment({
      from: req.user._id,
      group: cycle.group,
      cycle: cycle._id,
      amount,
      proofUrl
    });
    await payment.save();

    res.status(201).json({ message: 'Payment submitted for approval', cycle, payment });
  } catch (err) {
    console.error('Record payment error:', err);
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid cycle ID' });
    }
    res.status(500).json({ message: 'Failed to record payment. Please try again.' });
  }
});

// assign payout recipient (admin)
router.post('/:id/assign-payout', auth, async (req, res) => {
  try {
    const cycle = await Cycle.findById(req.params.id);
    if (!cycle) {
      return res.status(404).json({ message: 'Payment cycle not found' });
    }

    const group = await Group.findById(cycle.group);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the group administrator can assign payouts' });
    }

    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required' });
    }

    // Verify recipient is a member
    const isMember = group.members.some(m => m.user.toString() === recipientId.toString());
    if (!isMember) {
      return res.status(400).json({ message: 'Recipient must be a member of the group' });
    }

    cycle.payoutRecipient = recipientId;
    await cycle.save();

    res.json({ message: 'Payout recipient assigned successfully', cycle });
  } catch (err) {
    console.error('Assign payout error:', err);
    res.status(500).json({ message: 'Failed to assign payout recipient' });
  }
});

// execute payout (admin)
router.post('/:id/payout', auth, upload.single('payoutProof'), async (req, res) => {
  try {
    const cycle = await Cycle.findById(req.params.id);
    if (!cycle) {
      return res.status(404).json({ message: 'Payment cycle not found' });
    }

    // Only group admin can execute payout
    const group = await Group.findById(cycle.group);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the group administrator can execute payouts' });
    }

    // Allow updating proof even if already executed
    // Require proof
    if (!req.file && !req.body.payoutProof) {
      return res.status(400).json({ message: 'Payout proof is required' });
    }

    // If not yet executed, mark as executed
    if (!cycle.payoutExecuted) {
      cycle.payoutExecuted = true;
    }
    // Update proof (allows updating even if already executed)
    cycle.payoutProof = req.file ? `/uploads/${req.file.filename}` : req.body.payoutProof;
    await cycle.save();

    res.json({ message: 'Payout executed successfully', cycle });
  } catch (err) {
    console.error('Execute payout error:', err);
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid cycle ID' });
    }
    res.status(500).json({ message: 'Failed to execute payout. Please try again.' });
  }
});

// admin approves a member payment
router.post('/:id/payments/:paymentId/approve', auth, async (req, res) => {
  try {
    const cycle = await Cycle.findById(req.params.id);
    if (!cycle) return res.status(404).json({ message: 'Payment cycle not found' });
    const group = await Group.findById(cycle.group);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the group administrator can approve payments' });
    }
    const pr = cycle.payments.id(req.params.paymentId);
    if (!pr) return res.status(404).json({ message: 'Payment record not found' });
    
    // Calculate penalty based on approval date
    // Formula: late days = approval date - (window end + grace period)
    const windowStr = group.paymentWindow || '1-7';
    const [winStartStr, winEndStr] = String(windowStr).split('-');
    const winStart = Math.max(1, parseInt(winStartStr || '1', 10));
    const winEnd = Math.max(winStart, parseInt(winEndStr || String(winStart), 10));
    const gracePeriodDays = Number(group.gracePeriodDays || 0);
    const base = new Date(cycle.dueDate);
    const windowEnd = new Date(base.getFullYear(), base.getMonth(), winEnd, 23, 59, 59, 999);
    const graceEnd = new Date(windowEnd);
    graceEnd.setDate(graceEnd.getDate() + gracePeriodDays);
    const approvalDate = new Date();
    
    // Calculate penalty: late days = approval date - (window end + grace period)
    let penaltyAmount = 0;
    let penaltyDays = 0;
    if (approvalDate > graceEnd) {
      // Number of late days = approval date - (window end + grace period)
      const daysLate = Math.floor((approvalDate - graceEnd) / (1000 * 60 * 60 * 24));
      penaltyDays = daysLate;
      penaltyAmount = (pr.amount / 30) * daysLate;
    }
    
    pr.status = 'paid';
    pr.paidAt = approvalDate;  // Paid date is when admin approves
    pr.penaltyAmount = penaltyAmount;
    pr.penaltyDays = penaltyDays;
    await cycle.save();
    res.json({ message: 'Payment approved', cycle });
  } catch (err) {
    console.error('Approve payment error:', err);
    res.status(500).json({ message: 'Failed to approve payment' });
  }
});

// admin declines a member payment
router.post('/:id/payments/:paymentId/decline', auth, async (req, res) => {
  try {
    const cycle = await Cycle.findById(req.params.id);
    if (!cycle) return res.status(404).json({ message: 'Payment cycle not found' });
    const group = await Group.findById(cycle.group);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the group administrator can decline payments' });
    }
    const pr = cycle.payments.id(req.params.paymentId);
    if (!pr) return res.status(404).json({ message: 'Payment record not found' });
    pr.status = 'rejected';
    pr.paidAt = new Date();
    await cycle.save();
    res.json({ message: 'Payment rejected', cycle });
  } catch (err) {
    console.error('Decline payment error:', err);
    res.status(500).json({ message: 'Failed to decline payment' });
  }
});

module.exports = router;
