import React, { useState, useEffect } from 'react';
import API from '../api';
import './Profile.css';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const [user, setUser] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));
    // Try fetch latest profile from server
    (async () => {
      try {
        const res = await API.get('/auth/me');
        if (res.data?.user) {
          setUser(res.data.user);
          localStorage.setItem('user', JSON.stringify(res.data.user));
        }
      } catch (err) {
        // ignore; maybe offline
      }
    })();
  }, []);

  const onChange = (field) => (e) => setUser(prev => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    setSaving(true);
    try {
      const payload = {
        name: user.name,
        contactNumber: user.contactNumber,
        upiId: user.upiId,
        emergencyContactName: user.emergencyContactName,
        emergencyContactNumber: user.emergencyContactNumber
      };
      if (user.password && user.password.length > 0) payload.password = user.password;
      const res = await API.put('/auth/me', payload);
      if (res.data?.user) {
        const nu = res.data.user;
        setUser(nu);
        localStorage.setItem('user', JSON.stringify(nu));
        setMessage('Profile updated');
      } else {
        setMessage('Profile updated');
      }
    } catch (err) {
      setMessage(err.response?.data?.message || err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-container">
      <div className="profile-card">
        <h2>Your Profile</h2>
        <form onSubmit={submit} className="profile-form">
          <label>Full Name</label>
          <input value={user.name || ''} onChange={onChange('name')} />

          <label>Email (read-only)</label>
          <input value={user.email || ''} readOnly />

          <label>Contact Number</label>
          <input value={user.contactNumber || ''} onChange={onChange('contactNumber')} />

          <label>UPI ID</label>
          <input value={user.upiId || ''} onChange={onChange('upiId')} placeholder="username@bank" />

          <label>Emergency Contact Name</label>
          <input value={user.emergencyContactName || ''} onChange={onChange('emergencyContactName')} />

          <label>Emergency Contact Number</label>
          <input value={user.emergencyContactNumber || ''} onChange={onChange('emergencyContactNumber')} />

          <label>New Password (leave blank to keep current)</label>
          <input type="password" value={user.password || ''} onChange={onChange('password')} />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/dashboard')}>Cancel</button>
          </div>
          {message && <div style={{ marginTop: 10, color: message.includes('updated') ? 'green' : 'red' }}>{message}</div>}
        </form>
      </div>
    </div>
  );
}
