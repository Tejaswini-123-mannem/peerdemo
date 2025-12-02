const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Validation helpers
const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// register
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      contactNumber,
      upiId,
      emergencyContactName,
      emergencyContactNumber
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (name.trim().length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!validateEmail(email.trim())) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (!contactNumber || !String(contactNumber).trim()) {
      return res.status(400).json({ message: 'Contact number is required' });
    }
    const contactStr = String(contactNumber).replace(/\s+/g, '');
    if (!/^[0-9]{7,15}$/.test(contactStr)) {
      return res.status(400).json({ message: 'Please provide a valid contact number (7-15 digits)' });
    }

    if (!upiId || !String(upiId).trim()) {
      return res.status(400).json({ message: 'UPI ID is required' });
    }
    const upiStr = String(upiId).trim();
    if (!/^[\w.\-]{2,}@[A-Za-z0-9.\-]{2,}$/.test(upiStr)) {
      return res.status(400).json({ message: 'Please provide a valid UPI ID (example: username@bank)' });
    }

    if (!emergencyContactName || !String(emergencyContactName).trim()) {
      return res.status(400).json({ message: 'Emergency contact name is required' });
    }
    if (!emergencyContactNumber || !String(emergencyContactNumber).trim()) {
      return res.status(400).json({ message: 'Emergency contact number is required' });
    }
    const emergencyNumberStr = String(emergencyContactNumber).replace(/\s+/g, '');
    if (!/^[0-9]{7,15}$/.test(emergencyNumberStr)) {
      return res.status(400).json({ message: 'Please provide a valid emergency contact number (7-15 digits)' });
    }

    // Check if user exists
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    // Create user
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const user = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: hash,
      role: role === 'organizer' ? 'organizer' : 'member',
      contactNumber: contactStr,
      upiId: upiStr,
      emergencyContactName: emergencyContactName.trim(),
      emergencyContactNumber: emergencyNumberStr
    });
    await user.save();

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || 'fallback-secret-change-in-production',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        contactNumber: user.contactNumber,
        upiId: user.upiId,
        emergencyContactName: user.emergencyContactName,
        emergencyContactNumber: user.emergencyContactNumber
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }
    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

// login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    // Find user
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Verify password
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || 'fallback-secret-change-in-production',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        contactNumber: user.contactNumber,
        upiId: user.upiId,
        emergencyContactName: user.emergencyContactName,
        emergencyContactNumber: user.emergencyContactNumber
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

module.exports = router;

// Get current user profile
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    // req.user is populated by auth middleware
    const user = req.user;
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('Fetch profile error:', err);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// Update current user profile
router.put('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const User = require('../models/User');
    const uid = req.user._id;
    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const {
      name,
      contactNumber,
      upiId,
      emergencyContactName,
      emergencyContactNumber,
      password
    } = req.body;

    // Basic validations (only when provided)
    if (name !== undefined && (!String(name).trim() || String(name).trim().length < 2)) {
      return res.status(400).json({ message: 'Name must be at least 2 characters' });
    }
    if (contactNumber !== undefined) {
      const c = String(contactNumber).replace(/\s+/g, '');
      if (c && !/^[0-9]{7,15}$/.test(c)) {
        return res.status(400).json({ message: 'Contact number must be 7-15 digits' });
      }
      user.contactNumber = c || '';
    }
    if (upiId !== undefined) {
      const u = String(upiId).trim();
      if (u && !/^[\w.\-]{2,}@[A-Za-z0-9.\-]{2,}$/.test(u)) {
        return res.status(400).json({ message: 'Invalid UPI ID format' });
      }
      user.upiId = u || '';
    }
    if (emergencyContactName !== undefined) {
      user.emergencyContactName = String(emergencyContactName).trim() || '';
    }
    if (emergencyContactNumber !== undefined) {
      const e = String(emergencyContactNumber).replace(/\s+/g, '');
      if (e && !/^[0-9]{7,15}$/.test(e)) {
        return res.status(400).json({ message: 'Emergency contact number must be 7-15 digits' });
      }
      user.emergencyContactNumber = e || '';
    }
    if (name !== undefined) user.name = String(name).trim();

    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(password, salt);
    }

    await user.save();

    res.json({ user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      contactNumber: user.contactNumber,
      upiId: user.upiId,
      emergencyContactName: user.emergencyContactName,
      emergencyContactNumber: user.emergencyContactNumber
    }});
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});
