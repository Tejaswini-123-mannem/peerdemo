const mongoose = require('mongoose');

const PaymentRecord = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidAt: { type: Date },
  proofUrl: { type: String },
  amount: { type: Number, default: 0 },
  penaltyAmount: { type: Number, default: 0 },
  penaltyDays: { type: Number, default: 0 },
  status: { type: String, enum: ['pending','paid','late','rejected'], default: 'pending' }
});

const CycleSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  monthIndex: { type: Number, required: true }, // 0..n-1
  dueDate: { type: Date },
  payments: [PaymentRecord],
  payoutRecipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  payoutExecuted: { type: Boolean, default: false },
  payoutProof: { type: String },
  notes: { type: String, default: '' }
});

module.exports = mongoose.model('Cycle', CycleSchema);
