import React, { useState, useEffect } from 'react';
import API, { setToken, markLoginSuccess } from '../api';
import { useNavigate, Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

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

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
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

    setLoading(true);
    try {
      const res = await API.post('/auth/login', { email: email.trim().toLowerCase(), password });
      
      // Debug: log the response
      console.log('Login response:', res.data);
      
      // Store token and user data
      const token = res.data.token;
      const user = res.data.user;
      
      if (!token) {
        console.error('No token in response:', res.data);
        throw new Error('No token received from server');
      }
      
      // Store in localStorage first
      localStorage.setItem('token', token);
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      }
      
      // Set token in API instance
      setToken(token);
      
      // Verify token is stored
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        throw new Error('Failed to store token');
      }
      
      console.log('Token stored, redirecting to dashboard...');
      
      // Mark login as successful to prevent interceptor from redirecting
      markLoginSuccess();
      
      showToast('Login successful! Redirecting...', 'success');
      
      // Clear any pending redirects from API interceptor
      // Use window.location for a hard redirect to ensure clean state
      setTimeout(() => {
        // Double check token is still there
        const finalToken = localStorage.getItem('token');
        if (finalToken) {
          window.location.href = '/dashboard';
        } else {
          console.error('Token was cleared before redirect!');
          setError('Authentication failed. Please try again.');
          setLoading(false);
        }
      }, 300);
    } catch (err) {
      console.error('Login error:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Login failed. Please check your credentials.';
      setError(errorMsg);
      showToast(errorMsg, 'error');
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Welcome Back</h1>
          <p>Sign in to your Peer2Loan account</p>
        </div>
        
        <form onSubmit={submit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          
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
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
                autoComplete="current-password"
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
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account? <Link to="/register">Create one here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
