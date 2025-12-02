import React, { useState, useEffect } from 'react';
import API, { setToken } from '../api';
import { useNavigate, Link } from 'react-router-dom';
import './Auth.css';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('member'); // 'organizer' or 'member'
  const [contactNumber, setContactNumber] = useState('');
  const [upiId, setUpiId] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const getPasswordStrength = (pwd) => {
    if (pwd.length === 0) return { strength: 0, label: '', color: '' };
    if (pwd.length < 6) return { strength: 1, label: 'Weak', color: '#e74c3c' };
    if (pwd.length < 8) return { strength: 2, label: 'Fair', color: '#f39c12' };
    if (pwd.length < 10) return { strength: 3, label: 'Good', color: '#3498db' };
    return { strength: 4, label: 'Strong', color: '#2ecc71' };
  };

  const passwordStrength = getPasswordStrength(password);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (role !== 'organizer' && role !== 'member') {
      setError('Please select a valid role');
      return;
    }
    if (!contactNumber.trim()) {
      setError('Contact number is required');
      return;
    }
    if (!/^[0-9]{7,15}$/.test(contactNumber.trim().replace(/\s+/g, ''))) {
      setError('Contact number must be 7-15 digits');
      return;
    }
    if (!upiId.trim()) {
      setError('UPI ID is required');
      return;
    }
    if (!/^[\w.\-]{2,}@[A-Za-z0-9.\-]{2,}$/.test(upiId.trim())) {
      setError('Enter a valid UPI ID (e.g. name@bank)');
      return;
    }
    if (!emergencyContactName.trim()) {
      setError('Emergency contact name is required');
      return;
    }
    if (!emergencyContactNumber.trim()) {
      setError('Emergency contact number is required');
      return;
    }
    if (!/^[0-9]{7,15}$/.test(emergencyContactNumber.trim().replace(/\s+/g, ''))) {
      setError('Emergency contact number must be 7-15 digits');
      return;
    }

    setLoading(true);
    try {
      const res = await API.post('/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        contactNumber: contactNumber.trim().replace(/\s+/g, ''),
        upiId: upiId.trim(),
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactNumber: emergencyContactNumber.trim().replace(/\s+/g, '')
      });
      
      // Store token and user data
      const token = res.data.token;
      const user = res.data.user;
      
      if (!token) {
        throw new Error('No token received from server');
      }
      
      // Store in localStorage first
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      // Set token in API instance
      setToken(token);
      
      // Use window.location for a hard redirect to ensure clean state
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Create Account</h1>
          <p>Join Peer2Loan and start managing your groups</p>
        </div>
        
        <form onSubmit={submit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              disabled={loading}
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">Register as</label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={loading}
            >
              <option value="member">Member</option>
              <option value="organizer">Organizer</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="contactNumber">Contact Number</label>
            <input
              id="contactNumber"
              type="tel"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="Enter your primary contact number"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="upiId">UPI ID</label>
            <input
              id="upiId"
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g., username@bank"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="emergencyContactName">Emergency Contact Name</label>
            <input
              id="emergencyContactName"
              type="text"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              placeholder="Emergency contact person"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="emergencyContactNumber">Emergency Contact Number</label>
            <input
              id="emergencyContactNumber"
              type="tel"
              value={emergencyContactNumber}
              onChange={(e) => setEmergencyContactNumber(e.target.value)}
              placeholder="Emergency contact number"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {password && (
              <div className="password-strength">
                <div className="strength-bar">
                  <div
                    className="strength-fill"
                    style={{
                      width: `${(passwordStrength.strength / 4) * 100}%`,
                      backgroundColor: passwordStrength.color
                    }}
                  />
                </div>
                {passwordStrength.label && (
                  <span style={{ color: passwordStrength.color, fontSize: '12px' }}>
                    {passwordStrength.label}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="password-input-wrapper">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex="-1"
              >
                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <div className="error-text">Passwords do not match</div>
            )}
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account? <Link to="/login">Sign in here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
