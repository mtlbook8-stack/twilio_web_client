import React, { useState } from 'react';
import './Contacts.css';

function Contacts({ contacts, onContactsChange, onCallLogsChange }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('+');

  const handleNumberInput = (e) => {
    let value = e.target.value;
    value = value.replace(/[^\d+]/g, '');
    
    if (value.includes('+')) {
      const nums = value.replace(/\+/g, '');
      value = '+' + nums;
    }
    
    if (!value) value = '+';
    setContactNumber(value);
  };

  const handleNumberKeyDown = (e) => {
    if (e.key === 'Backspace' && e.target.selectionStart === 1 && e.target.selectionEnd === 1) {
      e.preventDefault();
    }
  };

  const saveContact = async () => {
    if (!contactName.trim() || !contactNumber || contactNumber === '+') {
      alert('Please enter both name and number');
      return;
    }

    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          number: contactNumber, 
          name: contactName 
        })
      });

      setContactName('');
      setContactNumber('+');
      setShowAddForm(false);
      
      if (onContactsChange) onContactsChange();
      if (onCallLogsChange) onCallLogsChange();

    } catch (error) {
      console.error('Failed to save contact:', error);
      alert('Failed to save contact');
    }
  };

  const deleteContact = async (number) => {
    if (!window.confirm('Delete this contact?')) return;

    try {
      await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number })
      });

      if (onContactsChange) onContactsChange();
      if (onCallLogsChange) onCallLogsChange();

    } catch (error) {
      console.error('Failed to delete contact:', error);
      alert('Failed to delete contact');
    }
  };

  const dialNumber = (number, autoCall = false) => {
    if (window.dialNumber) {
      window.dialNumber(number, autoCall);
    }
  };

  const contactEntries = Object.entries(contacts);

  return (
    <div className="card contacts">
      <h2><i className="fas fa-address-book"></i> Contacts</h2>
      
      <button 
        className="add-contact-btn"
        onClick={() => setShowAddForm(!showAddForm)}
      >
        <i className="fas fa-plus"></i> Add Contact
      </button>
      
      {showAddForm && (
        <div className="add-contact-form">
          <input
            type="text"
            placeholder="Name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Phone Number"
            value={contactNumber}
            onChange={handleNumberInput}
            onKeyDown={handleNumberKeyDown}
          />
          <button className="btn-sm" onClick={saveContact}>
            Save
          </button>
        </div>
      )}
      
      <div className="contacts-container">
        {contactEntries.length === 0 ? (
          <div className="empty">No contacts saved</div>
        ) : (
          contactEntries.map(([number, name]) => (
            <div key={number} className="contact-item">
              <div onClick={() => dialNumber(number)}>
                <div className="contact-name">{name}</div>
                <div className="contact-number">{number}</div>
              </div>
              <div className="contact-actions">
                <button className="btn-sm" onClick={() => dialNumber(number)}>
                  <i className="fas fa-phone"></i>
                </button>
                <button className="btn-sm btn-delete" onClick={() => deleteContact(number)}>
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Contacts;
