const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'member' }, // 'organizer' or 'member'
  contactNumber: { type: String },
  upiId: { type: String },
  emergencyContactName: { type: String },
  emergencyContactNumber: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
