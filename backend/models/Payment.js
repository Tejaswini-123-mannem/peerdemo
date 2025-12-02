const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'Cycle' },
  amount: { type: Number },
  proofUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', PaymentSchema);
