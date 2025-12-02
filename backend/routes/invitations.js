const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Group = require('../models/Group');
const Invitation = require('../models/Invitation');

// Invite members by email (organizer only)
router.post('/groups/:id/invite', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only organizer can invite members' });
    }
    if (!Array.isArray(req.body.emails) || req.body.emails.length === 0) {
      return res.status(400).json({ message: 'Emails are required' });
    }
    const emails = req.body.emails
      .map(e => String(e).trim().toLowerCase())
      .filter(e => !!e);

    // Capacity check: remaining slots = groupSize - current members - pending invites
    const pendingCount = await Invitation.countDocuments({ group: group._id, status: 'pending' });
    const currentMembers = Array.isArray(group.members) ? group.members.length : 0;
    const remainingSlots = Math.max(0, (group.groupSize || 0) - currentMembers - pendingCount);
    if (remainingSlots <= 0) {
      return res.status(400).json({ message: 'Group is full or no remaining slots due to pending invites' });
    }

    const created = [];
    for (const email of emails) {
      if (created.length >= remainingSlots) break;

      // skip if an invitation already exists and is pending
      const existingPending = await Invitation.findOne({ group: group._id, email, status: 'pending' });
      if (existingPending) continue;

      // create invitation
      const inv = new Invitation({
        group: group._id,
        email,
        invitedBy: req.user._id
      });
      await inv.save();
      created.push(inv);
    }

    if (created.length === 0) {
      return res.status(400).json({ message: 'No invitations created. Check duplicates or capacity.' });
    }

    res.status(201).json({
      message: `Invitations created: ${created.length} ${created.length < emails.length ? '(limited by capacity)' : ''}`.trim(),
      invitations: created
    });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ message: 'Failed to send invites' });
  }
});

// List notifications (invitations) for current user
router.get('/notifications', auth, async (req, res) => {
  try {
    const email = req.user.email.toLowerCase();
    const invites = await Invitation.find({ email }).populate('group','name monthlyContribution groupSize').sort({ createdAt: -1 });

    // For organizers: pending payment submissions across their groups
    const Group = require('../models/Group');
    const Cycle = require('../models/Cycle');
    const ownedGroups = await Group.find({ createdBy: req.user._id }).select('_id name').lean();
    const groupIds = ownedGroups.map(g => g._id);
    let paymentSubmissions = [];
    if (groupIds.length > 0) {
      const cycles = await Cycle.find({ group: { $in: groupIds } })
        .populate('group','name')
        .populate('payments.member','name email')
        .lean();
      for (const c of cycles) {
        for (const p of (c.payments || [])) {
          if (p.status === 'pending') {
            paymentSubmissions.push({
              cycleId: c._id,
              groupId: c.group?._id || c.group,
              groupName: c.group?.name || '',
              monthIndex: c.monthIndex,
              member: p.member,
              paymentId: p._id,
              amount: p.amount,
              proofUrl: p.proofUrl,
              submittedAt: p.paidAt
            });
          }
        }
      }
      // Sort by submittedAt desc
      paymentSubmissions.sort((a,b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    }

    // For members: decisions (approved/rejected payments) on their submissions
    const myCycles = await Cycle.find({ 'payments.member': req.user._id })
      .populate('group','name')
      .lean();
    const myPaymentDecisions = [];
    for (const c of (myCycles || [])) {
      for (const p of (c.payments || [])) {
        if ((p.member?.toString?.() || String(p.member)) === req.user._id.toString()) {
          if (p.status === 'rejected' || p.status === 'paid') {
            myPaymentDecisions.push({
              cycleId: c._id,
              groupId: c.group?._id || c.group,
              groupName: c.group?.name || '',
              monthIndex: c.monthIndex,
              status: p.status,
              paymentId: p._id,
              amount: p.amount,
              proofUrl: p.proofUrl,
              decidedAt: p.paidAt
            });
          }
        }
      }
    }

    // For admins: new disputes in their groups
    const Dispute = require('../models/Dispute');
    let disputeNotifications = [];
    if (groupIds.length > 0) {
      const openDisputes = await Dispute.find({ 
        group: { $in: groupIds },
        status: 'open'
      })
        .populate('group', 'name')
        .populate('raisedBy', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      disputeNotifications = openDisputes.map(d => ({
        disputeId: d._id,
        groupId: d.group?._id || d.group,
        groupName: d.group?.name || '',
        raisedBy: d.raisedBy,
        subject: d.subject,
        createdAt: d.createdAt
      }));
    }

    // For members: admin replies to their disputes
    const myDisputes = await Dispute.find({ raisedBy: req.user._id })
      .populate('group', 'name')
      .populate('messages.from', 'name email')
      .sort({ updatedAt: -1 })
      .lean();
    const disputeReplies = [];
    for (const d of myDisputes) {
      if (d.messages && d.messages.length > 0) {
        const lastMessage = d.messages[d.messages.length - 1];
        const isAdminReply = String(d.group?.createdBy) === String(lastMessage.from?._id || lastMessage.from);
        if (isAdminReply) {
          disputeReplies.push({
            disputeId: d._id,
            groupId: d.group?._id || d.group,
            groupName: d.group?.name || '',
            subject: d.subject,
            message: lastMessage.message,
            from: lastMessage.from,
            createdAt: lastMessage.createdAt
          });
        }
      }
    }

    res.json({ 
      invitations: invites, 
      paymentSubmissions, 
      myPaymentDecisions,
      disputeNotifications,
      disputeReplies
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Accept invitation
router.post('/invitations/:id/accept', auth, async (req, res) => {
  try {
    const inv = await Invitation.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: 'Invitation not found' });
    if (inv.email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({ message: 'This invitation is not for your account' });
    }
    if (inv.status !== 'pending') {
      return res.status(400).json({ message: `Invitation already ${inv.status}` });
    }
    const group = await Group.findById(inv.group);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Enforce capacity on accept
    if ((group.members?.length || 0) >= (group.groupSize || 0)) {
      return res.status(400).json({ message: 'Group is full. Cannot accept invitation.' });
    }

    // Add as member if not already
    if (!group.members.some(m => m.user?.toString() === req.user._id.toString())) {
      const assignedPositions = new Set(
        (group.members || [])
          .map(m => typeof m.turnPosition === 'number' ? m.turnPosition : null)
          .filter(pos => pos !== null)
      );
      const normalizedEmail = String(req.user.email || '').trim().toLowerCase();
      let turnPosition = typeof inv.turnPosition === 'number' ? inv.turnPosition : null;

      if ((!turnPosition || assignedPositions.has(turnPosition)) && Array.isArray(group.plannedMembers)) {
        const emailMatch = normalizedEmail
          ? group.plannedMembers.find(pm => (pm.email || '').toLowerCase() === normalizedEmail)
          : null;
        if (emailMatch && typeof emailMatch.position === 'number' && !assignedPositions.has(emailMatch.position)) {
          turnPosition = emailMatch.position;
        } else {
          const unassigned = group.plannedMembers.find(pm => !assignedPositions.has(pm.position));
          if (unassigned) {
            turnPosition = unassigned.position;
          }
        }
      }

      if (!turnPosition || assignedPositions.has(turnPosition)) {
        turnPosition = (group.members?.length || 0) + 1;
      }

      group.members.push({
        user: req.user._id,
        payoutAccount: req.body.payoutAccount || '',
        invitedEmail: normalizedEmail || inv.email,
        turnPosition
      });

      if (Array.isArray(group.plannedMembers) && group.plannedMembers.length > 0) {
        const idx = group.plannedMembers.findIndex(pm => {
          if (typeof pm.position === 'number' && pm.position === turnPosition) return true;
          return normalizedEmail && (pm.email || '').toLowerCase() === normalizedEmail;
        });
        if (idx >= 0) {
          group.plannedMembers[idx].user = req.user._id;
          if (req.user.name) {
            group.plannedMembers[idx].name = req.user.name;
          }
          group.markModified('plannedMembers');
        }
      }

      await group.save();
    }
    inv.status = 'accepted';
    inv.respondedAt = new Date();
    await inv.save();
    res.json({ message: 'Invitation accepted', group, invitation: inv });
  } catch (err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ message: 'Failed to accept invitation' });
  }
});

module.exports = router;


