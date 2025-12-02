const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Dispute = require('../models/Dispute');
const Group = require('../models/Group');

// Test route to verify disputes endpoint is accessible
router.get('/test', (req, res) => {
  res.json({ message: 'Disputes route is working' });
});

// Create a dispute (member only)
router.post('/', auth, async (req, res) => {
  try {
    const { groupId, subject, message } = req.body;
    if (!groupId || !subject || !message) {
      return res.status(400).json({ message: 'Group ID, subject, and message are required' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Check if user is a member (not admin)
    const isMember = group.members?.some(m => {
      const mid = m.user?._id || m.user;
      const userId = req.user._id || req.user.id;
      return String(mid) === String(userId);
    });
    const createdById = group.createdBy?._id || group.createdBy;
    const userId = req.user._id || req.user.id;
    const isAdmin = String(createdById) === String(userId);

    if (!isMember) {
      return res.status(403).json({ message: 'You must be a member of this group to raise disputes' });
    }
    if (isAdmin) {
      return res.status(403).json({ message: 'Admins cannot raise disputes. Please use the admin panel.' });
    }

    const dispute = new Dispute({
      group: groupId,
      raisedBy: req.user._id,
      subject: subject.trim(),
      messages: [{
        from: req.user._id,
        message: message.trim()
      }]
    });

    await dispute.save();
    await dispute.populate('raisedBy', 'name email');
    await dispute.populate('group', 'name');

    res.status(201).json({ dispute });
  } catch (err) {
    console.error('Create dispute error:', err);
    res.status(500).json({ message: 'Failed to create dispute' });
  }
});

// Get disputes for a group (all members can see all disputes)
router.get('/group/:groupId', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const createdById = group.createdBy?._id || group.createdBy;
    const userId = req.user._id || req.user.id;
    const isAdmin = String(createdById) === String(userId);
    const isMember = group.members?.some(m => {
      const mid = m.user?._id || m.user;
      return String(mid) === String(userId);
    });

    if (!isAdmin && !isMember) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    // All members (including admin) can see all disputes in the group
    const disputes = await Dispute.find({ group: req.params.groupId })
      .populate('raisedBy', 'name email')
      .populate('messages.from', 'name email')
      .sort({ createdAt: -1 });

    res.json({ disputes });
  } catch (err) {
    console.error('Get disputes error:', err);
    res.status(500).json({ message: 'Failed to fetch disputes' });
  }
});

// Add message to dispute (admin can reply to any, member can only reply to their own)
router.post('/:id/message', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const dispute = await Dispute.findById(req.params.id)
      .populate('group', 'createdBy');
    
    if (!dispute) return res.status(404).json({ message: 'Dispute not found' });

    if (dispute.status === 'resolved') {
      return res.status(400).json({ message: 'Cannot add messages to resolved disputes' });
    }

    const createdById = dispute.group.createdBy?._id || dispute.group.createdBy;
    const userId = req.user._id || req.user.id;
    const isAdmin = String(createdById) === String(userId);
    const isRaisedBy = String(dispute.raisedBy) === String(userId);

    if (!isAdmin && !isRaisedBy) {
      return res.status(403).json({ message: 'You can only reply to your own disputes or as admin' });
    }

    dispute.messages.push({
      from: req.user._id,
      message: message.trim()
    });
    dispute.updatedAt = new Date();

    await dispute.save();
    await dispute.populate('messages.from', 'name email');
    await dispute.populate('raisedBy', 'name email');

    res.json({ dispute });
  } catch (err) {
    console.error('Add message error:', err);
    res.status(500).json({ message: 'Failed to add message' });
  }
});

// Resolve dispute (admin only)
router.patch('/:id/resolve', auth, async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id)
      .populate('group', 'createdBy');
    
    if (!dispute) return res.status(404).json({ message: 'Dispute not found' });

    const createdById = dispute.group.createdBy?._id || dispute.group.createdBy;
    const userId = req.user._id || req.user.id;
    const isAdmin = String(createdById) === String(userId);
    
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can resolve disputes' });
    }

    dispute.status = 'resolved';
    dispute.updatedAt = new Date();
    await dispute.save();
    await dispute.populate('raisedBy', 'name email');
    await dispute.populate('messages.from', 'name email');

    res.json({ dispute });
  } catch (err) {
    console.error('Resolve dispute error:', err);
    res.status(500).json({ message: 'Failed to resolve dispute' });
  }
});

module.exports = router;

