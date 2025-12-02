import React, { useEffect, useState } from 'react';
import API from '../api';
import { useParams, useNavigate, Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import './GroupSettings.css';
import './GroupView.css';

export default function GroupSettings() {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ autoReminders: true, replacementPolicy: false, lateFeeEnabled: true });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [closeChecks, setCloseChecks] = useState({ duesCleared: false, payoutsWrapped: false });
  const [closeLoading, setCloseLoading] = useState(false);
  const [allCyclesGenerated, setAllCyclesGenerated] = useState(false);
  const [allPayoutsExecuted, setAllPayoutsExecuted] = useState(false);
  const [pendingPaymentsExist, setPendingPaymentsExist] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/groups/${id}`);
      setGroup(res.data.group);
      const cycles = res.data.cycles || [];
      setAllCyclesGenerated(cycles.length >= (res.data.group?.groupSize || 0));
      setAllPayoutsExecuted(cycles.every(c => c.payoutExecuted));
      setPendingPaymentsExist(cycles.some(c => (c.payments || []).some(p => p.status !== 'paid')));
      if (res.data.group?.settings) {
        setSettings({
          autoReminders: res.data.group.settings.autoReminders !== false,
          replacementPolicy: res.data.group.settings.replacementPolicy === true,
          lateFeeEnabled: res.data.group.settings.lateFeeEnabled !== false
        });
      }
    } catch (err) {
      if (err.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async () => {
    setSettingsLoading(true);
    try {
      await API.patch(`/groups/${id}/settings`, { settings });
      await load();
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const closeDisabledReason = () => {
    if (group?.closedAt) return 'Group already closed';
    if (!allCyclesGenerated) return 'All cycles must be generated';
    if (!allPayoutsExecuted) return 'All payouts must be executed';
    if (pendingPaymentsExist) return 'Pending or rejected payments must be resolved';
    if (!closeChecks.duesCleared || !closeChecks.payoutsWrapped) return 'Please confirm all checklist items';
    return '';
  };

  const attemptCloseGroup = async () => {
    const reason = closeDisabledReason();
    if (reason) {
      alert(reason);
      return;
    }
    
    // Confirm before closing
    const confirmClose = window.confirm(
      'Are you sure you want to close this group? This action cannot be undone. The group will be permanently archived after closing.'
    );
    if (!confirmClose) {
      return;
    }
    
    setCloseLoading(true);
    try {
      const res = await API.post(`/groups/${id}/close`, {});
      
      // Ask user if they want to download the ledger
      if (res.data.ledgerText) {
        const downloadLedger = window.confirm(
          'Group closed successfully! The ledger has been generated.\n\nWould you like to download the group ledger now?'
        );
        
        if (downloadLedger) {
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
          pdf.text('GROUP LEDGER REPORT', pageWidth / 2, y, { align: 'center' });
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
          
          const safeGroupName = group.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          pdf.save(`group-ledger-${safeGroupName}-${Date.now()}.pdf`);
        }
      } else if (res.data.ledger) {
        const downloadLedger = window.confirm(
          'Group closed successfully! The ledger has been generated.\n\nWould you like to download the group ledger now?'
        );
        
        if (downloadLedger) {
          // Fallback: Generate PDF from JSON data
          const pdf = new jsPDF();
          pdf.setFontSize(16);
          pdf.setFont(undefined, 'bold');
          pdf.text('GROUP LEDGER REPORT', 105, 20, { align: 'center' });
          pdf.setFontSize(10);
          pdf.setFont(undefined, 'normal');
          pdf.text(JSON.stringify(res.data.ledger, null, 2), 20, 30);
          const safeGroupName = group.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          pdf.save(`group-ledger-${safeGroupName}-${Date.now()}.pdf`);
        }
      }
      
      // Show success message
      alert('Group has been closed successfully. The group will no longer be accessible after you leave this page.');
      navigate(`/groups/${id}`);
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    } finally {
      setCloseLoading(false);
    }
  };

  const ToggleButton = ({ label, checked, onChange, description, disabled }) => (
    <div className="toggle-item">
      <div className="toggle-info">
        <div className="toggle-label">{label}</div>
        {description && <div className="toggle-description">{description}</div>}
      </div>
      <button
        className={`toggle-button ${checked ? 'toggle-on' : 'toggle-off'}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        type="button"
      >
        <span className="toggle-slider"></span>
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="group-settings-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="group-settings-container">
        <div className="error-state">
          <p>Group not found</p>
          <Link to="/dashboard" className="btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="group-settings-container">
      <div className="settings-header">
        <Link to={`/groups/${id}`} className="back-link">← Back to Group</Link>
        <h1>Group Settings</h1>
        <p>{group.name}</p>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h2>Group Preferences</h2>
          <div className="settings-list">
            <ToggleButton
              label="Auto Reminders"
              checked={settings.autoReminders}
              onChange={(val) => setSettings(prev => ({ ...prev, autoReminders: val }))}
              description="Automatically send payment reminders to members"
              disabled={settingsLoading}
            />
            <ToggleButton
              label="Replacement Allowed"
              checked={settings.replacementPolicy}
              onChange={(val) => setSettings(prev => ({ ...prev, replacementPolicy: val }))}
              description="Allow member replacement in case of dropouts"
              disabled={settingsLoading}
            />
            <ToggleButton
              label="Late Fee"
              checked={settings.lateFeeEnabled}
              onChange={(val) => setSettings(prev => ({ ...prev, lateFeeEnabled: val }))}
              description="Enable late fees for delayed payments"
              disabled={settingsLoading}
            />
          </div>
          <div className="settings-actions">
            <button
              className="btn-primary"
              onClick={updateSettings}
              disabled={settingsLoading}
            >
              {settingsLoading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h2>Close Group</h2>
          <p className="section-description">
            Confirm the checklist to enable closing the group. Closing is permanent and locks further activity.
          </p>
          <div className="checklist">
            <label className="checklist-item">
              <input
                type="checkbox"
                checked={closeChecks.duesCleared}
                onChange={(e) => setCloseChecks(prev => ({ ...prev, duesCleared: e.target.checked }))}
                disabled={group.closedAt}
              />
              <span>No dues or pending payments are left.</span>
            </label>
            <label className="checklist-item">
              <input
                type="checkbox"
                checked={closeChecks.payoutsWrapped}
                onChange={(e) => setCloseChecks(prev => ({ ...prev, payoutsWrapped: e.target.checked }))}
                disabled={group.closedAt}
              />
              <span>All payouts are executed and members are informed.</span>
            </label>
          </div>
          <ul className="requirements-list">
            {!allCyclesGenerated && <li>Waiting for all cycles to be generated.</li>}
            {!allPayoutsExecuted && <li>Some payouts are still pending execution.</li>}
            {pendingPaymentsExist && <li>Resolve pending or rejected member payments.</li>}
            {group.closedAt && <li>Group closed on {new Date(group.closedAt).toLocaleDateString()}.</li>}
          </ul>
          <button
            className="btn-primary btn-danger"
            onClick={attemptCloseGroup}
            disabled={!!closeDisabledReason() || closeLoading}
          >
            {group.closedAt ? 'Group Closed' : closeLoading ? 'Closing...' : 'Close Group'}
          </button>
          {group.closedAt && (
            <button
              className="btn-primary"
              onClick={async () => {
                try {
                  const res = await API.get(`/groups/${id}/ledger`);
                  if (res.data.ledgerText) {
                    // Generate PDF from text
                    const pdf = new jsPDF();
                    const lines = res.data.ledgerText.split('\n');
                    const pageHeight = pdf.internal.pageSize.height;
                    const pageWidth = pdf.internal.pageSize.width;
                    const margin = 20;
                    let y = margin;
                    const lineHeight = 7;
                    const maxWidth = pageWidth - (2 * margin);
                    
                    pdf.setFontSize(16);
                    pdf.text('GROUP LEDGER REPORT', pageWidth / 2, y, { align: 'center' });
                    y += lineHeight * 2;
                    
                    pdf.setFontSize(10);
                    lines.forEach((line) => {
                      if (y > pageHeight - margin) {
                        pdf.addPage();
                        y = margin;
                      }
                      const wrappedLines = pdf.splitTextToSize(line, maxWidth);
                      wrappedLines.forEach((wrappedLine) => {
                        if (y > pageHeight - margin) {
                          pdf.addPage();
                          y = margin;
                        }
                        pdf.text(wrappedLine, margin, y);
                        y += lineHeight;
                      });
                    });
                    
                    const safeGroupName = group.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    pdf.save(`group-ledger-${safeGroupName}-${Date.now()}.pdf`);
                    alert('Ledger downloaded successfully!');
                  }
                } catch (err) {
                  alert(err.response?.data?.message || 'Failed to download ledger');
                }
              }}
              style={{ marginTop: 10 }}
            >
              📥 Download Ledger
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

