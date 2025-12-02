const mongoose = require('mongoose');

const InvitationSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  email: { type: String, required: true, index: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  turnPosition: { type: Number },
  status: { type: String, enum: ['pending','accepted','declined'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date }
});

module.exports = mongoose.model('Invitation', InvitationSchema);


