import React, { useState } from 'react';
import './CallLogs.css';

function CallLogs({ logs, contacts, onContactsChange, onCallLogsChange }) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const formatDuration = (seconds) => {
    if (seconds === 0) return '0s';
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const dialNumber = (number, autoCall = true) => {
    if (window.dialNumber) {
      window.dialNumber(number, autoCall);
    }
  };

  const openAddContact = (number) => {
    // Check if already exists
    if (contacts[number]) {
      alert(`This number is already saved as "${contacts[number]}"`);
      return;
    }
    setSelectedNumber(number);
    setContactName('');
    setShowAddContact(true);
  };

  const saveToContacts = async () => {
    if (!contactName.trim()) {
      alert('Please enter a name');
      return;
    }

    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          number: selectedNumber, 
          name: contactName.trim() 
        })
      });

      setShowAddContact(false);
      setSelectedNumber('');
      setContactName('');
      
      if (onContactsChange) onContactsChange();
      if (onCallLogsChange) onCallLogsChange();

    } catch (error) {
      console.error('Failed to save contact:', error);
      alert('Failed to save contact');
    }
  };

  const cancelAddContact = () => {
    setShowAddContact(false);
    setSelectedNumber('');
    setContactName('');
  };

  if (logs.length === 0) {
    return (
      <div className="card logs">
        <h2><i className="fas fa-history"></i> Call Logs</h2>
        <div className="empty">No call history</div>
      </div>
    );
  }

  return (
    <div className="card logs">
      <h2><i className="fas fa-history"></i> Call Logs</h2>
      
      {showAddContact && (
        <div className="add-contact-modal">
          <div className="modal-overlay" onClick={cancelAddContact}></div>
          <div className="modal-box">
            <h3>Add to Contacts</h3>
            <div className="modal-number">{selectedNumber}</div>
            <input
              type="text"
              placeholder="Contact Name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveToContacts()}
              autoFocus
            />
            <div className="modal-buttons">
              <button className="btn-sm" onClick={saveToContacts}>
                <i className="fas fa-save"></i> Save
              </button>
              <button className="btn-sm btn-cancel" onClick={cancelAddContact}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="logs-container">
        {logs.map((log, index) => {
          const date = new Date(log.timestamp);
          const timeStr = date.toLocaleTimeString();
          const dateStr = date.toLocaleDateString();
          const durationStr = formatDuration(log.duration);
          
          const typeClass = `type-${log.status === 'completed' ? log.direction : log.status}`;
          const typeLabel = log.status === 'completed' 
            ? (log.direction === 'incoming' ? 'Incoming' : 'Outgoing')
            : log.status.charAt(0).toUpperCase() + log.status.slice(1);
          
          const isContact = contacts[log.number];
          
          return (
            <div key={index} className="log-entry" onClick={() => dialNumber(log.number)}>
              <div className="log-info">
                <div className="log-name">{log.name || log.number}</div>
                {log.name && <div className="log-number">{log.number}</div>}
                <div className="log-meta">
                  <span className={`log-type ${typeClass}`}>{typeLabel}</span>
                  {durationStr} • {timeStr} • {dateStr}
                </div>
              </div>
              <div className="log-actions">
                <button 
                  className="btn-sm" 
                  onClick={(e) => { e.stopPropagation(); dialNumber(log.number); }}
                  title="Call"
                >
                  <i className="fas fa-phone"></i>
                </button>
                {!isContact && (
                  <button 
                    className="btn-sm btn-add-contact" 
                    onClick={(e) => { e.stopPropagation(); openAddContact(log.number); }}
                    title="Add to Contacts"
                  >
                    <i className="fas fa-user-plus"></i>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CallLogs;
