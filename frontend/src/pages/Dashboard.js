import React, { useEffect, useState } from 'react';
import API from '../api';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import './Dashboard.css';

export default function Dashboard() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [user, setUser] = useState(null);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [userStreakMap, setUserStreakMap] = useState({});
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    // Verify token exists before making API calls
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    
    // Small delay to ensure everything is ready
    const timer = setTimeout(() => {
      load();
      // Load pending invitations (for members)
      loadInvites();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [navigate]);

  const load = async () => {
    // Double check token exists before making request
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('No token found, redirecting to login');
      navigate('/login', { replace: true });
      return;
    }
    
    setLoading(true);
    try {
      const res = await API.get('/groups');
      const groupList = res.data.groups || [];
      setGroups(groupList);
      setUserStreakMap({});
      calculateUserStreaks(groupList);
      if (groupList.length === 0) {
        showToast('No groups found. Create your first group!', 'info');
      }
    } catch (err) {
      console.error('Load groups error:', err);
      // Don't handle 401 here - let the API interceptor handle it
      // Just show error for other cases
      if (err.response?.status === 401) {
        // Token might be invalid, let interceptor handle redirect
        console.warn('401 error - token may be invalid');
      } else if (err.response?.status !== 401) {
        console.error('Failed to load groups:', err);
        showToast('Failed to load groups. Please try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadInvites = async () => {
    try {
      const res = await API.get('/notifications');
      const invites = (res.data.invitations || []).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const pendingInv = invites.filter(i => i.status === 'pending').length;
      setPendingInvites(pendingInv);
      const payments = (res.data.paymentSubmissions || [])
        .map(p => ({ ...p, type: 'pendingApproval', ts: new Date(p.submittedAt || 0).getTime() }))
        .sort((a,b) => b.ts - a.ts);
      const decisions = (res.data.myPaymentDecisions || [])
        .map(d => ({ ...d, type: 'decision', ts: new Date(d.decidedAt || 0).getTime() }))
        .sort((a,b) => b.ts - a.ts);
      setPendingPayments(payments.length);
      // Unread count using last seen timestamp
      const lastSeen = Number(localStorage.getItem('notif_last_seen_ts') || 0);
      const unread = [
        ...payments.filter(p => p.ts > lastSeen),
        ...decisions.filter(d => d.ts > lastSeen),
        ...invites.filter(i => new Date(i.createdAt || 0).getTime() > lastSeen)
      ].length;
      // Replace badge count with unread if any
      // We won't store unread separately; compute on render using notifications state if needed
      setNotifications([
        ...payments.slice(0, 3),
        ...decisions.slice(0, 3),
        ...invites.map(i => ({ ...i, type: 'invite' })).slice(0, 3)
      ]);
      // Attach unread count to state via DOM when rendering badge
    } catch (err) {
      // ignore invite errors silently
    }
  };

  const logout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      showToast('Logged out successfully', 'success');
      setTimeout(() => {
        navigate('/login');
      }, 500);
    }
  };

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resolveId = (entity) => {
    if (!entity) return null;
    if (typeof entity === 'string') return entity;
    if (typeof entity === 'object') {
      if (typeof entity.toHexString === 'function') return entity.toHexString();
      if (typeof entity.toString === 'function' && entity.toString() !== '[object Object]') {
        return entity.toString();
      }
      if (entity._id) return resolveId(entity._id);
      if (entity.id) return resolveId(entity.id);
    }
    return null;
  };

  const getCurrentUserId = () =>
    resolveId(user) || resolveId(JSON.parse(localStorage.getItem('user') || '{}'));

  const isUserMemberOfGroup = (group) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return group.members?.some(m => {
      const mid = resolveId(m.user);
      return mid && String(mid) === String(userId);
    }) || false;
  };

  const computeCurrentStreakFromCycles = (cycles, userId) => {
    const sortedCycles = [...(cycles || [])].sort((a, b) => (a.monthIndex || 0) - (b.monthIndex || 0));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cycleData = sortedCycles.map(c => {
      const payment = (c.payments || []).find(p => {
        const pid = resolveId(p.member?._id || p.member);
        return pid && String(pid) === String(userId) && p.status === 'paid';
      });
      const dueDate = c.dueDate ? new Date(c.dueDate) : null;
      if (dueDate) dueDate.setHours(0, 0, 0, 0);
      const cycleHasPassed = !dueDate || dueDate <= today;
      const paidCorrectly = payment && (payment.penaltyDays || 0) === 0 && (payment.penaltyAmount || 0) === 0;
      const shouldCount = cycleHasPassed || Boolean(payment);
      return { paidCorrectly, shouldCount };
    });
    let currentStreak = 0;
    for (let i = cycleData.length - 1; i >= 0; i--) {
      const cp = cycleData[i];
      if (!cp.shouldCount) continue;
      if (cp.paidCorrectly) {
        currentStreak++;
      } else {
        break;
      }
    }
    return currentStreak;
  };

  const calculateUserStreaks = async (groupList) => {
    const userId = getCurrentUserId();
    if (!userId) return;
    const results = {};
    await Promise.all(
      (groupList || []).map(async (group) => {
        const isMember = group.members?.some(m => {
          const mid = resolveId(m.user);
          return mid && String(mid) === String(userId);
        });
        if (!isMember) return;
        try {
          const detail = await API.get(`/groups/${group._id}`);
          const cycles = detail.data?.cycles || [];
          const streakValue = computeCurrentStreakFromCycles(cycles, userId);
          results[group._id] = { value: streakValue, isMember: true };
        } catch (err) {
          console.error('Failed to fetch streak for group', group._id, err);
        }
      })
    );
    setUserStreakMap(results);
  };

  const getGroupStatus = (group) => {
    // Check if group is closed first
    if (group.closedAt !== null && group.closedAt !== undefined) {
      return { label: 'Closed', color: '#95a5a6' };
    }
    const memberCount = group.members?.length || 0;
    if (memberCount === 0) return { label: 'New', color: '#3498db' };
    if (memberCount < group.groupSize) return { label: 'Recruiting', color: '#f39c12' };
    return { label: 'Active', color: '#2ecc71' };
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <div>
            <h1>Peer2Loan Dashboard</h1>
            {user && <p className="welcome-text">Welcome back, {user.name}!</p>}
          </div>
          <div className="header-actions">
            {user?.role === 'organizer' && (
              <button className="btn-primary" onClick={() => navigate('/groups/create')}>
                + Create Group
              </button>
            )}
            <div style={{ position: 'relative', marginRight: 8 }}>
              <button
                className="btn-secondary"
                onClick={() => setShowNotif(s => !s)}
                title="Notifications"
              >
                🔔 Notifications
                {(() => {
                  const lastSeen = Number(localStorage.getItem('notif_last_seen_ts') || 0);
                  const unread = notifications.filter(n => {
                    const ts = n.ts || (n.createdAt ? new Date(n.createdAt).getTime() : 0);
                    return ts > lastSeen;
                  }).length;
                  const count = unread || (pendingInvites + pendingPayments);
                  return count > 0 ? (
                  <span
                    style={{
                      marginLeft: 6,
                      background: '#e74c3c',
                      color: '#fff',
                      borderRadius: 10,
                      padding: '2px 6px',
                      fontSize: 12
                    }}
                  >
                    {count}
                  </span>
                  ) : null;
                })()}
              </button>
              {showNotif && (
                <div
                  style={{
                    position: 'absolute',
                    top: '110%',
                    right: 0,
                    width: 320,
                    background: '#fff',
                    border: '1px solid #eee',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
                    borderRadius: 8,
                    zIndex: 20,
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>
                    Notifications
                  </div>
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {notifications.filter(n => n.type === 'pendingApproval').length > 0 && (
                      <div style={{ padding: 10, borderBottom: '1px solid #f0f0f0', background: '#fff8e6' }}>
                        <div style={{ fontWeight: 700, marginBottom: 6, color: '#8a6d3b' }}>Pending Payment Approvals</div>
                        {notifications.filter(n => n.type === 'pendingApproval').map((p) => (
                          <div key={p.paymentId} style={{ padding: '8px 0', borderBottom: '1px dashed #f3f3f3' }}>
                            <div style={{ fontSize: 13, color: '#333' }}>
                              <b>{p.member?.name || p.member?.email || 'Member'}</b> submitted proof in <b>{p.groupName}</b> • Month {p.monthIndex + 1}
                            </div>
                            <div style={{ display:'flex', gap:8, marginTop:6 }}>
                              <button
                                className="btn-primary"
                                onClick={async () => {
                                  try {
                                    await API.post(`/cycles/${p.cycleId}/payments/${p.paymentId}/approve`, {});
                                    await loadInvites();
                                    showToast('Payment approved','success');
                                  } catch (err) {
                                    showToast(err.response?.data?.message || err.message,'error');
                                  }
                                }}
                              >
                                Approve
                              </button>
                              <button
                                className="btn-secondary"
                                onClick={async () => {
                                  try {
                                    await API.post(`/cycles/${p.cycleId}/payments/${p.paymentId}/decline`, {});
                                    await loadInvites();
                                    showToast('Payment disapproved','info');
                                  } catch (err) {
                                    showToast(err.response?.data?.message || err.message,'error');
                                  }
                                }}
                              >
                                Disapprove
                              </button>
                              <button
                                className="btn-link"
                                onClick={() => { setShowNotif(false); navigate(`/groups/${p.groupId}`); }}
                              >
                                Review
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {notifications.filter(n => n.type === 'decision').length > 0 && (
                      <div style={{ padding: 10, borderBottom: '1px solid #f0f0f0', background: '#f3f9ff' }}>
                        <div style={{ fontWeight: 700, marginBottom: 6, color: '#1d5fa7' }}>Payment Decisions</div>
                        {notifications.filter(n => n.type === 'decision').map(d => {
                          const approved = d.status === 'paid';
                          return (
                            <div key={d.paymentId} style={{ padding: '8px 0', borderBottom: '1px dashed #e1e7ef' }}>
                              <div style={{ fontSize: 13, color: approved ? '#1d5fa7' : '#b23b3b' }}>
                                {approved ? '✅ Approved' : '⚠️ Disapproved'} • <b>{d.groupName}</b> • Month {d.monthIndex + 1}
                              </div>
                              <button
                                className="btn-link"
                                onClick={() => { setShowNotif(false); navigate(`/groups/${d.groupId}`); }}
                              >
                                View Details
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ padding: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Invitations</div>
                      {notifications.filter(n => n.type === 'invite').length === 0 ? (
                        <div style={{ color: '#666' }}>No invitations</div>
                      ) : (
                        notifications.filter(n => n.type === 'invite').map(n => (
                          <div key={n._id} style={{ padding: '6px 0', borderBottom: '1px dashed #f3f3f3' }}>
                            <div style={{ fontSize: 14 }}>
                              Invitation to <b>{n.group?.name || 'Group'}</b>
                            </div>
                            <div style={{ fontSize: 12, color: '#888' }}>
                              Status: {n.status}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div style={{ padding: 10, textAlign: 'right', borderTop: '1px solid #f0f0f0' }}>
                    <button className="btn-link" onClick={() => { setShowNotif(false); navigate('/notifications'); }}>
                      View all
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button className="btn-secondary" onClick={logout}>
              Logout
            </button>
            <button className="btn-secondary" onClick={() => navigate('/profile')} style={{ marginLeft: 8 }}>
              Profile
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-stats">
          <div className="stat-card">
            <div className="stat-value">{groups.length}</div>
            <div className="stat-label">Total Groups</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {groups.filter(g => (g.members?.length || 0) >= g.groupSize && (g.closedAt === null || g.closedAt === undefined)).length}
            </div>
            <div className="stat-label">Active Groups</div>
          </div>
        </div>

        <div className="groups-section">
          <div className="section-header">
            <h2>Your Groups</h2>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search groups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {pendingInvites > 0 && (
            <div className="info-banner" style={{ marginBottom: 12 }}>
              You have {pendingInvites} pending {pendingInvites === 1 ? 'invitation' : 'invitations'}.{' '}
              <button className="btn-link" onClick={() => navigate('/notifications')}>View</button>
            </div>
          )}

          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading groups...</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="empty-state">
              {searchTerm ? (
                <>
                  <p>No groups found matching "{searchTerm}"</p>
                  <button className="btn-link" onClick={() => setSearchTerm('')}>
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <h3>No groups yet</h3>
                  {user?.role === 'organizer' ? (
                    <>
                      <p>Create your first group to get started</p>
                      <button className="btn-primary" onClick={() => navigate('/groups/create')}>
                        Create Group
                      </button>
                    </>
                  ) : pendingInvites > 0 ? (
                    <p>You have pending invitations. Check your Notifications.</p>
                  ) : (
                    <p>Ask an organizer to invite you to a group</p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="groups-grid">
              {filteredGroups.map(group => {
                const status = getGroupStatus(group);
                const isAdmin = group.createdBy === user?.id || group.createdBy?._id === user?.id;
                const streakInfo = userStreakMap[group._id];
                const isMember = streakInfo?.isMember ?? isUserMemberOfGroup(group);
                const streakValue =
                  streakInfo && typeof streakInfo.value === 'number'
                    ? streakInfo.value
                    : (isMember ? '—' : 0);
                const showMemberStreakChip = isMember;
                return (
                  <div key={group._id} className="group-card">
                    <div className="group-card-header">
                      <h3>{group.name}</h3>
                      <div className="group-card-header-right">
                        {(user?.role === 'organizer' || isAdmin || status.label === 'Active' || status.label === 'Closed') && (
                          <span className="status-badge" style={{ backgroundColor: status.color }}>
                            {status.label === 'Recruiting' && user?.role !== 'organizer' && !isAdmin ? '' : status.label}
                          </span>
                        )}
                        {showMemberStreakChip && (
                          <span
                            className={`streak-chip ${
                              streakInfo && streakInfo.value > 0 ? '' : 'streak-chip-empty'
                            }`}
                            title={`Current streak: ${streakValue}`}
                          >
                            🔥 {streakValue}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="group-card-body">
                      <div className="group-info">
                        <div className="info-item">
                          <span className="info-label">Monthly Contribution:</span>
                          <span className="info-value">
                            {group.currency} {group.monthlyContribution?.toLocaleString()}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Group Size:</span>
                          <span className="info-value">
                            {group.members?.length || 0} / {group.groupSize}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Start Date:</span>
                          <span className="info-value">
                            {new Date(group.startMonth).toLocaleDateString()}
                          </span>
                        </div>
                        {isAdmin && user?.role === 'organizer' && (
                          <div className="admin-badge">👑 Admin</div>
                        )}
                      </div>
                    </div>
                    <div className="group-card-footer">
                      <Link to={`/groups/${group._id}`} className="btn-link">
                        View Details →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
