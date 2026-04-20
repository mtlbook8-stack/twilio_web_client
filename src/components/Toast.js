import React, { useState, useEffect, useCallback } from 'react';
import './Toast.css';

let showToastFn = null;

export function showToast(message, type = 'warning', duration = 5000) {
  if (showToastFn) showToastFn(message, type, duration);
}

function Toast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type, duration) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  useEffect(() => {
    showToastFn = addToast;
    return () => { showToastFn = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">
            {t.type === 'warning' && <i className="fas fa-exclamation-triangle"></i>}
            {t.type === 'info' && <i className="fas fa-info-circle"></i>}
            {t.type === 'success' && <i className="fas fa-check-circle"></i>}
            {t.type === 'error' && <i className="fas fa-times-circle"></i>}
          </span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      ))}
    </div>
  );
}

export default Toast;
