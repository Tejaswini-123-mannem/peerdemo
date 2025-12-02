import React, { useState } from 'react';
import API from '../api';
import { useNavigate, Link } from 'react-router-dom';
import './CreateGroup.css';

export default function CreateGroup() {
  const [name, setName] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState(1000);
  const [groupSize, setGroupSize] = useState(6);
  const currentDate = new Date();
  const [startMonth, setStartMonth] = useState(String(currentDate.getMonth() + 1).padStart(2, '0'));
  const [startYear, setStartYear] = useState(String(currentDate.getFullYear()));
  const [paymentWindow, setPaymentWindow] = useState('1-7');
  const [gracePeriodDays, setGracePeriodDays] = useState(0);
  const [currency, setCurrency] = useState('INR');
  const [turnOrderPolicy, setTurnOrderPolicy] = useState('fixed');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [memberForm, setMemberForm] = useState({ name: '', email: '' });
  const [editingMemberIndex, setEditingMemberIndex] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [finalOrderPreview, setFinalOrderPreview] = useState([]);
  const navigate = useNavigate();

  const validate = () => {
    if (!name.trim()) {
      setError('Group name is required');
      return false;
    }
    if (name.trim().length < 3) {
      setError('Group name must be at least 3 characters');
      return false;
    }
    const numericGroupSize = Number(groupSize);

    if (!monthlyContribution || Number(monthlyContribution) < 100) {
      setError('Monthly contribution must be at least 100');
      return false;
    }
    if (!numericGroupSize || numericGroupSize < 2 || numericGroupSize > 50) {
      setError('Group size must be between 2 and 50');
      return false;
    }
    if (members.length < numericGroupSize) {
      setError(`Add ${numericGroupSize - members.length} more member${numericGroupSize - members.length === 1 ? '' : 's'} to match the group size`);
      return false;
    }
    if (members.length > numericGroupSize) {
      setError('Remove extra members to match the group size');
      return false;
    }
    if (members.length < 2) {
      setError('Add at least 2 members to create a group');
      return false;
    }
    if (gracePeriodDays < 0 || gracePeriodDays > 5) {
      setError('Grace period must be between 0 and 5 days');
      return false;
    }
    if (!startMonth || !startYear) {
      setError('Start month and year are required');
      return false;
    }
    const selectedDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    today.setDate(1); // Set to first of month for comparison
    if (selectedDate < today) {
      setError('Start month cannot be in the past');
      return false;
    }
    return true;
  };

  const resetMemberForm = () => {
    setMemberForm({ name: '', email: '' });
    setEditingMemberIndex(null);
  };

  const handleMemberSave = (e) => {
    e.preventDefault();
    if (loading) return;
    const numericGroupSize = Number(groupSize);
    if (!numericGroupSize || numericGroupSize < 2) {
      setError('Set the group size (2-50) before adding members');
      return;
    }
    setError('');
    const trimmedName = memberForm.name.trim();
    const trimmedEmail = memberForm.email.trim();
    if (!trimmedEmail) {
      setError('Member email is required');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Enter a valid member email');
      return;
    }

    const lowerEmail = trimmedEmail.toLowerCase();
    const duplicate = members.some((member, idx) => {
      if (editingMemberIndex !== null && idx === editingMemberIndex) return false;
      return member.email.toLowerCase() === lowerEmail;
    });
    if (duplicate) {
      setError('Member email already added');
      return;
    }

    if (editingMemberIndex === null && members.length >= numericGroupSize) {
      setError('Group is already full. Adjust the group size or edit existing members.');
      return;
    }

    const updatedMember = {
      name: trimmedName,
      email: trimmedEmail
    };

    setMembers(prev => {
      if (editingMemberIndex !== null) {
        const next = [...prev];
        next[editingMemberIndex] = updatedMember;
        return next;
      }
      return [...prev, updatedMember];
    });
    resetMemberForm();
  };

  const handleMemberEdit = (index) => {
    if (loading) return;
    const member = members[index];
    if (!member) return;
    setMemberForm({ name: member.name || '', email: member.email || '' });
    setEditingMemberIndex(index);
  };

  const handleMemberRemove = (index) => {
    if (loading) return;
    setMembers(prev => prev.filter((_, idx) => idx !== index));
    if (editingMemberIndex === index) {
      resetMemberForm();
    } else if (editingMemberIndex !== null && index < editingMemberIndex) {
      setEditingMemberIndex(editingMemberIndex - 1);
    }
  };

  const moveMember = (from, to) => {
    if (from === to) return;
    setMembers(prev => {
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  };

  const handleDragStart = (index) => {
    if (turnOrderPolicy !== 'fixed') return;
    setDragIndex(index);
  };

  const handleDragOver = (e) => {
    if (turnOrderPolicy !== 'fixed') return;
    e.preventDefault();
  };

  const handleDrop = (index) => {
    if (turnOrderPolicy !== 'fixed') return;
    if (dragIndex === null || dragIndex === index) return;
    moveMember(dragIndex, index);
    setDragIndex(null);
  };

  const computeFinalOrder = () => {
    const base = members.map((member, idx) => ({
      ...member,
      position: idx + 1
    }));
    if (turnOrderPolicy === 'randomized') {
      const shuffled = [...base];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
      }
      return shuffled.map((member, idx) => ({
        ...member,
        position: idx + 1
      }));
    }
    return base;
  };

  const submit = (e) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    const previewOrder = computeFinalOrder();
    setFinalOrderPreview(previewOrder);
    setShowConfirm(true);
  };

  const confirmCreation = async () => {
    if (!finalOrderPreview.length) {
      setShowConfirm(false);
      return;
    }
    setLoading(true);
    try {
      await API.post('/groups', {
        name: name.trim(),
        monthlyContribution: Number(monthlyContribution),
        groupSize: Number(groupSize),
        startMonth: `${startYear}-${startMonth.padStart(2, '0')}-01`,
        paymentWindow,
        turnOrderPolicy,
        currency,
        gracePeriodDays: Number(gracePeriodDays),
        initialMembers: finalOrderPreview.map(member => ({
          name: member.name,
          email: member.email,
          position: member.position
        }))
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create group. Please try again.');
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  const numericGroupSize = Number(groupSize) || 0;
  const membersCount = members.length;
  const totalAmount = Number(monthlyContribution || 0) * numericGroupSize;

  return (
    <div className="create-group-container">
      <div className="create-group-card">
        <div className="page-header">
          <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
          <h1>Create New Group</h1>
          <p>Set up a new peer-to-peer lending group</p>
        </div>

        <form onSubmit={submit} className="create-group-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Group Name *</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Family Savings Group"
                disabled={loading}
                maxLength={50}
              />
            </div>

            <div className="form-group">
              <label htmlFor="currency">Currency *</label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={loading}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="monthlyContribution">Monthly Contribution *</label>
              <div className="input-with-symbol">
                <span className="currency-symbol">
                  {currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}
                </span>
                <input
                  id="monthlyContribution"
                  type="number"
                  value={monthlyContribution}
                  onChange={(e) => setMonthlyContribution(e.target.value)}
                  placeholder="1000"
                  disabled={loading}
                  min="100"
                  step="100"
                />
              </div>
              <small>Minimum: 100</small>
            </div>

            <div className="form-group">
              <label htmlFor="groupSize">Group Size *</label>
              <input
                id="groupSize"
                type="number"
                value={groupSize}
                onChange={(e) => {
                  const value = e.target.value;
                  setGroupSize(value);
                  const nextValue = Number(value);
                  if (!value) {
                    if (error && error.startsWith('Reduce members')) {
                      setError('');
                    }
                    return;
                  }
                  if (Number.isNaN(nextValue)) {
                    setError('Enter a numeric group size');
                    return;
                  }
                  if (nextValue < 2 || nextValue > 50) {
                    setError('Group size must be between 2 and 50');
                    return;
                  }
                  if (members.length > nextValue) {
                    setError(`Reduce members to ${nextValue} to match the group size`);
                  } else if (error && (error.startsWith('Reduce members') || error.includes('Group size'))) {
                    setError('');
                  }
                }}
                placeholder="6"
                disabled={loading}
                min="2"
                max="50"
              />
              <small>Maximum members allowed in this group (2-50)</small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startMonth">Start Month *</label>
              <select
                id="startMonth"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                disabled={loading}
              >
                <option value="01">January</option>
                <option value="02">February</option>
                <option value="03">March</option>
                <option value="04">April</option>
                <option value="05">May</option>
                <option value="06">June</option>
                <option value="07">July</option>
                <option value="08">August</option>
                <option value="09">September</option>
                <option value="10">October</option>
                <option value="11">November</option>
                <option value="12">December</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="startYear">Start Year *</label>
              <input
                id="startYear"
                type="number"
                value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
                disabled={loading}
                min={currentDate.getFullYear()}
                max={currentDate.getFullYear() + 10}
              />
            </div>

            <div className="form-group">
              <label htmlFor="paymentWindow">Payment Window</label>
              <select
                id="paymentWindow"
                value={paymentWindow}
                onChange={(e) => setPaymentWindow(e.target.value)}
                disabled={loading}
              >
                <option value="1-7">1st - 7th of month</option>
                <option value="1-10">1st - 10th of month</option>
                <option value="1-15">1st - 15th of month</option>
                <option value="1-30">Entire month</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="gracePeriodDays">Grace Period (days)</label>
              <select
                id="gracePeriodDays"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                disabled={loading}
              >
                {[0,1,2,3,4,5].map(day => (
                  <option key={day} value={day}>
                    {day} day{day === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
              <small>Additional days members get after the payment window closes</small>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group" style={{ width: '100%' }}>
              <label htmlFor="turnOrderPolicy">Turn Order Policy</label>
              <select
                id="turnOrderPolicy"
                value={turnOrderPolicy}
                onChange={(e) => setTurnOrderPolicy(e.target.value)}
                disabled={loading}
              >
                <option value="fixed">Fixed Order (by add/define order)</option>
                <option value="randomized">Randomized (automatically generated)</option>
                <option value="admin_approval">Admin Approval (manual assignment)</option>
              </select>
              <small>
                - Fixed: organizer-defined order. - Randomized: order automatically generated during group creation.
                - Admin approval: organizer assigns each month's recipient.
              </small>
            </div>
          </div>

          <div className="members-section">
            <div className="members-section-header">
              <div>
                <h2>Members</h2>
                <p className="members-subtext">
                  Add members now. We will notify them after you confirm the group. {turnOrderPolicy === 'fixed' ? 'Drag and drop to set the payout order.' : turnOrderPolicy === 'randomized' ? 'The payout order will be randomized when you confirm.' : 'You can rearrange the order later once admin approval is ready.'}
                </p>
              </div>
              <div className="members-count">
                {membersCount} / {numericGroupSize || '—'} member{membersCount === 1 ? '' : 's'}
              </div>
            </div>

            <div className="member-entry">
              <div className="member-entry-fields">
                <div className="member-entry-field">
                  <label htmlFor="memberName">Name</label>
                  <input
                    id="memberName"
                    type="text"
                    placeholder="Member name"
                    value={memberForm.name}
                    onChange={(e) => setMemberForm(prev => ({ ...prev, name: e.target.value }))}
                    disabled={loading}
                    maxLength={60}
                  />
                </div>
                <div className="member-entry-field">
                  <label htmlFor="memberEmail">Email *</label>
                  <input
                    id="memberEmail"
                    type="email"
                    placeholder="member@example.com"
                    value={memberForm.email}
                    onChange={(e) => setMemberForm(prev => ({ ...prev, email: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleMemberSave(e);
                      }
                    }}
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="member-entry-actions">
                {editingMemberIndex !== null && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={resetMemberForm}
                    disabled={loading}
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleMemberSave}
                  disabled={loading}
                >
                  {editingMemberIndex !== null ? 'Update Member' : 'Add Member'}
                </button>
              </div>
            </div>

            <div
              className={`member-list ${turnOrderPolicy === 'fixed' ? 'member-list-draggable' : ''}`}
              onDragOver={handleDragOver}
            >
              {members.length === 0 ? (
                <div className="member-empty">No members yet. Add at least two members to continue.</div>
              ) : (
                members.map((member, index) => (
                  <div
                    key={`${member.email}-${index}`}
                    className="member-card"
                    draggable={turnOrderPolicy === 'fixed'}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    <div className="member-avatar">
                      {(member.name?.[0] || member.email?.[0] || 'U').toUpperCase()}
                    </div>
                    <div className="member-details">
                      <div className="member-name-line">
                        <span className="member-name">{member.name || 'Name pending'}</span>
                        <span className="member-email">{member.email}</span>
                      </div>
                      <div className="member-turn">
                        Turn position: {turnOrderPolicy === 'randomized' ? 'TBD' : index + 1}
                      </div>
                    </div>
                    <div className="member-actions">
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => handleMemberEdit(index)}
                        disabled={loading}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-link danger"
                        onClick={() => handleMemberRemove(index)}
                        disabled={loading}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="summary-box">
            <h3>Group Summary</h3>
            <div className="summary-item">
              <span>Members Added:</span>
              <span className="summary-value">
                {membersCount} / {numericGroupSize || '—'}
              </span>
            </div>
            <div className="summary-item">
              <span>Total Pool Amount:</span>
              <span className="summary-value">
                {currency} {Number(totalAmount || 0).toLocaleString()}
              </span>
            </div>
            <div className="summary-item">
              <span>Duration:</span>
              <span className="summary-value">
                {numericGroupSize ? `${numericGroupSize} month${numericGroupSize === 1 ? '' : 's'}` : '—'}
              </span>
            </div>
            <div className="summary-item">
              <span>Each member receives:</span>
              <span className="summary-value">
                {currency} {Number(totalAmount || 0).toLocaleString()}
              </span>
            </div>
            <div className="summary-item">
              <span>Grace Period:</span>
              <span className="summary-value">
                {gracePeriodDays} day{gracePeriodDays === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {showConfirm && (
            <div className="confirm-overlay">
              <div className="confirm-dialog">
                <h3>Confirm Members & Turn Order</h3>
                <p>
                  Please verify the member list and confirm. Notifications will be sent to everyone once you continue.
                </p>
                <div className="confirm-member-list">
                  {finalOrderPreview.map((member, index) => (
                    <div key={`${member.email}-${index}`} className="confirm-member-row">
                      <div className="confirm-member-rank">{index + 1}</div>
                      <div className="confirm-member-info">
                        <div className="confirm-member-name">{member.name || 'Name pending'}</div>
                        <div className="confirm-member-email">{member.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {turnOrderPolicy === 'randomized' && (
                  <div className="confirm-note">
                    Order randomized automatically for the first cycle.
                  </div>
                )}
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowConfirm(false)}
                    disabled={loading}
                  >
                    Back & Edit
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={confirmCreation}
                    disabled={loading}
                  >
                    {loading ? 'Creating...' : 'OK, Create Group'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={() => navigate('/dashboard')} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
