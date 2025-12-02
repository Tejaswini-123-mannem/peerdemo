import React, { useEffect, useState } from 'react';
import API from '../api';
import { useParams, useNavigate, Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import './GroupView.css';

export default function GroupView() {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(null);
  const [sectionError, setSectionError] = useState({});
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [file, setFile] = useState(null);
  const [payoutAccount, setPayoutAccount] = useState('');
  const [user, setUser] = useState(null);
  const [openCycle, setOpenCycle] = useState(null);
  const [openPayoutCycle, setOpenPayoutCycle] = useState(null);
  const [payoutCycleId, setPayoutCycleId] = useState('');
  const [payoutRecipientId, setPayoutRecipientId] = useState('');
  const [payoutProofFile, setPayoutProofFile] = useState(null);
  const [selectedPayoutCycle, setSelectedPayoutCycle] = useState(null);
  const [executingPayout, setExecutingPayout] = useState(false);
  const [assigningPayout, setAssigningPayout] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [disputes, setDisputes] = useState([]);
  const [disputeSubject, setDisputeSubject] = useState('');
  const [disputeMessage, setDisputeMessage] = useState('');
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [disputeReplyMessage, setDisputeReplyMessage] = useState('');
  const [loadingDisputes, setLoadingDisputes] = useState(false);
  const [memberLockStatus, setMemberLockStatus] = useState({});
  const navigate = useNavigate();
  const fileBase = (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/api\/?$/, '');

  const loadDisputes = async () => {
    if (!group) return;
    setLoadingDisputes(true);
    try {
      const res = await API.get(`/disputes/group/${id}`);
      setDisputes(res.data.disputes || []);
    } catch (err) {
      console.error('Failed to load disputes:', err);
    } finally {
      setLoadingDisputes(false);
    }
  };

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    load();
  }, [id]);

  useEffect(() => {
    if (group && (activeSection === 'overview' || activeSection === 'disputes' || activeSection === 'admin-disputes')) {
      loadDisputes();
    }
  }, [id, activeSection, group]);

  const load = async () => {
    setLoading(true);
    setError('');
    setErrorStatus(null);
    try {
      const res = await API.get(`/groups/${id}`);
      setGroup(res.data.group);
      // Sort cycles by monthIndex to ensure proper order
      const sortedCycles = (res.data.cycles || []).sort((a, b) => (a.monthIndex || 0) - (b.monthIndex || 0));
      setCycles(sortedCycles);
      setInvitations(res.data.invitations || []);
      setMemberLockStatus(res.data.memberLockStatus || {});
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || 'Failed to load group details';
      setError(message);
      setErrorStatus(status);
      if (status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper to resolve a user field from a populated user object or fall back to the
  // currently logged-in user's local data (useful when the API returns only an id)
  const getFieldFrom = (person, field, fallback = 'Not provided') => {
    try {
      const val = person?.[field];
      if (val !== undefined && val !== null && String(val).trim() !== '') return val;
      const personId = person?._id || person;
      if (user && personId && (String(user.id) === String(personId) || String(user._id) === String(personId))) {
        const uval = user[field];
        if (uval !== undefined && uval !== null && String(uval).trim() !== '') return uval;
      }
    } catch (e) {
      // ignore and return fallback
    }
    return fallback;
  };

  const isMember = () => {
    if (!group || !user) return false;
    return group.members?.some(m => 
      m.user?._id === user.id || m.user === user.id || m.user?._id === user._id
    );
  };

  const isAdmin = () => {
    if (!group || !user) return false;
    const createdById = group.createdBy?._id || group.createdBy;
    const userId = user.id || user._id;
    return String(createdById) === String(userId);
  };

  const join = async () => {
    if (!payoutAccount.trim()) {
      setSectionError({ members: 'Please provide your payout account details' });
      return;
    }
    try {
      await API.post(`/groups/${id}/join`, { payoutAccount: payoutAccount.trim() });
      setPayoutAccount('');
      setSectionError({});
      load();
    } catch (err) {
      setSectionError({ members: err.response?.data?.message || 'Failed to join group' });
    }
  };

  const pay = async (cycleId) => {
    if (!file) {
      setError('Please select a payment proof file');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('amount', group.monthlyContribution);
      fd.append('proof', file);
      await API.post(`/cycles/${cycleId}/pay`, fd, { 
        headers: { 'Content-Type': 'multipart/form-data' } 
      });
      setFile(null);
      setSelectedCycle(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record payment');
    }
  };

  const executePayout = async (cycleId) => {
    if (!file) {
      setError('Please upload payout proof');
      return;
    }
    if (!window.confirm('Are you sure you want to execute this payout?')) return;
    try {
      const fd = new FormData();
      fd.append('payoutProof', file);
      await API.post(`/cycles/${cycleId}/payout`, fd, { 
        headers: { 'Content-Type': 'multipart/form-data' } 
      });
      setFile(null);
      setSelectedCycle(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to execute payout');
    }
  };

  const approvePayment = async (cycleId, paymentId) => {
    try {
      await API.post(`/cycles/${cycleId}/payments/${paymentId}/approve`, {});
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve payment');
    }
  };

  const rejectPayment = async (cycleId, paymentId) => {
    if (!window.confirm('Are you sure you want to reject this payment?')) return;
    try {
      await API.post(`/cycles/${cycleId}/payments/${paymentId}/decline`, {});
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject payment');
    }
  };

  const toggleMemberLock = async (memberId, isLocked) => {
    if (!memberId) {
      setError('Member ID is required');
      return;
    }
    try {
      const newLockStatus = !isLocked;
      await API.patch(`/groups/${id}/members/${memberId}/lock`, { isLocked: newLockStatus });
      await load(); // Reload to get updated state
    } catch (err) {
      console.error('Toggle lock error:', err);
      setError(err.response?.data?.message || `Failed to ${isLocked ? 'unlock' : 'lock'} member`);
    }
  };

  const hasPaid = (cycle) => {
    if (!user) return false;
    return cycle.payments?.some(p => {
      const pid = p.member?._id || p.member;
      const uid = user.id || user._id;
      return String(pid) === String(uid) && p.status === 'paid';
    });
  };

  const getPaymentStatus = (cycle) => {
    const paidCount = cycle.payments?.filter(p => p.status === 'paid').length || 0;
    const totalMembers = group?.members?.length || 0;
    if (paidCount === 0) return { label: 'No Payments', color: '#e74c3c' };
    if (paidCount < totalMembers) return { label: 'Partial', color: '#f39c12' };
    return { label: 'Complete', color: '#2ecc71' };
  };

  const getWindowForCycle = (cycle) => {
    const win = String(group?.paymentWindow || '1-7');
    const [startDayStr, endDayStr] = win.split('-');
    const startDay = Math.max(1, parseInt(startDayStr || '1', 10));
    const endDay = Math.max(startDay, parseInt(endDayStr || String(startDay), 10));
    const base = new Date(cycle.dueDate);
    const start = new Date(base.getFullYear(), base.getMonth(), startDay, 0, 0, 0, 0);
    const end = new Date(base.getFullYear(), base.getMonth(), endDay, 23, 59, 59, 999);
    const grace = Number(group?.gracePeriodDays || 0);
    if (!Number.isNaN(grace) && grace > 0) {
      end.setDate(end.getDate() + grace);
    }
    return { start, end };
  };

  const isWithinWindow = (cycle) => {
    const { start, end } = getWindowForCycle(cycle);
    const now = new Date();
    return now >= start && now <= end;
  };

  if (loading) {
    return (
      <div className="group-view-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading group details...</p>
        </div>
      </div>
    );
  }

  if (!group) {
    // Check if error is due to closed group (check for 403 status code specifically)
    if (errorStatus === 403 || (error && error.toLowerCase().includes('closed'))) {
      return (
        <div className="group-view-container">
          <div className="error-state">
            <p>This group has been closed and is no longer accessible.</p>
            <p style={{ color: '#666', fontSize: 14, marginTop: 10 }}>
              The ledger has been generated and the group is permanently archived.
            </p>
            <Link to="/dashboard" className="btn-primary" style={{ marginTop: 20 }}>Back to Dashboard</Link>
          </div>
        </div>
      );
    }
    return (
      <div className="group-view-container">
        <div className="error-state">
          <p>Group not found</p>
          <Link to="/dashboard" className="btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const memberStatus = isMember();
  const adminStatus = isAdmin();
  
  // Check if group is closed - only block members, allow organizer to view (for ledger download)
  if (group.closedAt !== null && group.closedAt !== undefined && !adminStatus) {
    return (
      <div className="group-view-container">
        <div className="error-state">
          <p>This group has been closed and is no longer accessible.</p>
          <p style={{ color: '#666', fontSize: 14, marginTop: 10 }}>
            The ledger has been generated and the group is permanently archived.
          </p>
          <Link to="/dashboard" className="btn-primary" style={{ marginTop: 20 }}>Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const sections = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'members', label: 'Members', icon: '👥' },
    { id: 'turn-order', label: 'Turn Order', icon: '🔄' },
    { id: 'cycles', label: 'Payment Cycles', icon: '💰' },
    { id: 'payout', label: 'Payout Info', icon: '💸' },
    { id: 'performance', label: 'Performance', icon: '📈' },
    ...(memberStatus && !adminStatus ? [{ id: 'disputes', label: 'Disputes', icon: '⚖️' }] : []),
    ...(adminStatus ? [{ id: 'admin-disputes', label: 'Dispute Management', icon: '⚖️' }] : [])
  ];
  const sortedMembers = [...(group.members || [])].sort((a, b) => {
    const posA = typeof a.turnPosition === 'number' ? a.turnPosition : Number.MAX_SAFE_INTEGER;
    const posB = typeof b.turnPosition === 'number' ? b.turnPosition : Number.MAX_SAFE_INTEGER;
    if (posA !== posB) return posA - posB;
    const nameA = (a.user?.name || '').toLowerCase();
    const nameB = (b.user?.name || '').toLowerCase();
    if (nameA && nameB) return nameA.localeCompare(nameB);
    return 0;
  });

  const invitationMap = new Map();
  (invitations || []).forEach(inv => {
    if (inv?.email) {
      invitationMap.set(inv.email.toLowerCase(), inv);
    }
  });

  const plannedOrder = Array.isArray(group.plannedMembers)
    ? [...group.plannedMembers].sort((a, b) => (a.position || 0) - (b.position || 0))
    : [];

  const derivedTurnSchedule = (plannedOrder.length > 0 ? plannedOrder : sortedMembers).map((entry, idx) => {
    const position = plannedOrder.length > 0
      ? entry.position || idx + 1
      : (entry.turnPosition || idx + 1);
    const lowerEmail = (plannedOrder.length > 0 ? entry.email : (entry.user?.email || entry.invitedEmail))?.toLowerCase?.() || '';
    const matchedMember = plannedOrder.length > 0
      ? sortedMembers.find(member => {
          if (typeof member.turnPosition === 'number' && typeof position === 'number') {
            return member.turnPosition === position;
          }
          const memberEmail = (member.user?.email || member.invitedEmail || '').toLowerCase();
          return lowerEmail && memberEmail === lowerEmail;
        })
      : entry;
    const invitation = lowerEmail ? invitationMap.get(lowerEmail) : undefined;
    const status = matchedMember
      ? 'joined'
      : invitation
        ? invitation.status
        : 'pending';
    return {
      position,
      plannedName: plannedOrder.length > 0 ? entry.name : entry.user?.name,
      plannedEmail: plannedOrder.length > 0 ? entry.email : (entry.user?.email || entry.invitedEmail || ''),
      member: matchedMember && matchedMember !== entry ? matchedMember : (matchedMember || null),
      status,
      invitation
    };
  }).sort((a, b) => (a.position || 0) - (b.position || 0));

  const turnSchedule = derivedTurnSchedule.filter(item => item.position !== undefined && item.position !== null);

  const createDispute = async (e) => {
    e.preventDefault();
    if (!disputeSubject.trim() || !disputeMessage.trim()) {
      setSectionError({ disputes: 'Subject and message are required' });
      return;
    }
    setLoadingDisputes(true);
    setSectionError({});
    try {
      console.log('Creating dispute with:', { groupId: id, subject: disputeSubject.trim(), message: disputeMessage.trim() });
      const response = await API.post('/disputes', {
        groupId: id,
        subject: disputeSubject.trim(),
        message: disputeMessage.trim()
      });
      console.log('Dispute created successfully:', response.data);
      setDisputeSubject('');
      setDisputeMessage('');
      setSectionError({});
      // Reload disputes after a short delay to ensure backend has processed
      setTimeout(() => {
        loadDisputes();
      }, 500);
    } catch (err) {
      console.error('Create dispute error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to create dispute';
      setSectionError({ disputes: errorMessage });
    } finally {
      setLoadingDisputes(false);
    }
  };

  const sendDisputeReply = async (disputeId) => {
    if (!disputeReplyMessage.trim()) {
      setSectionError({ [activeSection === 'admin-disputes' ? 'admin-disputes' : 'disputes']: 'Message is required' });
      return;
    }
    setLoadingDisputes(true);
    try {
      await API.post(`/disputes/${disputeId}/message`, {
        message: disputeReplyMessage.trim()
      });
      setDisputeReplyMessage('');
      setSectionError({});
      loadDisputes();
    } catch (err) {
      setSectionError({ [activeSection === 'admin-disputes' ? 'admin-disputes' : 'disputes']: err.response?.data?.message || 'Failed to send message' });
    } finally {
      setLoadingDisputes(false);
    }
  };

  const resolveDispute = async (disputeId) => {
    if (!window.confirm('Mark this dispute as resolved?')) return;
    setLoadingDisputes(true);
    try {
      await API.patch(`/disputes/${disputeId}/resolve`);
      setSectionError({});
      loadDisputes();
    } catch (err) {
      setSectionError({ 'admin-disputes': err.response?.data?.message || 'Failed to resolve dispute' });
    } finally {
      setLoadingDisputes(false);
    }
  };

  const assignPayout = async () => {
    if (!payoutCycleId || !payoutRecipientId) {
      alert('Please select both cycle and recipient');
      return;
    }
    setAssigningPayout(true);
    try {
      await API.post(`/cycles/${payoutCycleId}/assign-payout`, { recipientId: payoutRecipientId });
      setPayoutCycleId('');
      setPayoutRecipientId('');
      load();
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    } finally {
      setAssigningPayout(false);
    }
  };

  const executePayoutWithProof = async (cycleId) => {
    if (!payoutProofFile) {
      setSectionError({ payout: 'Please select a payment proof file' });
      return;
    }
    setExecutingPayout(true);
    setSectionError({});
    try {
      const fd = new FormData();
      fd.append('payoutProof', payoutProofFile);
      await API.post(`/cycles/${cycleId}/payout`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPayoutProofFile(null);
      setSelectedPayoutCycle(null);
      load();
    } catch (err) {
      setSectionError({ payout: err.response?.data?.message || err.message || 'Failed to upload proof' });
    } finally {
      setExecutingPayout(false);
    }
  };

  return (
    <div className="group-view-container">
      <div className="group-header-section">
        <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
        <div className="group-header">
          <div>
            <h1>{group.name}</h1>
            <div className="group-meta">
              <span className="meta-item">
                <strong>Monthly Contribution:</strong> {group.currency} {group.monthlyContribution?.toLocaleString()}
              </span>
              <span className="meta-item">
                <strong>Members:</strong> {group.members?.length || 0} / {group.groupSize}
              </span>
              <span className="meta-item">
                <strong>Start Date:</strong> {new Date(group.startMonth).toLocaleDateString()}
              </span>
              <span className="meta-item">
                <strong>Grace Period:</strong> {group.gracePeriodDays || 0} day{(group.gracePeriodDays || 0) === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          {adminStatus && (
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {group.closedAt && (
                <span style={{ color:'#2e7d32', fontWeight:600 }}>
                  Closed on {new Date(group.closedAt).toLocaleDateString()}
                </span>
              )}
              <button
                className="btn-secondary"
                onClick={() => navigate(`/groups/${id}/settings`)}
                style={{ padding: '8px 12px', fontSize: 14 }}
                title="Group Settings"
              >
                ⚙️ Settings
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="group-view-content">
        {/* Sidebar Navigation */}
        {sidebarVisible && (
          <div className="group-sidebar">
            <div className="sidebar-header">
              <h3>Navigation</h3>
              <button
                className="sidebar-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarVisible(false);
                }}
                style={{
                  padding: '4px 8px',
                  background: 'transparent',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  marginLeft: 'auto'
                }}
                title="Hide Sidebar"
              >
                ◀
              </button>
          </div>
            <nav className="sidebar-nav">
              {sections.map(section => (
                <button
                  key={section.id}
                  className={`sidebar-item ${activeSection === section.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveSection(section.id);
                    setSectionError({});
                    if (section.id !== 'overview') {
                      // For other sections, scroll to them
                      setTimeout(() => {
                        const sectionElement = document.querySelector(`[data-section="${section.id}"]`);
                        if (sectionElement) {
                          sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }, 100);
                    }
                  }}
                >
                  <span className="sidebar-icon">{section.icon}</span>
                  <span className="sidebar-label">{section.label}</span>
                </button>
              ))}
            </nav>
        </div>
      )}
        
        {/* Show Sidebar Button when hidden */}
        {!sidebarVisible && (
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarVisible(true)}
            style={{
              position: 'sticky',
              top: '20px',
              alignSelf: 'flex-start',
              padding: '8px 12px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '18px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              marginRight: '20px'
            }}
            title="Show Sidebar"
          >
            ▶
          </button>
        )}

      {/* Main Content */}
      <div className="group-main-content">
        {/* Group Organizer Info - Only in overview */}
        {(activeSection === 'overview') && group.createdBy && (typeof group.createdBy === 'object' || typeof group.createdBy === 'string') && (
        <div className="organizer-info-card">
          <h3>Group Organizer</h3>
          <div className="organizer-grid">
            <div className="organizer-item">
              <div className="info-label">Name</div>
              <div className="info-value">{group.createdBy?.name || 'N/A'}</div>
            </div>
            <div className="organizer-item">
              <div className="info-label">Email</div>
              <div className="info-value">{group.createdBy?.email || 'N/A'}</div>
            </div>
            <div className="organizer-item">
              <div className="info-label">Contact Number</div>
              <div className="info-value">{getFieldFrom(group.createdBy, 'contactNumber', 'Not provided')}</div>
            </div>
            <div className="organizer-item">
              <div className="info-label">Emergency Contact Name</div>
              <div className="info-value">{getFieldFrom(group.createdBy, 'emergencyContactName', 'Not provided')}</div>
            </div>
            <div className="organizer-item">
              <div className="info-label">Emergency Contact Number</div>
              <div className="info-value">{getFieldFrom(group.createdBy, 'emergencyContactNumber', 'Not provided')}</div>
            </div>
            <div className="organizer-item">
              <div className="info-label">UPI ID</div>
              <div className="info-value">{getFieldFrom(group.createdBy, 'upiId', 'Not provided')}</div>
            </div>
          </div>
        </div>
      )}

      {!memberStatus && user?.role !== 'organizer' && (
        <div className="join-section">
          <h3>Join This Group</h3>
          <p>Provide your payout account details to join this group</p>
          <div className="join-form">
            <input
              type="text"
              placeholder="Bank account / UPI / Payment details"
              value={payoutAccount}
              onChange={(e) => setPayoutAccount(e.target.value)}
            />
            <button className="btn-primary" onClick={join}>
              Join Group
            </button>
          </div>
        </div>
      )}

        {/* 1. Members Section - First in navigation order */}
        {(activeSection === 'overview' || activeSection === 'members') && (
          <div className="members-section" data-section="members">
            {sectionError.members && (
              <div className="error-message" style={{ marginBottom: 20 }}>
                {sectionError.members}
        </div>
      )}
        <h2>Members ({group.members?.length || 0})</h2>
        {adminStatus && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f0f8ff', border: '1px solid #b3d9ff', borderRadius: 8, fontSize: 14 }}>
            <strong>Admin Tools:</strong> Members who haven't paid for 2 consecutive months can be locked. Locked members can view the group but cannot upload payment proofs.
          </div>
        )}
        <div className="members-grid">
              {sortedMembers.map((member, idx) => {
                const memberId = member.user?._id || member.user;
                const memberIdStr = String(memberId);
                const lockInfo = memberLockStatus[memberIdStr] || {};
                const shouldBeLockable = lockInfo.shouldBeLockable === true;
                const isLocked = member.isLocked === true;
                
                return (
            <div key={member._id || idx} className="member-card" style={{ position: 'relative' }}>
              {isLocked && (
                <div style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  padding: '4px 8px',
                  background: '#e74c3c',
                  color: 'white',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600
                }}>
                  🔒 LOCKED
                </div>
              )}
              <div className="member-avatar">
                {(member.user?.name?.[0] || 'U').toUpperCase()}
              </div>
              <div className="member-info">
                <div className="member-name">{member.user?.name || 'Unknown'}</div>
                    <div className="member-email">{member.user?.email || member.invitedEmail || ''}</div>
                    {typeof member.turnPosition === 'number' && (
                      <div className="member-turn-chip">Turn #{member.turnPosition}</div>
                    )}
                    {shouldBeLockable && !isLocked && adminStatus && (
                      <div style={{ marginTop: 8, padding: 8, background: '#fff3cd', borderRadius: 4, fontSize: 12, color: '#856404' }}>
                        ⚠️ Missed {lockInfo.consecutiveMissed || 2} consecutive payments
                      </div>
                    )}
                {(() => {
                  const mUser = member.user;
                  const resolvedContact = getFieldFrom(mUser, 'contactNumber', '');
                  const resolvedEmergencyName = getFieldFrom(mUser, 'emergencyContactName', '');
                  const resolvedEmergencyNumber = getFieldFrom(mUser, 'emergencyContactNumber', '');
                  const resolvedUpi = getFieldFrom(mUser, 'upiId', '');
                  return (
                    <>
                      {resolvedContact && (
                        <div className="member-contact">Contact: {resolvedContact}</div>
                      )}
                      {resolvedEmergencyName && (
                        <div className="member-emergency">Emergency Name: {resolvedEmergencyName}</div>
                      )}
                      {resolvedEmergencyNumber && (
                        <div className="member-emergency">Emergency Contact: {resolvedEmergencyNumber}</div>
                      )}
                      {adminStatus && resolvedUpi && (
                        <div className="member-upi" style={{ color: '#2e7d32', fontWeight: 600 }}>UPI ID: {resolvedUpi}</div>
                      )}
                    </>
                  );
                })()}
                {member.payoutAccount && (
                  <div className="member-account">Payout Account: {member.payoutAccount}</div>
                )}
                {adminStatus && (
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>
                      Lock Member
                    </div>
                    <button
                      className={`toggle-button ${isLocked ? 'toggle-on' : 'toggle-off'}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Use the member subdocument _id (MongoDB subdocument ID)
                        const memberDocId = member._id ? String(member._id) : null;
                        if (memberDocId) {
                          toggleMemberLock(memberDocId, isLocked);
                        } else {
                          console.error('Member ID not found', member);
                          setError('Unable to find member ID');
                        }
                      }}
                      type="button"
                      style={{
                        position: 'relative',
                        width: '50px',
                        height: '26px',
                        border: 'none',
                        borderRadius: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        outline: 'none',
                        padding: 0,
                        background: isLocked ? '#667eea' : '#ccc'
                      }}
                    >
                      <span style={{
                        position: 'absolute',
                        top: '2px',
                        left: '2px',
                        width: '22px',
                        height: '22px',
                        background: 'white',
                        borderRadius: '50%',
                        transition: 'all 0.3s',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                        transform: isLocked ? 'translateX(24px)' : 'translateX(0)'
                      }}></span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
                    </div>
        )}

        {/* 2. Turn Order Section - Second in navigation order */}
        {(activeSection === 'overview' || activeSection === 'turn-order') && (
          <div className="turn-order-section" data-section="turn-order">
            <div className="turn-order-header">
              <div>
                <h2>Turn Order</h2>
                <div className="turn-order-policy">
                  Policy: {group.turnOrderPolicy === 'randomized' ? 'Randomized' : group.turnOrderPolicy === 'admin_approval' ? 'Admin Approval' : 'Fixed'}
                </div>
              </div>
              <div className="turn-order-badge">
                {turnSchedule.length} slot{turnSchedule.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="turn-order-grid">
              {turnSchedule.length === 0 ? (
                <div className="turn-order-empty">
                  Turn order details will appear once members are organized.
                </div>
              ) : (
                turnSchedule.map(entry => {
                  const displayName = entry.member?.user?.name || entry.plannedName || 'Name pending';
                  const displayEmail = entry.member?.user?.email || entry.plannedEmail || entry.member?.invitedEmail || 'Email pending';
                  const statusLabel = entry.status === 'joined' ? 'Joined' : entry.status === 'accepted' ? 'Accepted' : entry.status === 'declined' ? 'Declined' : 'Invited';
                  return (
                    <div key={`turn-${entry.position}-${displayEmail}`} className="turn-order-card">
                      <div className="turn-order-rank">{entry.position}</div>
                      <div className="turn-order-info">
                        <div className="turn-order-name">{displayName}</div>
                        <div className="turn-order-email">{displayEmail}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {group.turnOrderPolicy === 'randomized' && turnSchedule.length > 0 && (
              <div className="turn-order-note">
                This order was generated randomly during group setup.
              </div>
            )}
            {group.turnOrderPolicy === 'fixed' && adminStatus && (
              <div className="turn-order-note">
                Drag-and-drop order was finalized during group creation. Contact support to adjust if needed.
          </div>
        )}
      </div>
        )}

        {/* 3. Payment Cycles Section - Third in navigation order */}
        {(activeSection === 'overview' || activeSection === 'cycles') && (
          <div className="cycles-section" data-section="cycles">
        <h2>Payment Cycles</h2>
        <div style={{ display: 'block' }}>
          {cycles.map(cycle => {
            const status = getPaymentStatus(cycle);
            const isOpen = openCycle === cycle._id;
            const paidCount = cycle.payments?.filter(p => p.status === 'paid').length || 0;
            return (
              <div key={cycle._id} style={{ border: '1px solid #eee', borderRadius: 8, background: '#fff', marginBottom: 10 }}>
                <button
                  onClick={() => setOpenCycle(isOpen ? null : cycle._id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '12px 14px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>Month {cycle.monthIndex + 1}</div>
                    <div style={{ fontSize: 13, color: '#666' }}>
                      Due: {new Date(cycle.dueDate).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: 13, color: '#444' }}>
                          Paid: {paidCount} / {group.members?.length || 0}
                    </div>
                    </div>
                      <span className="status-badge" style={{ 
                        backgroundColor: status.color
                      }}>
                    {status.label}
                  </span>
                </button>
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 14px' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>
                            <th style={{ padding: '8px 6px' }}>Member</th>
                            <th style={{ padding: '8px 6px' }}>Email</th>
                            <th style={{ padding: '8px 6px' }}>Status</th>
                            <th style={{ padding: '8px 6px' }}>Proof</th>
                                <th style={{ padding: '8px 6px' }}>Amount</th>
                            {adminStatus && <th style={{ padding: '8px 6px' }}>Action</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {group.members?.map((m, idx) => {
                            const payment = cycle.payments?.find(p => {
                              const pid = p.member?._id || p.member;
                              const mid = m.user?._id || m.user;
                              return String(pid) === String(mid);
                            });
                            const paid = payment?.status === 'paid';
                            return (
                              <tr key={(m._id || m.user?._id || idx) + '-row'}>
                                <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>
                                  {m.user?.name || 'Member'}
                                </td>
                                <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3', color: '#666' }}>
                                  {m.user?.email || ''}
                                </td>
                                <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>
                                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: paid ? '#e8f8f0' : payment ? '#fff3e6' : '#f0f0f0', color: paid ? '#2e7d32' : '#8a6d3b' }}>
                                        {paid ? 'Paid' : payment ? 'Pending' : 'No record'}
                                    </span>
                                </td>
                                <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>
                                  {payment?.proofUrl ? (
                                    <a
                                      href={`${fileBase}${payment.proofUrl}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="proof-link"
                                    >
                                      View Proof
                                    </a>
                                      ) : <span style={{ color: '#999' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>
                                      {group.currency} {Number(payment?.amount || group.monthlyContribution).toLocaleString()}
                                      {payment?.penaltyAmount > 0 && (
                                        <span style={{ color: '#e74c3c', fontSize: 11, marginLeft: 8 }}>
                                          (+{group.currency} {payment.penaltyAmount.toFixed(2)} penalty)
                                        </span>
                                  )}
                                </td>
                                {adminStatus && (
                                  <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>
                                        {payment && payment.status === 'pending' ? (
                                          <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                          className="btn-primary"
                                              onClick={() => approvePayment(cycle._id, payment._id)}
                                              style={{ padding: '4px 8px', fontSize: 12 }}
                                        >
                                          Approve
                                        </button>
                                        <button
                                          className="btn-secondary"
                                              onClick={() => rejectPayment(cycle._id, payment._id)}
                                              style={{ padding: '4px 8px', fontSize: 12 }}
                                            >
                                              Reject
                                        </button>
                                      </div>
                                    ) : <span style={{ color: '#999' }}>—</span>}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {memberStatus && !hasPaid(cycle) && (() => {
                      // Check if current member is locked
                      const currentMember = group.members?.find(m => {
                        const mid = m.user?._id || m.user;
                        const uid = user?.id || user?._id;
                        return String(mid) === String(uid);
                      });
                      const isLocked = currentMember?.isLocked === true;
                      
                      return isLocked ? (
                        <div style={{ 
                          marginTop: 14, 
                          padding: '12px', 
                          background: '#fff3cd', 
                          border: '1px solid #ffc107', 
                          borderRadius: '8px',
                          color: '#856404'
                        }}>
                          <strong>⚠️ Account Locked</strong>
                          <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
                            Your account has been locked due to missed payments. Please contact the group admin.
                          </p>
                        </div>
                      ) : (
                        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => {
                              setFile(e.target.files[0]);
                              setSelectedCycle(cycle._id);
                            }}
                            className="file-input"
                          />
                          <button
                            className="btn-pay"
                            onClick={() => pay(cycle._id)}
                            disabled={!file || selectedCycle !== cycle._id}
                          >
                            Upload & Pay
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
        )}


        {(activeSection === 'overview' || activeSection === 'cycles') && memberStatus && (
        <div className="ledger-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2>Your Member Ledger</h2>
            <button
              className="btn-primary"
              onClick={async () => {
                try {
                  const res = await API.get(`/groups/${id}/member-ledger`);
                  if (res.data.ledgerText) {
                    // Generate PDF from text
                    const pdf = new jsPDF();
                    const lines = res.data.ledgerText.split('\n');
                    const pageHeight = pdf.internal.pageSize.height;
                    const pageWidth = pdf.internal.pageSize.width;
                    const margin = 20;
                    const lineHeight = 7;
                    let y = margin;
                    const maxWidth = pageWidth - (2 * margin);
                    
                    pdf.setFontSize(16);
                    pdf.setFont(undefined, 'bold');
                    pdf.text('MEMBER LEDGER REPORT', pageWidth / 2, y, { align: 'center' });
                    y += lineHeight * 2;
                    
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    
                    lines.forEach((line, index) => {
                      if (y > pageHeight - margin - lineHeight) {
                        pdf.addPage();
                        y = margin;
                      }
                      
                      // Handle headers and separators
                      if (line.includes('===') || line.includes('---')) {
                        y += lineHeight * 0.5;
                        return;
                      }
                      
                      // Bold headers
                      if (line.trim() && line === line.toUpperCase() && line.length < 50 && !line.includes(':')) {
                        pdf.setFont(undefined, 'bold');
                        pdf.setFontSize(12);
                        pdf.text(line.trim(), margin, y);
                        pdf.setFont(undefined, 'normal');
                        pdf.setFontSize(10);
                        y += lineHeight * 1.5;
                      } else if (line.trim()) {
                        // Regular text - split if too long
                        const textLines = pdf.splitTextToSize(line, maxWidth);
                        textLines.forEach(textLine => {
                          if (y > pageHeight - margin - lineHeight) {
                            pdf.addPage();
                            y = margin;
                          }
                          pdf.text(textLine, margin, y);
                          y += lineHeight;
                        });
                      } else {
                        y += lineHeight * 0.5;
                      }
                    });
                    
                    const safeGroupName = (group.name || 'group').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const safeMemberName = (user?.name || 'member').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    pdf.save(`member-ledger-${safeGroupName}-${safeMemberName}-${Date.now()}.pdf`);
                  }
                } catch (err) {
                  alert(err.response?.data?.message || 'Failed to download member ledger');
                }
              }}
              style={{ padding: '8px 16px', fontSize: 14 }}
            >
              📥 Download Ledger
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>
                  <th style={{ padding: '8px 6px' }}>Month</th>
                  <th style={{ padding: '8px 6px' }}>Due Date</th>
                  <th style={{ padding: '8px 6px' }}>Status</th>
                  <th style={{ padding: '8px 6px' }}>Proof</th>
                  <th style={{ padding: '8px 6px' }}>Amount</th>
                  <th style={{ padding: '8px 6px' }}>Penalties</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map(c => {
                  const rec = c.payments?.find(p => {
                    const pid = p.member?._id || p.member;
                    return String(pid) === String(user?.id || user?._id);
                  });
                  return (
                    <tr key={c._id}>
                      <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>Month {c.monthIndex + 1}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>{new Date(c.dueDate).toLocaleDateString()}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: rec?.status === 'paid' ? '#e8f8f0' : rec ? '#fff3e6' : '#f0f0f0', color: rec?.status === 'paid' ? '#2e7d32' : '#8a6d3b' }}>
                          {rec ? (rec.status === 'paid' ? 'Paid' : 'Pending') : 'No record'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>
                        {rec?.proofUrl ? (
                          <a
                            href={`${fileBase}${rec.proofUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="proof-link"
                          >
                            View Proof
                          </a>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>
                        {group.currency} {Number(rec?.amount || group.monthlyContribution).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px dashed #f3f3f3' }}>
                        {rec?.penaltyAmount > 0 ? (
                          <span style={{ color: '#e74c3c', fontSize: 12 }}>
                            {group.currency} {rec.penaltyAmount.toFixed(2)} ({rec.penaltyDays} day{rec.penaltyDays === 1 ? '' : 's'})
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

        {/* 4. Payout Info Section - Fourth in navigation order */}
        {(activeSection === 'overview' || activeSection === 'payout') && (
          <div className="payout-info-section" data-section="payout">
            {sectionError.payout && (
              <div className="error-message" style={{ marginBottom: 20 }}>
                {sectionError.payout}
              </div>
            )}
            <h2>Payout Information</h2>
        {adminStatus && (group.turnOrderPolicy === 'admin_approval' || group.turnOrderPolicy === 'randomized') && (
          <div className="payout-assign-form" style={{ 
            background: '#f8f9fa', 
            padding: '20px', 
            borderRadius: '12px', 
            marginBottom: '24px',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', color: '#333' }}>Assign Payout</h3>
            <div className="payout-form-row" style={{ 
              display: 'flex', 
              gap: '16px', 
              alignItems: 'flex-end',
              flexWrap: 'wrap'
            }}>
              <div className="form-field" style={{ flex: '1', minWidth: '200px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#555' }}>Month Cycle</label>
                <select
                  value={payoutCycleId}
                  onChange={(e) => setPayoutCycleId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Select cycle</option>
                  {cycles.map(c => (
                    <option key={c._id} value={c._id}>
                      Month {c.monthIndex + 1} - {new Date(c.dueDate).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field" style={{ flex: '1', minWidth: '200px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#555' }}>Recipient</label>
                <select
                  value={payoutRecipientId}
                  onChange={(e) => setPayoutRecipientId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Select member</option>
                  {group.members?.map(m => (
                    <option key={m._id || m.user?._id || m.user} value={m.user?._id || m.user}>
                      {m.user?.name || 'Unknown'} ({m.user?.email || ''})
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn-primary"
                onClick={assignPayout}
                disabled={!payoutCycleId || !payoutRecipientId || assigningPayout}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: 'none',
                  cursor: assigningPayout || !payoutCycleId || !payoutRecipientId ? 'not-allowed' : 'pointer',
                  opacity: assigningPayout || !payoutCycleId || !payoutRecipientId ? 0.6 : 1,
                  whiteSpace: 'nowrap'
                }}
              >
                {assigningPayout ? 'Assigning...' : 'Assign Payout'}
              </button>
            </div>
          </div>
        )}
        <div style={{ display: 'block' }}>
          {cycles.map(cycle => {
            // For fixed/random policies, get recipient from plannedMembers based on position
            // But also check cycle.payoutRecipient if it's set
            let recipient = cycle.payoutRecipient;
            let recipientName = 'Not assigned';
            let recipientEmail = '';
            
            // First, try to get from cycle.payoutRecipient if it's set (for fixed turn order)
            if (recipient && (group.turnOrderPolicy === 'fixed' || group.turnOrderPolicy === 'randomized')) {
              const recipientMember = group.members?.find(m => {
                const mid = m.user?._id || m.user;
                const rid = recipient?._id || recipient;
                return String(mid) === String(rid);
              });
              if (recipientMember?.user) {
                recipientName = recipientMember.user.name || 'Unknown';
                recipientEmail = recipientMember.user.email || '';
              } else if (recipient?.name) {
                recipientName = recipient.name;
                recipientEmail = recipient.email || '';
              }
            }
            
            // If not found from payoutRecipient, try plannedMembers (for fixed/randomized)
            if (recipientName === 'Not assigned' && (group.turnOrderPolicy === 'fixed' || group.turnOrderPolicy === 'randomized') && Array.isArray(group.plannedMembers)) {
              const plannedMember = group.plannedMembers.find(pm => pm.position === cycle.monthIndex + 1);
              if (plannedMember) {
                recipientName = plannedMember.name || 'Name pending';
                recipientEmail = plannedMember.email || '';
                // If member has joined, get their actual user info
                const joinedMember = group.members?.find(m => {
                  const mid = m.user?._id || m.user;
                  const pmid = plannedMember.user?._id || plannedMember.user;
                  return String(mid) === String(pmid) || 
                         (m.user?.email?.toLowerCase() === plannedMember.email?.toLowerCase());
                });
                if (joinedMember?.user) {
                  recipientName = joinedMember.user.name || recipientName;
                  recipientEmail = joinedMember.user.email || recipientEmail;
                }
              }
            }
            
            // For admin_approval or if still not found, check cycle.payoutRecipient
            if (recipientName === 'Not assigned') {
              const recipientMember = group.members?.find(m => {
                const mid = m.user?._id || m.user;
                const rid = recipient?._id || recipient;
                return String(mid) === String(rid);
              });
              if (recipientMember?.user) {
                recipientName = recipientMember.user.name || 'Unknown';
                recipientEmail = recipientMember.user.email || '';
              } else if (recipient?.name) {
                recipientName = recipient.name;
                recipientEmail = recipient.email || '';
              }
            }
            
            const isOpen = openPayoutCycle === cycle._id;
  return (
              <div key={cycle._id} style={{ border: '1px solid #eee', borderRadius: 8, background: '#fff', marginBottom: 10 }}>
                <button
                  onClick={() => setOpenPayoutCycle(isOpen ? null : cycle._id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '12px 14px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>Month {cycle.monthIndex + 1}</div>
                    <div style={{ fontSize: 13, color: '#666' }}>
                      Due: {new Date(cycle.dueDate).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: 13, color: '#444' }}>
                      Recipient: <b>{recipientName}</b>
                      {recipientEmail && ` (${recipientEmail})`}
                    </div>
                  </div>
                  <span className="status-badge" style={{ 
                    backgroundColor: cycle.payoutExecuted ? '#2ecc71' : '#f39c12',
                    color: 'white'
                  }}>
                    {cycle.payoutExecuted ? 'Executed' : 'Pending'}
                  </span>
                </button>
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 14px' }}>
                    <div className="payout-info-details">
                      <div className="payout-info-item">
                        <span className="payout-info-label">Due Date:</span>
                        <span>{new Date(cycle.dueDate).toLocaleDateString()}</span>
                      </div>
                      <div className="payout-info-item">
                        <span className="payout-info-label">Recipient:</span>
                        <span>
                          {recipientName}
                          {recipientEmail && ` (${recipientEmail})`}
                        </span>
                      </div>
                      {cycle.payoutProof && (
                        <div className="payout-info-item">
                          <span className="payout-info-label">Proof:</span>
                          <a
                            href={`${fileBase}${cycle.payoutProof}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="proof-link"
                          >
                            View Proof
                          </a>
                        </div>
                      )}
                      {adminStatus && (
                        <div className="payout-info-item" style={{ marginTop: 12 }}>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => {
                              setPayoutProofFile(e.target.files[0]);
                              setSelectedPayoutCycle(cycle._id);
                            }}
                            className="file-input"
                            style={{ marginRight: 8 }}
                          />
                          <button
                            className="btn-primary"
                            onClick={() => executePayoutWithProof(cycle._id)}
                            disabled={!payoutProofFile || selectedPayoutCycle !== cycle._id || executingPayout}
                            style={{ padding: '6px 12px', fontSize: 13 }}
                          >
                            {executingPayout ? 'Uploading...' : cycle.payoutExecuted ? 'Update Proof' : 'Upload Proof & Execute'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
          </div>
        )}

        {/* 5. Performance Section - Fifth in navigation order */}
        {(activeSection === 'overview' || activeSection === 'performance') && (
        <div className="performance-section" data-section="performance">
          <h2>Member Performance</h2>
          <div className="performance-table-container">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Total Payments</th>
                  <th>On-Time Payments</th>
                  <th>Late Payments</th>
                  <th>Total Late Days</th>
                  <th>Penalties</th>
                  <th>Streaks</th>
                  <th>Performance Score</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((member, idx) => {
                  const memberId = member.user?._id || member.user;
                  // Get all cycles sorted by monthIndex (chronological order)
                  const sortedCycles = [...cycles].sort((a, b) => (a.monthIndex || 0) - (b.monthIndex || 0));
                  
                  // For each cycle, check if member paid correctly (within grace period, no penalty)
                  // Only check cycles that have passed their due date or have payments
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  const cyclePayments = sortedCycles.map(c => {
                    const payment = (c.payments || []).find(p => {
                      const pid = p.member?._id || p.member;
                      return String(pid) === String(memberId) && p.status === 'paid';
                    });
                    
                    // Check if cycle due date has passed
                    const dueDate = c.dueDate ? new Date(c.dueDate) : null;
                    const cycleHasPassed = dueDate && dueDate <= today;
                    
                    // Payment is correct if: exists, status is 'paid', no penalty days, no penalty amount
                    const paidCorrectly = payment && 
                                         payment.status === 'paid' && 
                                         (payment.penaltyDays || 0) === 0 && 
                                         (payment.penaltyAmount || 0) === 0;
                    
                    // If cycle hasn't passed yet and no payment, don't count it (not yet due)
                    // If cycle has passed and no payment, that breaks the streak
                    const shouldCount = cycleHasPassed || payment !== undefined;
                    
                    return {
                      monthIndex: c.monthIndex || 0,
                      paidCorrectly: paidCorrectly,
                      payment: payment,
                      shouldCount: shouldCount,
                      cycleHasPassed: cycleHasPassed
                    };
                  });
                  
                  // Calculate current streak (consecutive correct payments from most recent)
                  // Start from the most recent cycle and count backwards
                  // Only count cycles that should be counted (have passed or have payments)
                  let currentStreak = 0;
                  for (let i = cyclePayments.length - 1; i >= 0; i--) {
                    const cp = cyclePayments[i];
                    if (!cp.shouldCount) {
                      // Skip cycles that haven't passed yet and have no payment
                      continue;
                    }
                    if (cp.paidCorrectly) {
                      currentStreak++;
                    } else {
                      // If payment is missing or incorrect, streak breaks
                      break;
                    }
                  }
                  
                  // Calculate longest streak (best streak ever achieved)
                  let longestStreak = 0;
                  let tempStreak = 0;
                  cyclePayments.forEach(cp => {
                    if (cp.paidCorrectly) {
                      tempStreak++;
                      longestStreak = Math.max(longestStreak, tempStreak);
                    } else {
                      tempStreak = 0; // Reset streak on missed or incorrect payment
                    }
                  });
                  
                  // Get payments for other calculations
                  const memberPaymentsByCycle = cyclePayments
                    .filter(cp => cp.payment)
                    .map(cp => cp.payment);
                  
                  const memberPayments = memberPaymentsByCycle;
                  // Count payments: on-time = no penalty, late = has penalty
                  // Total payments = on-time + late (assuming all members complete payments for all cycles)
                  const onTimePayments = memberPayments.filter(p => (p.penaltyDays || 0) === 0 && (p.penaltyAmount || 0) === 0).length;
                  const latePayments = memberPayments.filter(p => (p.penaltyDays || 0) > 0 || (p.penaltyAmount || 0) > 0).length;
                  const totalPayments = onTimePayments + latePayments; // Total = On-time + Late
                  const totalLateDays = memberPayments.reduce((sum, p) => sum + (p.penaltyDays || 0), 0); // Total late days (not late payment count)
                  const totalPenalties = memberPayments.reduce((sum, p) => sum + (p.penaltyAmount || 0), 0);
                  const performanceScore = totalPayments > 0 
                    ? Math.round((onTimePayments / totalPayments) * 100)
                    : 0;
                  return { member, idx, totalPayments, onTimePayments, latePayments, totalLateDays, totalPenalties, performanceScore, currentStreak, longestStreak };
                })
                .sort((a, b) => {
                  // Primary sort: by total late days (lower is better)
                  if (a.totalLateDays !== b.totalLateDays) {
                    return a.totalLateDays - b.totalLateDays;
                  }
                  // Secondary sort: by performance score (higher is better)
                  if (b.performanceScore !== a.performanceScore) {
                    return b.performanceScore - a.performanceScore;
                  }
                  // Tertiary sort: by on-time payments (higher is better)
                  return b.onTimePayments - a.onTimePayments;
                })
                .map(({ member, idx, totalPayments, onTimePayments, latePayments, totalLateDays, totalPenalties, performanceScore, currentStreak, longestStreak }, sortedIdx) => (
                  <tr key={member._id || idx}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="member-avatar-small">
                          {(member.user?.name?.[0] || 'U').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 500 }}>{member.user?.name || 'Unknown'}</span>
                            {sortedIdx === 0 && totalPayments > 0 && (
                              <span style={{ 
                                fontSize: 11, 
                                padding: '2px 6px', 
                                background: '#f39c12', 
                                color: 'white', 
                                borderRadius: 10,
                                fontWeight: 600
                              }}>
                                🏆 Leader
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: '#666' }}>{member.user?.email || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td>{totalPayments}</td>
                    <td style={{ color: '#2ecc71', fontWeight: 600 }}>{onTimePayments}</td>
                    <td style={{ color: latePayments > 0 ? '#e74c3c' : '#666' }}>{latePayments}</td>
                    <td style={{ color: totalLateDays > 0 ? '#e74c3c' : '#666', fontWeight: totalLateDays > 0 ? 600 : 'normal' }}>
                      {totalLateDays > 0 ? totalLateDays : '—'}
                    </td>
                    <td style={{ color: totalPenalties > 0 ? '#e74c3c' : '#666' }}>
                      {totalPenalties > 0 ? `${group.currency} ${totalPenalties.toFixed(2)}` : '—'}
                    </td>
                    <td>
                      <div className="streak-cell">
                        <div className="streak-row">
                          <span className="streak-label">Current</span>
                          {currentStreak > 0 ? (
                            <span className="streak-value">
                              {currentStreak}
                            </span>
                          ) : (
                            <span className="streak-none">—</span>
                          )}
                        </div>
                        <div className="streak-row">
                          <span className="streak-label">Best</span>
                          {longestStreak > 0 ? (
                            <span className="streak-value best">
                              {longestStreak}
                            </span>
                          ) : (
                            <span className="streak-none">—</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ 
                          width: 60, 
                          height: 8, 
                          background: '#e0e0e0', 
                          borderRadius: 4,
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${performanceScore}%`,
                            height: '100%',
                            background: performanceScore >= 80 ? '#2ecc71' : performanceScore >= 60 ? '#f39c12' : '#e74c3c',
                            transition: 'width 0.3s'
                          }}></div>
                        </div>
                        <span style={{ 
                          fontWeight: 600,
                          color: performanceScore >= 80 ? '#2ecc71' : performanceScore >= 60 ? '#f39c12' : '#e74c3c'
                        }}>
                          {performanceScore}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

      {error && <div className="error-message">{error}</div>}

        {/* Disputes Section - For all members (non-admin) */}
        {(activeSection === 'overview' || activeSection === 'disputes') && memberStatus && !adminStatus && (
        <div className="disputes-section" data-section="disputes">
          {sectionError.disputes && (
            <div className="error-message" style={{ marginBottom: 20 }}>
              {sectionError.disputes}
            </div>
          )}
          <h2>Raise a Dispute</h2>
          <p style={{ color: '#666', marginBottom: 20 }}>
            If you have any concerns or issues, please raise a dispute. The admin will be notified and can respond.
          </p>
          <form onSubmit={createDispute} className="dispute-form">
            <div className="form-group">
              <label>Subject</label>
              <input
                type="text"
                value={disputeSubject}
                onChange={(e) => setDisputeSubject(e.target.value)}
                placeholder="Brief description of the issue"
                required
                disabled={loadingDisputes}
              />
          </div>
            <div className="form-group">
              <label>Message</label>
              <textarea
                value={disputeMessage}
                onChange={(e) => setDisputeMessage(e.target.value)}
                placeholder="Describe your concern in detail..."
                rows={5}
                required
                disabled={loadingDisputes}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loadingDisputes || !disputeSubject.trim() || !disputeMessage.trim()}>
              {loadingDisputes ? 'Submitting...' : 'Submit Dispute'}
            </button>
          </form>

          <h3 style={{ marginTop: 40 }}>Raised Queries</h3>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
            View all disputes raised by members and their responses.
          </p>
          {loadingDisputes ? (
            <div>Loading disputes...</div>
          ) : disputes.length === 0 ? (
            <div style={{ color: '#666', padding: 20 }}>No disputes raised yet.</div>
          ) : (
            <div className="disputes-list">
              {disputes.map(dispute => {
                const isMyDispute = String(dispute.raisedBy?._id || dispute.raisedBy) === String(user?.id || user?._id);
                return (
                  <div key={dispute._id} className="dispute-card">
                    <div className="dispute-header">
                      <div>
                        <h4>{dispute.subject}</h4>
                        <span className={`status-badge ${dispute.status}`}>
                          {dispute.status}
                        </span>
                        {isMyDispute && (
                          <span style={{ fontSize: 12, color: '#667eea', marginLeft: 8, fontWeight: 600 }}>
                            (My Dispute)
                          </span>
                        )}
                        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                          Raised by: {dispute.raisedBy?.name || 'Unknown'} ({dispute.raisedBy?.email || ''})
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        {new Date(dispute.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="dispute-messages">
                      {dispute.messages?.map((msg, idx) => {
                        const isFromMe = String(msg.from?._id || msg.from) === String(user?.id || user?._id);
                        return (
                          <div key={idx} className={`dispute-message ${isFromMe ? 'from-me' : 'from-other'}`}>
                            <div className="message-header">
                              <strong>{msg.from?.name || 'Unknown'}</strong>
                              <span style={{ fontSize: 11, color: '#999' }}>
                                {new Date(msg.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="message-content">{msg.message}</div>
                          </div>
                        );
                      })}
                    </div>
                    {dispute.status === 'open' && isMyDispute && (
                      <div className="dispute-reply">
                        <textarea
                          value={disputeReplyMessage}
                          onChange={(e) => setDisputeReplyMessage(e.target.value)}
                          placeholder="Add a reply..."
                          rows={3}
                        />
          <button
            className="btn-primary"
                        onClick={() => sendDisputeReply(dispute._id)}
                        disabled={!disputeReplyMessage.trim() || loadingDisputes}
          >
                        Send Reply
          </button>
        </div>
      )}
                    {dispute.status === 'resolved' && (
                      <div style={{ 
                        marginTop: 12, 
                        padding: 12, 
                        background: '#d4edda', 
                        borderRadius: 8,
                        color: '#155724',
                        fontSize: 14,
                        fontWeight: 500
                      }}>
                        ✓ This dispute has been resolved
                      </div>
                    )}
    </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* Dispute Management Section - For admin - Show in overview */}
        {(activeSection === 'overview' || activeSection === 'admin-disputes') && adminStatus && (
        <div className="disputes-section" data-section="admin-disputes">
          {sectionError['admin-disputes'] && (
            <div className="error-message" style={{ marginBottom: 20 }}>
              {sectionError['admin-disputes']}
            </div>
          )}
          <h2>Raised Queries</h2>
          <p style={{ color: '#666', marginBottom: 20 }}>
            View and respond to disputes raised by members.
          </p>
          {loadingDisputes ? (
            <div>Loading disputes...</div>
          ) : disputes.length === 0 ? (
            <div style={{ color: '#666', padding: 20 }}>No disputes to manage.</div>
          ) : (
            <div className="disputes-list">
              {disputes.map(dispute => (
                <div key={dispute._id} className="dispute-card">
                  <div className="dispute-header">
                    <div>
                      <h4>{dispute.subject}</h4>
                      <span className={`status-badge ${dispute.status}`}>
                        {dispute.status}
                      </span>
                      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                        Raised by: {dispute.raisedBy?.name || 'Unknown'} ({dispute.raisedBy?.email || ''})
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      {new Date(dispute.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="dispute-messages">
                    {dispute.messages?.map((msg, idx) => {
                      const isFromMe = String(msg.from?._id || msg.from) === String(user?.id || user?._id);
  return (
                        <div key={idx} className={`dispute-message ${isFromMe ? 'from-me' : 'from-other'}`}>
                          <div className="message-header">
                            <strong>{msg.from?.name || 'Unknown'}</strong>
                            <span style={{ fontSize: 11, color: '#999' }}>
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="message-content">{msg.message}</div>
                        </div>
                      );
                    })}
                  </div>
                  {dispute.status === 'open' && (
                    <div className="dispute-reply">
                      <textarea
                        value={disputeReplyMessage}
                        onChange={(e) => setDisputeReplyMessage(e.target.value)}
                        placeholder="Add your response to this dispute..."
                        rows={3}
                      />
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          className="btn-primary"
                          onClick={() => sendDisputeReply(dispute._id)}
                          disabled={!disputeReplyMessage.trim() || loadingDisputes}
                        >
                          Send Response
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => resolveDispute(dispute._id)}
                          disabled={loadingDisputes}
                          style={{ background: '#6c757d', color: 'white' }}
                        >
                          Mark Resolved
                        </button>
                      </div>
                    </div>
                  )}
                  {dispute.status === 'resolved' && (
                    <div style={{ 
                      marginTop: 12, 
                      padding: 12, 
                      background: '#d4edda', 
                      borderRadius: 8,
                      color: '#155724',
                      fontSize: 14,
                      fontWeight: 500
                    }}>
                      ✓ This dispute has been resolved
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        )}



        </div>
      </div>
    </div>
  );
}
