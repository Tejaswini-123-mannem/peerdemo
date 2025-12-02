import React, { useEffect, useState } from 'react';
import API from '../api';
import { useNavigate } from 'react-router-dom';

export default function Notifications() {
  const [invitations, setInvitations] = useState([]);
  const [paymentDecisions, setPaymentDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get('/notifications');
      const invites = (res.data.invitations || []).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const decisions = (res.data.myPaymentDecisions || []).sort((a,b) => new Date(b.decidedAt || 0) - new Date(a.decidedAt || 0));
      setInvitations(invites);
      setPaymentDecisions(decisions);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const accept = async (id) => {
    try {
      await API.post(`/invitations/${id}/accept`, {});
      // Navigate to dashboard so the new group is visible immediately
      navigate('/dashboard');
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    }
  };

  return (
    <div style={{ padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h2>Notifications</h2>
        {(() => {
          const lastSeen = Number(localStorage.getItem('notif_last_seen_ts') || 0);
          const newestInvite = invitations[0]?.createdAt ? new Date(invitations[0].createdAt).getTime() : 0;
          const newestDecision = paymentDecisions[0]?.decidedAt ? new Date(paymentDecisions[0].decidedAt).getTime() : 0;
          const unreadCount = [
            ...invitations.filter(i => new Date(i.createdAt || 0).getTime() > lastSeen),
            ...paymentDecisions.filter(d => new Date(d.decidedAt || 0).getTime() > lastSeen)
          ].length;
          return (
            <div>
              <span style={{ marginRight: 10 }}>Unread: <b>{unreadCount}</b></span>
              <button onClick={() => { localStorage.setItem('notif_last_seen_ts', String(Date.now())); load(); }}>
                Mark all as read
              </button>
            </div>
          );
        })()}
      </div>
      {loading && <p>Loading...</p>}
      {error && <p style={{color:'red'}}>{error}</p>}
      {!loading && invitations.length === 0 && paymentDecisions.length === 0 && <p>No notifications</p>}

      {paymentDecisions.length > 0 && (
        <div style={{ marginBottom: 20, padding: 12, border: '1px solid #eee', borderRadius: 8, background: '#fff' }}>
          <h3 style={{ marginTop: 0 }}>Payment Decisions</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {paymentDecisions.map(pd => {
              const approved = pd.status === 'paid';
              return (
                <li key={pd.paymentId} style={{ marginBottom: 10 }}>
                  <div style={{ color: approved ? '#2e7d32' : '#b23b3b', fontWeight: 600 }}>
                    {approved ? 'Approved' : 'Disapproved'}
                  </div>
                  <div style={{ color: '#333' }}>
                    Your payment in <b>{pd.groupName}</b> for Month {pd.monthIndex + 1} was{' '}
                    <b>{approved ? 'approved' : 'disapproved'}</b>.
                    {!approved && ' Please review and resubmit.'}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <button onClick={() => navigate(`/groups/${pd.groupId}`)}>
                      {approved ? 'View Group' : 'Resubmit'}
                    </button>
                    {pd.proofUrl && (
                      <a
                        href={`${(process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/api\/?$/,'')}${pd.proofUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: 10 }}
                      >
                        View Submitted Proof
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ul>
        {invitations.map(inv => (
          <li key={inv._id} style={{ marginBottom: 10 }}>
            <div>
              Group: <b>{inv.group?.name}</b> — Contribution: {inv.group?.monthlyContribution} — Size: {inv.group?.groupSize}
            </div>
            <div>Status: <b>{inv.status}</b></div>
            {inv.status === 'pending' && (
              <button onClick={()=>accept(inv._id)}>Accept Invitation</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}


