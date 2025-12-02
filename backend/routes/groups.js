const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Group = require('../models/Group');
const Cycle = require('../models/Cycle');
const User = require('../models/User');
const Invitation = require('../models/Invitation');

// create group
router.post('/', auth, async (req, res) => {
  try {
    // Only organizers can create groups
    if (req.user.role !== 'organizer') {
      return res.status(403).json({ message: 'Only organizers can create groups' });
    }
    const {
      name,
      monthlyContribution,
      groupSize,
      startMonth,
      paymentWindow,
      turnOrderPolicy,
      currency,
      gracePeriodDays,
      initialMembers
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }
    if (name.trim().length < 3) {
      return res.status(400).json({ message: 'Group name must be at least 3 characters' });
    }
    if (!monthlyContribution || isNaN(monthlyContribution) || monthlyContribution < 100) {
      return res.status(400).json({ message: 'Monthly contribution must be at least 100' });
    }
    if (!Array.isArray(initialMembers) || initialMembers.length === 0) {
      return res.status(400).json({ message: 'Add at least one member before creating the group' });
    }

    const normalizedMembers = [];
    const emailSet = new Set();
    for (let i = 0; i < initialMembers.length; i++) {
      const entry = initialMembers[i] || {};
      const email = String(entry.email || '').trim().toLowerCase();
      const name = String(entry.name || '').trim();
      const requestedPosition = entry.position !== undefined && entry.position !== null
        ? Number(entry.position)
        : null;

      if (!email) {
        return res.status(400).json({ message: `Member #${i + 1} is missing an email` });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: `Member email "${entry.email}" is invalid` });
      }
      if (emailSet.has(email)) {
        return res.status(400).json({ message: `Duplicate member email "${entry.email}"` });
      }
      emailSet.add(email);

      normalizedMembers.push({
        rawIndex: i,
        email,
        name,
        requestedPosition: isNaN(requestedPosition) ? null : requestedPosition
      });
    }

    if (normalizedMembers.length < 2) {
      return res.status(400).json({ message: 'At least 2 members are required to form a group' });
    }

    if (!groupSize || isNaN(groupSize) || Number(groupSize) !== normalizedMembers.length) {
      return res.status(400).json({ message: 'Group size must match the number of members added' });
    }
    if (normalizedMembers.length > 50) {
      return res.status(400).json({ message: 'Group size cannot exceed 50 members' });
    }
    const numericGrace = Number(gracePeriodDays || 0);
    if (isNaN(numericGrace) || numericGrace < 0 || numericGrace > 5) {
      return res.status(400).json({ message: 'Grace period must be between 0 and 5 days' });
    }
    if (!startMonth) {
      return res.status(400).json({ message: 'Start month is required' });
    }

    const startDate = new Date(startMonth);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: 'Invalid start date' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
      return res.status(400).json({ message: 'Start month cannot be in the past' });
    }

    // Validate turn order policy
    const allowedPolicies = ['fixed', 'randomized', 'admin_approval'];
    const policy = turnOrderPolicy && allowedPolicies.includes(turnOrderPolicy) ? turnOrderPolicy : 'fixed';

    const assignPositions = () => {
      if (policy === 'randomized') {
        for (let i = normalizedMembers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = normalizedMembers[i];
          normalizedMembers[i] = normalizedMembers[j];
          normalizedMembers[j] = tmp;
        }
        return normalizedMembers.map((m, idx) => ({ ...m, position: idx + 1 }));
      }

      const withPositions = normalizedMembers
        .map((m, idx) => ({
          ...m,
          position: m.requestedPosition && m.requestedPosition > 0 ? m.requestedPosition : idx + 1
        }))
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      return withPositions.map((m, idx) => ({
        ...m,
        position: idx + 1
      }));
    };

    const orderedMembers = assignPositions().map(m => ({
      name: m.name,
      email: m.email,
      position: m.position
    }));

    const group = new Group({
      name: name.trim(),
      monthlyContribution: Number(monthlyContribution),
      groupSize: Number(groupSize),
      startMonth: startDate,
      paymentWindow: paymentWindow || '1-7',
      turnOrderPolicy: policy,
      currency: currency || 'INR',
      createdBy: req.user._id,
      gracePeriodDays: numericGrace,
      plannedMembers: orderedMembers
    });
    await group.save();

    // generate cycles equal to groupSize - cycles start from first day of the month
    for (let i = 0; i < group.groupSize; i++) {
      const due = new Date(group.startMonth);
      due.setMonth(due.getMonth() + i);
      due.setDate(1); // First day of the month
      const cycle = new Cycle({
        group: group._id,
        monthIndex: i,
        dueDate: due
      });
      await cycle.save();
    }

    if (orderedMembers.length > 0) {
      await Invitation.insertMany(
        orderedMembers.map(member => ({
          group: group._id,
          email: member.email,
          invitedBy: req.user._id,
          turnPosition: member.position
        }))
      );
    }

    res.status(201).json({ group });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ message: 'Failed to create group. Please try again.' });
  }
});

// list groups for user (created or member) - show closed groups for organizer
router.get('/', auth, async (req, res) => {
  try {
    // For organizers, show all groups (including closed ones) they created
    // For members, only show non-closed groups they're part of
    const groups = await Group.find({
      $or: [
        { createdBy: req.user._id },  // Organizer can see all their groups (including closed)
        { 
          'members.user': req.user._id,
          closedAt: null  // Members only see non-closed groups
        }
      ]
    })
    .populate('members.user', 'name email')
    .lean();
    
    // Get cycles for each group to calculate streaks
    const groupsWithStreaks = await Promise.all(groups.map(async (group) => {
      let cycles = await Cycle.find({ group: group._id })
        .populate('payments.member', 'name email')
        .lean();

      // Ensure all cycles exist (same logic as group detail)
      if (cycles.length < (group.groupSize || 0)) {
        const existingMonthIndices = new Set(cycles.map(c => c.monthIndex));
        for (let i = 0; i < (group.groupSize || 0); i++) {
          if (!existingMonthIndices.has(i)) {
            const due = new Date(group.startMonth);
            due.setMonth(due.getMonth() + i);
            due.setDate(1);
            const newCycle = new Cycle({
              group: group._id,
              monthIndex: i,
              dueDate: due
            });
            await newCycle.save();
          }
        }
        cycles = await Cycle.find({ group: group._id })
          .populate('payments.member', 'name email')
          .lean()
          .sort({ monthIndex: 1 });
      } else {
        cycles.sort((a, b) => (a.monthIndex || 0) - (b.monthIndex || 0));
      }
      
      
      // Calculate streaks for each member
      const memberStreaks = {};
      if (group.members && cycles.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        group.members.forEach(member => {
          const memberId = member.user?._id?.toString() || member.user?.toString();
          if (!memberId) return;
          
          // Get all cycles and check payment status
          const cyclePayments = cycles.map(c => {
            const payment = (c.payments || []).find(p => {
              const pid = p.member?._id?.toString() || p.member?.toString();
              return String(pid) === String(memberId) && p.status === 'paid';
            });
            const dueDate = c.dueDate ? new Date(c.dueDate) : null;
            if (dueDate) dueDate.setHours(0, 0, 0, 0);
            const cycleHasPassed = !dueDate || dueDate <= today;
            const paidCorrectly = payment && 
                                 payment.status === 'paid' && 
                                 (payment.penaltyDays || 0) === 0 && 
                                 (payment.penaltyAmount || 0) === 0;
            const shouldCount = cycleHasPassed || Boolean(payment);
            return { monthIndex: c.monthIndex || 0, paidCorrectly, shouldCount };
          });
          
          // Calculate current streak (from most recent backwards)
          let currentStreak = 0;
          for (let i = cyclePayments.length - 1; i >= 0; i--) {
            const cp = cyclePayments[i];
            if (!cp.shouldCount) continue;
            if (cp.paidCorrectly) {
              currentStreak++;
            } else {
              break;
            }
          }
          
          memberStreaks[memberId] = currentStreak;
        });
      }
      
      return {
        ...group,
        memberStreaks
      };
    }));
    
    res.json({ groups: groupsWithStreaks });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// get group detail - allow access to closed groups for organizer (to download ledger)
router.get('/:id', auth, async (req, res) => {
  try {
    let group = await Group.findById(req.params.id)
      .populate('members.user','name email contactNumber upiId emergencyContactName emergencyContactNumber')
      .populate('plannedMembers.user','name email')
      .populate('createdBy','name email contactNumber upiId emergencyContactName emergencyContactNumber');
    
    // Convert to plain object but preserve subdocument _id fields
    group = group.toObject({ virtuals: true });
    if (!group) return res.status(404).json({ message: 'Group not found' });
    
    // Allow organizer to access closed groups (for ledger download)
    // Prevent members from accessing closed groups
    const isOrganizer = group.createdBy?._id?.toString() === req.user._id.toString() || 
                        group.createdBy?.toString() === req.user._id.toString();
    if (group.closedAt !== null && group.closedAt !== undefined && !isOrganizer) {
      return res.status(403).json({ message: 'This group has been closed and is no longer accessible' });
    }
    
    // If createdBy is not populated (still an ObjectId), fetch it separately
    if (group.createdBy && typeof group.createdBy === 'string') {
      const creator = await User.findById(group.createdBy).select('name email contactNumber upiId emergencyContactName emergencyContactNumber').lean();
      if (creator) {
        group.createdBy = creator;
      }
    }
    
    // Get all cycles for the group, sorted by monthIndex
    // Ensure all cycles exist (create missing ones if needed)
    let cycles = await Cycle.find({ group: group._id })
      .populate('payments.member','name email')
      .populate('payoutRecipient', 'name email')
      .lean();
    
    // Sort cycles by monthIndex
    cycles.sort((a, b) => a.monthIndex - b.monthIndex);
    
    // If cycles are missing, create them
    if (cycles.length < group.groupSize) {
      const existingMonthIndices = new Set(cycles.map(c => c.monthIndex));
      for (let i = 0; i < group.groupSize; i++) {
        if (!existingMonthIndices.has(i)) {
          const due = new Date(group.startMonth);
          due.setMonth(due.getMonth() + i);
          due.setDate(1);
          const newCycle = new Cycle({
            group: group._id,
            monthIndex: i,
            dueDate: due
          });
          await newCycle.save();
        }
      }
      // Reload cycles after creating missing ones
      cycles = await Cycle.find({ group: group._id })
        .populate('payments.member','name email')
        .populate('payoutRecipient', 'name email')
        .lean()
        .sort({ monthIndex: 1 });
    }
    
    // Calculate which members should be lockable (haven't paid for 2 consecutive months)
    const memberLockStatus = {};
    if (cycles.length >= 2) {
      // Sort cycles by monthIndex
      const sortedCycles = [...cycles].sort((a, b) => a.monthIndex - b.monthIndex);
      
      group.members.forEach(member => {
        const memberId = member.user?._id?.toString() || member.user?.toString();
        if (!memberId) return;
        
        // Check last 2 cycles (most recent first)
        const recentCycles = sortedCycles.slice(-2);
        let consecutiveMissed = 0;
        
        for (let i = recentCycles.length - 1; i >= 0; i--) {
          const cycle = recentCycles[i];
          const payment = cycle.payments?.find(p => {
            const pid = p.member?._id?.toString() || p.member?.toString();
            return pid === memberId && p.status === 'paid';
          });
          
          if (!payment || payment.status !== 'paid') {
            consecutiveMissed++;
          } else {
            break; // Found a paid cycle, reset count
          }
        }
        
        // Member should be lockable if they missed 2 consecutive months
        memberLockStatus[memberId] = {
          shouldBeLockable: consecutiveMissed >= 2,
          consecutiveMissed
        };
      });
    }
    
    const invitations = await Invitation.find({ group: group._id }).lean();
    res.json({ group, cycles, invitations, memberLockStatus });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// join group (simple member join)
router.post('/:id/join', auth, async (req, res) => {
  try {
    // Organizers cannot be members
    if (req.user.role === 'organizer') {
      return res.status(403).json({ message: 'Organizers cannot join groups as members' });
    }
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    
    // Prevent joining closed groups
    if (group.closedAt) {
      return res.status(403).json({ message: 'This group has been closed and is no longer accepting new members' });
    }

    // Check if group is full
    if (group.members.length >= group.groupSize) {
      return res.status(400).json({ message: 'Group is full. Cannot join.' });
    }

    // Prevent duplicates
    if (group.members.some(m => m.user.toString() === req.user._id.toString())) {
      return res.status(400).json({ message: 'You are already a member of this group' });
    }

    // Validate payout account
    if (!req.body.payoutAccount || !req.body.payoutAccount.trim()) {
      return res.status(400).json({ message: 'Payout account details are required' });
    }

    const assignedPositions = new Set(
      (group.members || [])
        .map(m => typeof m.turnPosition === 'number' ? m.turnPosition : null)
        .filter(pos => pos !== null)
    );
    const normalizedEmail = String(req.user.email || '').trim().toLowerCase();
    let turnPosition = null;

    if (Array.isArray(group.plannedMembers) && group.plannedMembers.length > 0) {
      const emailMatch = normalizedEmail
        ? group.plannedMembers.find(pm => (pm.email || '').toLowerCase() === normalizedEmail)
        : null;
      if (emailMatch && typeof emailMatch.position === 'number') {
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
      payoutAccount: req.body.payoutAccount.trim(),
      invitedEmail: normalizedEmail || undefined,
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

    res.status(201).json({ message: 'Successfully joined the group', group });
  } catch (err) {
    console.error('Join group error:', err);
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid group ID' });
    }
    res.status(500).json({ message: 'Failed to join group. Please try again.' });
  }
});

// update group settings (admin only)
router.patch('/:id/settings', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the organizer can update group settings' });
    }
    if (req.body.settings) {
      if (typeof req.body.settings.autoReminders === 'boolean') {
        group.settings.autoReminders = req.body.settings.autoReminders;
      }
      if (typeof req.body.settings.replacementPolicy === 'boolean') {
        group.settings.replacementPolicy = req.body.settings.replacementPolicy;
      }
      if (typeof req.body.settings.lateFeeEnabled === 'boolean') {
        group.settings.lateFeeEnabled = req.body.settings.lateFeeEnabled;
      }
    }
    await group.save();
    res.json({ message: 'Settings updated successfully', group });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

// lock/unlock a member (admin only)
router.patch('/:id/members/:memberId/lock', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the organizer can lock/unlock members' });
    }
    
    const memberId = req.params.memberId;
    const member = group.members.id(memberId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }
    
    const isLocked = req.body.isLocked === true;
    member.isLocked = isLocked;
    await group.save();
    
    res.json({ 
      message: `Member ${isLocked ? 'locked' : 'unlocked'} successfully`, 
      group 
    });
  } catch (err) {
    console.error('Lock/unlock member error:', err);
    res.status(500).json({ message: 'Failed to lock/unlock member' });
  }
});

// close group (organizer only; only when all cycles completed/payouts executed)
router.post('/:id/close', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the organizer can close this group' });
    }
    // ensure all cycles exist and payouts executed
    const cycles = await Cycle.find({ group: group._id })
      .populate('payments.member', 'name email')
      .populate('payoutRecipient', 'name email')
      .lean();
    if (!cycles || cycles.length < group.groupSize) {
      return res.status(400).json({ message: 'All cycles must exist before closing the group' });
    }
    const anyNotExecuted = cycles.some(c => !c.payoutExecuted);
    if (anyNotExecuted) {
      return res.status(400).json({ message: 'All payouts must be executed before closing the group' });
    }
    
    // Get all members with their payments (calculate before generating ledger)
    const memberStats = {};
    
    // Collect all members and their payment statistics
    cycles.forEach(cycle => {
      cycle.payments?.forEach(payment => {
        if (payment.member && payment.status === 'paid') {
          const memberId = payment.member._id?.toString() || payment.member.toString();
          if (!memberStats[memberId]) {
            memberStats[memberId] = {
              name: payment.member.name || 'Unknown',
              email: payment.member.email || '',
              payments: [],
              totalLateDays: 0,
              totalPenalties: 0,
              onTimePayments: 0,
              latePayments: 0
            };
          }
          const penaltyDays = payment.penaltyDays || 0;
          const penaltyAmount = payment.penaltyAmount || 0;
          memberStats[memberId].payments.push({
            cycle: cycle.monthIndex + 1,
            dueDate: cycle.dueDate,
            paidAt: payment.paidAt,
            amount: payment.amount,
            penaltyDays,
            penaltyAmount,
            status: payment.status
          });
          memberStats[memberId].totalLateDays += penaltyDays;
          memberStats[memberId].totalPenalties += penaltyAmount;
          if (penaltyDays === 0 && penaltyAmount === 0) {
            memberStats[memberId].onTimePayments++;
          } else {
            memberStats[memberId].latePayments++;
          }
        }
      });
    });
    
    // Generate text-formatted ledger
    const generateTextLedger = () => {
      const lines = [];
      const separator = '='.repeat(80);
      const lineSeparator = '-'.repeat(80);
      
      // Header
      lines.push(separator);
      lines.push('GROUP LEDGER REPORT');
      lines.push(separator);
      lines.push('');
      lines.push(`Group Name: ${group.name}`);
      lines.push(`Currency: ${group.currency}`);
      lines.push(`Monthly Contribution: ${group.currency} ${group.monthlyContribution}`);
      lines.push(`Number of Members: ${group.groupSize}`);
      lines.push(`Start Month: ${new Date(group.startMonth).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      lines.push(`Closed Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      lines.push('');
      lines.push(separator);
      lines.push('');
      
      // PAYMENT CYCLES TABLE
      lines.push('PAYMENT CYCLES');
      lines.push(lineSeparator);
      lines.push('');
      cycles.sort((a, b) => a.monthIndex - b.monthIndex).forEach((cycle, idx) => {
        lines.push(`Month ${cycle.monthIndex + 1}:`);
        lines.push(`  Due Date: ${new Date(cycle.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
        if (cycle.payoutRecipient) {
          lines.push(`  Payout Recipient: ${cycle.payoutRecipient.name} (${cycle.payoutRecipient.email})`);
          lines.push(`  Payout Status: ${cycle.payoutExecuted ? 'EXECUTED' : 'PENDING'}`);
          if (cycle.payoutProof) {
            lines.push(`  Payout Proof: ${cycle.payoutProof}`);
          }
        }
        lines.push('');
        lines.push('  Payments:');
        lines.push('  ' + 'Member'.padEnd(20) + 'Amount'.padEnd(15) + 'Paid Date'.padEnd(20) + 'Late Days'.padEnd(12) + 'Penalty');
        lines.push('  ' + '-'.repeat(80));
        cycle.payments?.forEach(payment => {
          if (payment.member && payment.status === 'paid') {
            const memberName = (payment.member.name || 'Unknown').padEnd(20);
            const amount = `${group.currency} ${payment.amount}`.padEnd(15);
            const paidDate = payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
            const paidDateStr = paidDate.padEnd(20);
            const lateDays = (payment.penaltyDays || 0).toString().padEnd(12);
            const penalty = payment.penaltyAmount > 0 ? `${group.currency} ${payment.penaltyAmount.toFixed(2)}` : '—';
            lines.push('  ' + memberName + amount + paidDateStr + lateDays + penalty);
          }
        });
        lines.push('');
      });
      
      lines.push(separator);
      lines.push('');
      
      // MEMBER PERFORMANCE TABLE
      lines.push('MEMBER PERFORMANCE SUMMARY');
      lines.push(lineSeparator);
      lines.push('');
      lines.push('Member'.padEnd(25) + 'Total Payments'.padEnd(18) + 'On-Time'.padEnd(12) + 'Late'.padEnd(12) + 'Total Late Days'.padEnd(18) + 'Total Penalties');
      lines.push('-'.repeat(100));
      
      const membersArray = Object.values(memberStats).sort((a, b) => a.name.localeCompare(b.name));
      membersArray.forEach(member => {
        const totalPayments = member.payments.length;
        const name = (member.name.length > 24 ? member.name.substring(0, 21) + '...' : member.name).padEnd(25);
        const totalPay = totalPayments.toString().padEnd(18);
        const onTime = member.onTimePayments.toString().padEnd(12);
        const late = member.latePayments.toString().padEnd(12);
        const lateDays = member.totalLateDays.toString().padEnd(18);
        const penalties = member.totalPenalties > 0 ? `${group.currency} ${member.totalPenalties.toFixed(2)}` : '—';
        lines.push(name + totalPay + onTime + late + lateDays + penalties);
      });
      
      lines.push('');
      lines.push(separator);
      lines.push('');
      
      // DETAILED PAYMENT HISTORY BY MEMBER
      lines.push('DETAILED PAYMENT HISTORY BY MEMBER');
      lines.push(lineSeparator);
      lines.push('');
      
      membersArray.forEach(member => {
        lines.push(`${member.name} (${member.email})`);
        lines.push('-'.repeat(80));
        lines.push('Cycle'.padEnd(10) + 'Due Date'.padEnd(20) + 'Paid Date'.padEnd(20) + 'Amount'.padEnd(15) + 'Late Days'.padEnd(12) + 'Penalty');
        lines.push('-'.repeat(80));
        member.payments.forEach(payment => {
          const cycle = `Month ${payment.cycle}`.padEnd(10);
          const dueDate = new Date(payment.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).padEnd(20);
          const paidDate = payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
          const paidDateStr = paidDate.padEnd(20);
          const amount = `${group.currency} ${payment.amount}`.padEnd(15);
          const lateDays = (payment.penaltyDays || 0).toString().padEnd(12);
          const penalty = payment.penaltyAmount > 0 ? `${group.currency} ${payment.penaltyAmount.toFixed(2)}` : '—';
          lines.push(cycle + dueDate + paidDateStr + amount + lateDays + penalty);
        });
        lines.push('');
        lines.push(`  Total Payments: ${member.payments.length}`);
        lines.push(`  On-Time Payments: ${member.onTimePayments}`);
        lines.push(`  Late Payments: ${member.latePayments}`);
        lines.push(`  Total Late Days: ${member.totalLateDays}`);
        lines.push(`  Total Penalties: ${group.currency} ${member.totalPenalties.toFixed(2)}`);
        lines.push('');
      });
      
      lines.push(separator);
      lines.push('');
      
      // PAYOUT INFORMATION
      lines.push('PAYOUT INFORMATION');
      lines.push(lineSeparator);
      lines.push('');
      lines.push('Cycle'.padEnd(10) + 'Due Date'.padEnd(20) + 'Recipient'.padEnd(30) + 'Status'.padEnd(15) + 'Proof');
      lines.push('-'.repeat(100));
      cycles.sort((a, b) => a.monthIndex - b.monthIndex).forEach(cycle => {
        const cycleNum = `Month ${cycle.monthIndex + 1}`.padEnd(10);
        const dueDate = new Date(cycle.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).padEnd(20);
        const recipient = cycle.payoutRecipient ? `${cycle.payoutRecipient.name} (${cycle.payoutRecipient.email})` : 'Not assigned';
        const recipientStr = (recipient.length > 29 ? recipient.substring(0, 26) + '...' : recipient).padEnd(30);
        const status = (cycle.payoutExecuted ? 'EXECUTED' : 'PENDING').padEnd(15);
        const proof = cycle.payoutProof || '—';
        lines.push(cycleNum + dueDate + recipientStr + status + proof);
      });
      
      lines.push('');
      lines.push(separator);
      lines.push('');
      lines.push('END OF LEDGER REPORT');
      lines.push(separator);
      
      return lines.join('\n');
    };
    
    const ledgerText = generateTextLedger();
    
    // Also keep JSON data for API response
    const ledgerData = {
      groupName: group.name,
      currency: group.currency,
      monthlyContribution: group.monthlyContribution,
      groupSize: group.groupSize,
      startMonth: group.startMonth,
      closedAt: new Date(),
      cycles: cycles.map(c => ({
        monthIndex: c.monthIndex,
        dueDate: c.dueDate,
        payoutRecipient: c.payoutRecipient ? {
          name: c.payoutRecipient.name || 'Unknown',
          email: c.payoutRecipient.email || ''
        } : null,
        payoutExecuted: c.payoutExecuted,
        payoutProof: c.payoutProof,
        payments: (c.payments || []).map(p => ({
          member: p.member ? {
            name: p.member.name || 'Unknown',
            email: p.member.email || ''
          } : null,
          amount: p.amount,
          penaltyAmount: p.penaltyAmount || 0,
          penaltyDays: p.penaltyDays || 0,
          status: p.status,
          paidAt: p.paidAt,
          proofUrl: p.proofUrl
        }))
      })),
      memberStats: Object.values(memberStats).map(m => ({
        name: m.name,
        email: m.email,
        totalPayments: m.payments.length,
        onTimePayments: m.onTimePayments,
        latePayments: m.latePayments,
        totalLateDays: m.totalLateDays,
        totalPenalties: m.totalPenalties
      }))
    };
    
    group.closedAt = new Date();
    group.ledgerGenerated = true;
    group.ledgerUrl = `/ledgers/${group._id}-${Date.now()}.txt`;
    await group.save();
    
    // Return both text and JSON
    res.json({ 
      message: 'Group closed successfully and ledger generated', 
      group,
      ledger: ledgerData,
      ledgerText: ledgerText
    });
  } catch (err) {
    console.error('Close group error:', err);
    res.status(500).json({ message: 'Failed to close group' });
  }
});

// get group ledger for closed groups (organizer only)
router.get('/:id/ledger', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the organizer can download the ledger' });
    }
    if (!group.closedAt) {
      return res.status(400).json({ message: 'Group must be closed before downloading the ledger' });
    }
    
    // Get all cycles
    const cycles = await Cycle.find({ group: group._id })
      .populate('payments.member', 'name email')
      .populate('payoutRecipient', 'name email')
      .lean();
    
    // Calculate member stats (same logic as close endpoint)
    const memberStats = {};
    cycles.forEach(cycle => {
      cycle.payments?.forEach(payment => {
        if (payment.member && payment.status === 'paid') {
          const memberId = payment.member._id?.toString() || payment.member.toString();
          if (!memberStats[memberId]) {
            memberStats[memberId] = {
              name: payment.member.name || 'Unknown',
              email: payment.member.email || '',
              payments: [],
              totalLateDays: 0,
              totalPenalties: 0,
              onTimePayments: 0,
              latePayments: 0
            };
          }
          const penaltyDays = payment.penaltyDays || 0;
          const penaltyAmount = payment.penaltyAmount || 0;
          memberStats[memberId].payments.push({
            cycle: cycle.monthIndex + 1,
            dueDate: cycle.dueDate,
            paidAt: payment.paidAt,
            amount: payment.amount,
            penaltyDays,
            penaltyAmount,
            status: payment.status
          });
          memberStats[memberId].totalLateDays += penaltyDays;
          memberStats[memberId].totalPenalties += penaltyAmount;
          if (penaltyDays === 0 && penaltyAmount === 0) {
            memberStats[memberId].onTimePayments++;
          } else {
            memberStats[memberId].latePayments++;
          }
        }
      });
    });
    
    // Generate text-formatted ledger (same as close endpoint)
    const separator = '='.repeat(80);
    const lineSeparator = '-'.repeat(80);
    const lines = [];
    
    lines.push(separator);
    lines.push('GROUP LEDGER REPORT');
    lines.push(separator);
    lines.push('');
    lines.push(`Group Name: ${group.name}`);
    lines.push(`Currency: ${group.currency}`);
    lines.push(`Monthly Contribution: ${group.currency} ${group.monthlyContribution}`);
    lines.push(`Number of Members: ${group.groupSize}`);
    lines.push(`Start Month: ${new Date(group.startMonth).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    lines.push(`Closed Date: ${new Date(group.closedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    lines.push('');
    lines.push(separator);
    lines.push('');
    
    // PAYMENT CYCLES TABLE
    lines.push('PAYMENT CYCLES');
    lines.push(lineSeparator);
    lines.push('');
    cycles.sort((a, b) => a.monthIndex - b.monthIndex).forEach((cycle) => {
      lines.push(`Month ${cycle.monthIndex + 1}:`);
      lines.push(`  Due Date: ${new Date(cycle.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      if (cycle.payoutRecipient) {
        lines.push(`  Payout Recipient: ${cycle.payoutRecipient.name} (${cycle.payoutRecipient.email})`);
        lines.push(`  Payout Status: ${cycle.payoutExecuted ? 'EXECUTED' : 'PENDING'}`);
        if (cycle.payoutProof) {
          lines.push(`  Payout Proof: ${cycle.payoutProof}`);
        }
      }
      lines.push('');
      lines.push('  Payments:');
      lines.push('  ' + 'Member'.padEnd(20) + 'Amount'.padEnd(15) + 'Paid Date'.padEnd(20) + 'Late Days'.padEnd(12) + 'Penalty');
      lines.push('  ' + '-'.repeat(80));
      cycle.payments?.forEach(payment => {
        if (payment.member && payment.status === 'paid') {
          const memberName = (payment.member.name || 'Unknown').padEnd(20);
          const amount = `${group.currency} ${payment.amount}`.padEnd(15);
          const paidDate = payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
          const paidDateStr = paidDate.padEnd(20);
          const lateDays = (payment.penaltyDays || 0).toString().padEnd(12);
          const penalty = payment.penaltyAmount > 0 ? `${group.currency} ${payment.penaltyAmount.toFixed(2)}` : '—';
          lines.push('  ' + memberName + amount + paidDateStr + lateDays + penalty);
        }
      });
      lines.push('');
    });
    
    lines.push(separator);
    lines.push('');
    
    // MEMBER PERFORMANCE TABLE
    lines.push('MEMBER PERFORMANCE SUMMARY');
    lines.push(lineSeparator);
    lines.push('');
    lines.push('Member'.padEnd(25) + 'Total Payments'.padEnd(18) + 'On-Time'.padEnd(12) + 'Late'.padEnd(12) + 'Total Late Days'.padEnd(18) + 'Total Penalties');
    lines.push('-'.repeat(100));
    
    const membersArray = Object.values(memberStats).sort((a, b) => a.name.localeCompare(b.name));
    membersArray.forEach(member => {
      const totalPayments = member.payments.length;
      const name = (member.name.length > 24 ? member.name.substring(0, 21) + '...' : member.name).padEnd(25);
      const totalPay = totalPayments.toString().padEnd(18);
      const onTime = member.onTimePayments.toString().padEnd(12);
      const late = member.latePayments.toString().padEnd(12);
      const lateDays = member.totalLateDays.toString().padEnd(18);
      const penalties = member.totalPenalties > 0 ? `${group.currency} ${member.totalPenalties.toFixed(2)}` : '—';
      lines.push(name + totalPay + onTime + late + lateDays + penalties);
    });
    
    lines.push('');
    lines.push(separator);
    lines.push('');
    
    // DETAILED PAYMENT HISTORY BY MEMBER
    lines.push('DETAILED PAYMENT HISTORY BY MEMBER');
    lines.push(lineSeparator);
    lines.push('');
    
    membersArray.forEach(member => {
      lines.push(`${member.name} (${member.email})`);
      lines.push('-'.repeat(80));
      lines.push('Cycle'.padEnd(10) + 'Due Date'.padEnd(20) + 'Paid Date'.padEnd(20) + 'Amount'.padEnd(15) + 'Late Days'.padEnd(12) + 'Penalty');
      lines.push('-'.repeat(80));
      member.payments.forEach(payment => {
        const cycle = `Month ${payment.cycle}`.padEnd(10);
        const dueDate = new Date(payment.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).padEnd(20);
        const paidDate = payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
        const paidDateStr = paidDate.padEnd(20);
        const amount = `${group.currency} ${payment.amount}`.padEnd(15);
        const lateDays = (payment.penaltyDays || 0).toString().padEnd(12);
        const penalty = payment.penaltyAmount > 0 ? `${group.currency} ${payment.penaltyAmount.toFixed(2)}` : '—';
        lines.push(cycle + dueDate + paidDateStr + amount + lateDays + penalty);
      });
      lines.push('');
      lines.push(`  Total Payments: ${member.payments.length}`);
      lines.push(`  On-Time Payments: ${member.onTimePayments}`);
      lines.push(`  Late Payments: ${member.latePayments}`);
      lines.push(`  Total Late Days: ${member.totalLateDays}`);
      lines.push(`  Total Penalties: ${group.currency} ${member.totalPenalties.toFixed(2)}`);
      lines.push('');
    });
    
    lines.push(separator);
    lines.push('');
    
    // PAYOUT INFORMATION
    lines.push('PAYOUT INFORMATION');
    lines.push(lineSeparator);
    lines.push('');
    lines.push('Cycle'.padEnd(10) + 'Due Date'.padEnd(20) + 'Recipient'.padEnd(30) + 'Status'.padEnd(15) + 'Proof');
    lines.push('-'.repeat(100));
    cycles.sort((a, b) => a.monthIndex - b.monthIndex).forEach(cycle => {
      const cycleNum = `Month ${cycle.monthIndex + 1}`.padEnd(10);
      const dueDate = new Date(cycle.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).padEnd(20);
      const recipient = cycle.payoutRecipient ? `${cycle.payoutRecipient.name} (${cycle.payoutRecipient.email})` : 'Not assigned';
      const recipientStr = (recipient.length > 29 ? recipient.substring(0, 26) + '...' : recipient).padEnd(30);
      const status = (cycle.payoutExecuted ? 'EXECUTED' : 'PENDING').padEnd(15);
      const proof = cycle.payoutProof || '—';
      lines.push(cycleNum + dueDate + recipientStr + status + proof);
    });
    
    lines.push('');
    lines.push(separator);
    lines.push('');
    lines.push('END OF LEDGER REPORT');
    lines.push(separator);
    
    const ledgerText = lines.join('\n');
    
    res.json({ 
      message: 'Ledger retrieved successfully', 
      ledgerText: ledgerText
    });
  } catch (err) {
    console.error('Get ledger error:', err);
    res.status(500).json({ message: 'Failed to retrieve ledger' });
  }
});

// get member ledger (for individual member)
// Can be downloaded at any time during the cycle, not just after completion
router.get('/:id/member-ledger', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    
    // Allow access even for closed groups (members should be able to download their ledger)
    // Only prevent if group doesn't exist
    
    // Verify user is a member
    const isMember = group.members.some(m => m.user.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: 'You must be a member of this group to view your ledger' });
    }
    
    const cycles = await Cycle.find({ group: group._id })
      .populate('payments.member', 'name email')
      .populate('payoutRecipient', 'name email')
      .lean();
    
    // Get member's payment records (include all statuses, not just 'paid')
    // Also include cycles where member hasn't paid yet (for complete ledger)
    const memberPayments = [];
    let totalLateDays = 0;
    let totalPenalties = 0;
    let onTimePayments = 0;
    let latePayments = 0;
    let pendingPayments = 0;
    
    // Sort cycles by month index
    const sortedCycles = cycles.sort((a, b) => a.monthIndex - b.monthIndex);
    
    sortedCycles.forEach(cycle => {
      const payment = cycle.payments?.find(p => {
        const pid = p.member?._id?.toString() || p.member?.toString();
        return String(pid) === String(req.user._id);
      });
      
      if (payment) {
        const penaltyDays = payment.penaltyDays || 0;
        const penaltyAmount = payment.penaltyAmount || 0;
        
        memberPayments.push({
          cycle: cycle.monthIndex + 1,
          dueDate: cycle.dueDate,
          paidAt: payment.paidAt,
          amount: payment.amount,
          penaltyDays,
          penaltyAmount,
          status: payment.status,
          proofUrl: payment.proofUrl
        });
        
        // Only count paid payments in statistics
        if (payment.status === 'paid') {
          totalLateDays += penaltyDays;
          totalPenalties += penaltyAmount;
          if (penaltyDays === 0 && penaltyAmount === 0) {
            onTimePayments++;
          } else {
            latePayments++;
          }
        } else if (payment.status === 'pending') {
          pendingPayments++;
        }
      } else {
        // Include cycles where member hasn't paid yet (for complete ledger)
        memberPayments.push({
          cycle: cycle.monthIndex + 1,
          dueDate: cycle.dueDate,
          paidAt: null,
          amount: group.monthlyContribution,
          penaltyDays: 0,
          penaltyAmount: 0,
          status: 'not_paid',
          proofUrl: null
        });
      }
    });
    
    // Generate text-formatted member ledger
    const generateMemberLedger = () => {
      const lines = [];
      const separator = '='.repeat(80);
      const lineSeparator = '-'.repeat(80);
      
      // Header
      lines.push(separator);
      lines.push('MEMBER LEDGER REPORT');
      lines.push(separator);
      lines.push('');
      lines.push(`Group Name: ${group.name}`);
      lines.push(`Member Name: ${req.user.name || 'Unknown'}`);
      lines.push(`Member Email: ${req.user.email || 'Unknown'}`);
      lines.push(`Currency: ${group.currency}`);
      lines.push(`Monthly Contribution: ${group.currency} ${group.monthlyContribution}`);
      lines.push(`Generated Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      lines.push('');
      lines.push(separator);
      lines.push('');
      
      // Payment Summary
      lines.push('PAYMENT SUMMARY');
      lines.push(lineSeparator);
      lines.push('');
      lines.push(`Total Payment Records: ${memberPayments.length}`);
      lines.push(`Paid Payments: ${onTimePayments + latePayments}`);
      lines.push(`On-Time Payments: ${onTimePayments}`);
      lines.push(`Late Payments: ${latePayments}`);
      if (pendingPayments > 0) {
        lines.push(`Pending Payments: ${pendingPayments}`);
      }
      lines.push(`Total Late Days: ${totalLateDays}`);
      lines.push(`Total Penalties: ${group.currency} ${totalPenalties.toFixed(2)}`);
      lines.push('');
      lines.push(separator);
      lines.push('');
      
      // Payment History
      lines.push('PAYMENT HISTORY');
      lines.push(lineSeparator);
      lines.push('');
      
      if (memberPayments.length === 0) {
        lines.push('No payment records found.');
        lines.push('This may be because:');
        lines.push('  - No cycles have been created yet');
        lines.push('  - You have not made any payments');
        lines.push('');
      } else {
        lines.push('Cycle'.padEnd(10) + 'Due Date'.padEnd(20) + 'Status'.padEnd(12) + 'Paid Date'.padEnd(20) + 'Amount'.padEnd(15) + 'Late Days'.padEnd(12) + 'Penalty');
        lines.push('-'.repeat(100));
        
        memberPayments.forEach(payment => {
          const cycle = `Month ${payment.cycle}`.padEnd(10);
          const dueDate = payment.dueDate ? new Date(payment.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).padEnd(20) : 'N/A'.padEnd(20);
          const status = payment.status === 'not_paid' ? 'NOT PAID' : (payment.status || 'N/A').toUpperCase().padEnd(12);
          const paidDate = payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
          const paidDateStr = paidDate.padEnd(20);
          const amount = payment.amount ? `${group.currency} ${payment.amount}`.padEnd(15) : 'N/A'.padEnd(15);
          const lateDays = (payment.penaltyDays || 0).toString().padEnd(12);
          const penalty = payment.penaltyAmount > 0 ? `${group.currency} ${payment.penaltyAmount.toFixed(2)}` : '—';
          lines.push(cycle + dueDate + status + paidDateStr + amount + lateDays + penalty);
        });
      }
      
      lines.push('');
      lines.push(separator);
      lines.push('');
      
      // Payout Information (if member received any payouts)
      const receivedPayouts = cycles.filter(c => {
        const rid = c.payoutRecipient?._id?.toString() || c.payoutRecipient?.toString();
        return String(rid) === String(req.user._id);
      });
      
      if (receivedPayouts.length > 0) {
        lines.push('PAYOUTS RECEIVED');
        lines.push(lineSeparator);
        lines.push('');
        lines.push('Cycle'.padEnd(10) + 'Due Date'.padEnd(20) + 'Status'.padEnd(15) + 'Proof');
        lines.push('-'.repeat(80));
        receivedPayouts.forEach(cycle => {
          const cycleNum = `Month ${cycle.monthIndex + 1}`.padEnd(10);
          const dueDate = new Date(cycle.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).padEnd(20);
          const status = (cycle.payoutExecuted ? 'EXECUTED' : 'PENDING').padEnd(15);
          const proof = cycle.payoutProof || '—';
          lines.push(cycleNum + dueDate + status + proof);
        });
        lines.push('');
        lines.push(separator);
        lines.push('');
      }
      
      lines.push('END OF MEMBER LEDGER REPORT');
      lines.push(separator);
      
      return lines.join('\n');
    };
    
    const ledgerText = generateMemberLedger();
    
    res.json({ 
      ledgerText: ledgerText,
      summary: {
        totalPayments: memberPayments.length,
        onTimePayments,
        latePayments,
        totalLateDays,
        totalPenalties
      }
    });
  } catch (err) {
    console.error('Member ledger error:', err);
    res.status(500).json({ message: 'Failed to generate member ledger' });
  }
});

module.exports = router;
