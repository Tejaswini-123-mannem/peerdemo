const mongoose = require('mongoose');

const MemberSub = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  joinedAt: { type: Date, default: Date.now },
  payoutAccount: { type: String },
  isActive: { type: Boolean, default: true },
  invitedEmail: { type: String },
  turnPosition: { type: Number },
  isLocked: { type: Boolean, default: false }
});

const PlannedMemberSub = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true },
  position: { type: Number, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  currency: { type: String, default: 'INR' },
  monthlyContribution: { type: Number, required: true },
  groupSize: { type: Number, required: true },
  startMonth: { type: Date, required: true },
  paymentWindow: { type: String, default: '1-7' },
  penaltyRules: { type: String, default: '' },
  turnOrderPolicy: { type: String, default: 'fixed' },
  gracePeriodDays: { type: Number, default: 0, min: 0, max: 5 },
  members: [MemberSub],
  plannedMembers: { type: [PlannedMemberSub], default: [] },
  settings: {
    autoReminders: { type: Boolean, default: true },
    replacementPolicy: { type: Boolean, default: false },
    lateFeeEnabled: { type: Boolean, default: true }
  },
  ledgerGenerated: { type: Boolean, default: false },
  ledgerUrl: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date }
});

module.exports = mongoose.model('Group', GroupSchema);
