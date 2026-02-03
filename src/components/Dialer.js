import React, { useState, useEffect, useRef } from 'react';
import { TwilioService } from '../services/TwilioService';
import './Dialer.css';

function Dialer({ device, currentCall, setCurrentCall, status, setStatus, contacts, onCallEnd }) {
  const [phoneNumber, setPhoneNumber] = useState('+');
  const [callState, setCallState] = useState('IDLE');
  const [callWith, setCallWith] = useState('');
  const [callTimer, setCallTimer] = useState('00:00');
  const [isInCall, setIsInCall] = useState(false);
  const [conferenceParticipants, setConferenceParticipants] = useState([]);
  const [isConference, setIsConference] = useState(false);
  const [heldCall, setHeldCall] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [pipWindow, setPipWindow] = useState(null);
  
  const callStartTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const contactsRef = useRef(contacts);
  const currentCallRef = useRef(currentCall);
  
  // Keep refs in sync with props
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);
  
  useEffect(() => {
    currentCallRef.current = currentCall;
  }, [currentCall]);

  useEffect(() => {
    // Handle keyboard shortcuts
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && document.activeElement.id === 'phoneInput') {
        if (device && !currentCall) {
          makeCall();
        }
      }
      if (e.key === 'Escape' && currentCall) {
        hangup();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [device, currentCall, phoneNumber]);

  // Close PiP when call ends
  useEffect(() => {
    if (!isInCall && pipWindow) {
      closePiP();
    }
  }, [isInCall]);

  // Auto-open PiP when window is minimized/hidden
  useEffect(() => {
    if (!isInCall) return;

    const handleVisibilityChange = () => {
      if (document.hidden && isInCall && !pipWindow && 'documentPictureInPicture' in window) {
        openPiP();
      }
    };

    const handleBlur = () => {
      if (isInCall && !pipWindow && 'documentPictureInPicture' in window) {
        setTimeout(() => {
          if (document.hidden) {
            openPiP();
          }
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isInCall, pipWindow]);

  const handlePhoneInput = (e) => {
    let value = e.target.value;
    
    // Keep only + and numbers
    value = value.replace(/[^\d+]/g, '');
    
    // Ensure + is at the start only
    if (value.includes('+')) {
      const nums = value.replace(/\+/g, '');
      value = '+' + nums;
    }
    
    // If empty, restore +
    if (!value) value = '+';
    
    setPhoneNumber(value);
  };

  const handlePhoneKeyDown = (e) => {
    const input = e.target;
    if (e.key === 'Backspace' && input.selectionStart === 1 && input.selectionEnd === 1) {
      e.preventDefault();
    }
  };

  const makeCall = async (numberToCall) => {
    // Use parameter if provided, otherwise use state
    const targetNumber = numberToCall || phoneNumber;
    
    if (!targetNumber || targetNumber === '+') {
      alert('Please enter a phone number');
      return;
    }

    if (!device) {
      alert('Device not ready');
      return;
    }

    try {
      console.log('Making call to:', targetNumber);

      const call = await device.connect({
        params: { To: targetNumber }
      });

      setCurrentCall(call);
      setCallWith(getContactName(targetNumber) || targetNumber);
      setIsInCall(true);
      
      // Store the phone number and direction on the call object
      call._outgoingNumber = targetNumber;
      call._direction = 'outgoing';
      call._endHandlersAttached = true; // Mark that we're setting up handlers
      
      TwilioService.setupCallEvents(call, {
        onRinging: () => {
          console.log('Call state: RINGING');
          setCallState('RINGING');
          setStatus({ message: 'Ringing...', type: 'ringing' });
        },
        onConnected: () => {
          console.log('Call state: CONNECTED');
          setCallState('CONNECTED');
          setStatus({ message: 'Connected', type: 'connected' });
          startTimer();
        },
        onDisconnected: (status) => {
          if (!call._manualHangup && !call._alreadyLogged) {
            call._alreadyLogged = true;
            handleCallEnd(call._outgoingNumber || targetNumber, 'outgoing', status);
          }
        },
        onCanceled: (status) => {
          if (!call._alreadyLogged) {
            call._alreadyLogged = true;
            handleCallEnd(call._outgoingNumber || targetNumber, 'outgoing', status);
          }
        },
        onRejected: (status) => {
          if (!call._alreadyLogged) {
            call._alreadyLogged = true;
            handleCallEnd(call._outgoingNumber || targetNumber, 'outgoing', status);
          }
        },
        onError: (status) => {
          if (!call._alreadyLogged) {
            call._alreadyLogged = true;
            handleCallEnd(call._outgoingNumber || targetNumber, 'outgoing', status);
          }
        }
      });

    } catch (error) {
      console.error('Failed to make call:', error);
      setStatus({ message: 'Call Failed: ' + error.message, type: 'error' });
    }
  };

  const hangup = () => {
    if (device && currentCall) {
      console.log('Hanging up...');
      
      // Get call details before disconnecting
      const number = currentCall._callerNumber || currentCall._outgoingNumber;
      const direction = currentCall._direction || 'outgoing';
      
      // Mark that we're manually hanging up and already logged
      currentCall._manualHangup = true;
      currentCall._alreadyLogged = true;
      
      // Disconnect all calls
      device.disconnectAll();
      
      // Force UI reset and log only if we have valid number
      setTimeout(() => {
        if (number && number !== 'client:browser-client-1000') {
          handleCallEnd(number, direction, 'completed');
        } else {
          // Just reset UI without logging if number is invalid
          setIsInCall(false);
          setCallState('IDLE');
          setCallTimer('00:00');
          setCurrentCall(null);
          setPhoneNumber('+');
          setStatus({ message: 'Ready', type: 'ready' });
          setIsConference(false);
          setConferenceParticipants([]);
          if (onCallEnd) onCallEnd();
        }
      }, 500);
    }
  };

  const sendDTMF = (digit) => {
    if (currentCall) {
      console.log('Sending DTMF:', digit);
      currentCall.sendDigits(digit);
    }
  };

  const openPiP = async () => {
    if (!('documentPictureInPicture' in window)) {
      console.log('Picture-in-Picture not supported');
      return;
    }

    try {
      const pipWin = await window.documentPictureInPicture.requestWindow({
        width: 300,
        height: 200
      });

      setPipWindow(pipWin);

      // Copy styles to PiP window
      const styleSheets = [...document.styleSheets];
      styleSheets.forEach(styleSheet => {
        try {
          const cssRules = [...styleSheet.cssRules].map(rule => rule.cssText).join('');
          const style = document.createElement('style');
          style.textContent = cssRules;
          pipWin.document.head.appendChild(style);
        } catch (e) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = styleSheet.href;
          pipWin.document.head.appendChild(link);
        }
      });

      // Add Font Awesome
      const fontAwesome = document.createElement('link');
      fontAwesome.rel = 'stylesheet';
      fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
      pipWin.document.head.appendChild(fontAwesome);

      // Create PiP content
      const container = pipWin.document.createElement('div');
      container.style.cssText = 'padding: 20px; font-family: Arial, sans-serif; text-align: center;';
      container.innerHTML = `
        <div style="margin-bottom: 15px;">
          <div style="font-size: 18px; font-weight: bold; color: #333; margin-bottom: 5px;">${callWith || phoneNumber}</div>
          <div id="pip-timer" style="font-size: 24px; color: #667eea; font-weight: 600;">${callTimer}</div>
        </div>
        <button id="pip-hangup" style="
          background: #e74c3c;
          color: white;
          border: none;
          padding: 12px 30px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        ">
          <i class="fas fa-phone-slash"></i> Hang Up
        </button>
      `;
      pipWin.document.body.appendChild(container);

      // Update timer in PiP
      const timerInterval = setInterval(() => {
        const timerEl = pipWin.document.getElementById('pip-timer');
        if (timerEl) {
          timerEl.textContent = callTimer;
        }
      }, 1000);

      // Hangup handler
      pipWin.document.getElementById('pip-hangup').addEventListener('click', () => {
        hangup();
        pipWin.close();
      });

      // Cleanup when PiP closes
      pipWin.addEventListener('pagehide', () => {
        clearInterval(timerInterval);
        setPipWindow(null);
      });

    } catch (error) {
      console.error('Failed to open PiP:', error);
    }
  };

  const closePiP = () => {
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
      setPipWindow(null);
    }
  };

  const startTimer = () => {
    callStartTimeRef.current = Date.now();
    
    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
      const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const seconds = (elapsed % 60).toString().padStart(2, '0');
      setCallTimer(`${minutes}:${seconds}`);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const duration = callStartTimeRef.current 
      ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) 
      : 0;
    
    callStartTimeRef.current = null;
    return duration;
  };

  const handleCallEnd = (number, direction, status) => {
    const duration = stopTimer();
    
    // Get contact name from current contacts state
    const contactName = getContactName(number);
    
    console.log(`Logging call: ${number} (${contactName || 'no name'}), ${direction}, ${status}, ${duration}s`);
    
    // Log the call with contact name
    TwilioService.logCall(number, direction, status, duration, contactName);
    
    // Check if there's a held call to switch back to
    if (heldCall && !heldCall._ended) {
      console.log('Switching back to held call');
      setCurrentCall(heldCall);
      heldCall.mute(false);
      heldCall._onHold = false;
      setHeldCall(null);
      setCallWith(heldCall._callerName || heldCall._callerNumber || 'Unknown');
      setCallState('CONNECTED');
      setStatus({ message: 'Resumed from hold', type: 'connected' });
      setIsInCall(true);
      setCallTimer('--:--'); // Show placeholder, held call duration unknown
    } else {
      // Reset UI completely
      setIsInCall(false);
      setCallState('IDLE');
      setCallTimer('00:00');
      setCurrentCall(null);
      setPhoneNumber('+');
      setStatus({ message: 'Ready', type: 'ready' });
      setIsConference(false);
      setConferenceParticipants([]);
      setHeldCall(null);
    }
    
    // Trigger refresh of call logs
    if (onCallEnd) onCallEnd();
  };

  const getContactName = (number) => {
    if (!number) return null;
    return contacts[number] || null;
  };

  // Expose dialNumber function globally for other components
  React.useEffect(() => {
    window.dialNumber = (number, autoCall = true) => {
      setPhoneNumber(number);
      if (autoCall && device && !currentCallRef.current) {
        // Call immediately with the number
        makeCall(number);
      }
    };
    
    // Store device globally for conference access
    if (device) {
      window.device = device;
    }
    
    window.handleIncomingCallAnswer = (call, number, name) => {
      // Store the actual caller number on the call object
      call._callerNumber = number;
      call._callerName = name;
      call._direction = 'incoming';
      
      setCallWith(name || number);
      setIsInCall(true);
      setCallState('CONNECTED');
      setStatus({ message: 'Connected', type: 'connected' });
      startTimer();
      
      // Set up call end events - only if not already attached
      if (!call._endHandlersAttached) {
        call._endHandlersAttached = true;
        
        call.on('disconnect', () => {
          console.log('Incoming call disconnected');
          if (!call._alreadyLogged) {
            call._alreadyLogged = true;
            handleCallEnd(call._callerNumber || number, 'incoming', 'completed');
          }
        });
        
        call.on('error', (error) => {
          console.error('Incoming call error:', error);
          if (!call._alreadyLogged) {
            call._alreadyLogged = true;
            handleCallEnd(call._callerNumber || number, 'incoming', 'failed');
          }
        });
      }
    };
    
    window.handleIncomingCallMissed = (call, number, name, status) => {
      console.log(`Incoming call ${status}:`, number);
      if (!call._alreadyLogged) {
        call._alreadyLogged = true;
        const contactName = contactsRef.current[number] || name;
        TwilioService.logCall(number, 'incoming', status, 0, contactName);
        if (onCallEnd) onCallEnd();
      }
    };
    
    window.handleHoldAndAnswer = (newCall, newNumber, newName, callToHold) => {
      console.log('Holding current call and answering new call');
      
      // Stop timer for held call
      stopTimer();
      
      // Store the current call as held
      setHeldCall(callToHold);
      callToHold.mute(true);
      callToHold._onHold = true;
      
      // Switch to new call
      setCurrentCall(newCall);
      newCall._callerNumber = newNumber;
      newCall._callerName = newName;
      newCall._direction = 'incoming';
      
      setCallWith(newName || newNumber);
      setCallState('CONNECTED');
      setStatus({ message: 'Connected (call on hold)', type: 'connected' });
      setIsInCall(true);
      
      // Start timer for new call
      startTimer();
      
      // Set up disconnect handler for new call
      if (!newCall._endHandlersAttached) {
        newCall._endHandlersAttached = true;
        
        newCall.on('disconnect', () => {
          console.log('Active call disconnected, switching to held call');
          if (!newCall._alreadyLogged) {
            newCall._alreadyLogged = true;
            handleCallEnd(newCall._callerNumber || newNumber, 'incoming', 'completed');
          }
        });
        
        newCall.on('error', (error) => {
          console.error('Active call error:', error);
          if (!newCall._alreadyLogged) {
            newCall._alreadyLogged = true;
            handleCallEnd(newCall._callerNumber || newNumber, 'incoming', 'failed');
          }
        });
      }
    };
    
    window.handleConferenceAdd = (call, number, name) => {
      console.log('Adding to conference:', name || number);
      setIsConference(true);
      setConferenceParticipants(prev => [...prev, { number, name: name || number, call }]);
      setCallWith('Conference Call');
      
      // Set up events for new participant
      call.on('disconnect', () => {
        console.log('Participant left:', name || number);
        setConferenceParticipants(prev => prev.filter(p => p.number !== number));
      });
    };
    
    return () => { 
      delete window.dialNumber;
      delete window.handleIncomingCallAnswer;
      delete window.handleIncomingCallMissed;
      delete window.handleConferenceAdd;
      delete window.handleHoldAndAnswer;
      delete window.device;
    };
  }, [device]); // Only re-run when device changes, not on every currentCall change

  return (
    <div className="card dialer">
      <h2><i className="fas fa-phone"></i> Phone</h2>
      
      <div className={`status status-${status.type}`}>
        {status.message}
      </div>
      
      {isInCall && (
        <div className="in-call-display">
          <div className="call-state">{callState}</div>
          <div className="call-with">{callWith}</div>
          {isConference && conferenceParticipants.length > 0 && (
            <div className="conference-participants">
              <div className="participants-label">Participants:</div>
              {conferenceParticipants.map((p, idx) => (
                <div key={idx} className="participant-item">{p.name}</div>
              ))}
            </div>
          )}
          <div className="call-timer">{callTimer}</div>
        </div>
      )}
      
      <input
        id="phoneInput"
        type="text"
        className="phone-input"
        placeholder="Phone number"
        value={phoneNumber}
        onChange={handlePhoneInput}
        onKeyDown={handlePhoneKeyDown}
        disabled={isInCall}
      />
      
      <button
        className="btn btn-call"
        onClick={() => makeCall()}
        disabled={!device || isInCall}
      >
        <i className="fas fa-phone"></i> Call
      </button>
      
      <button
        className="btn btn-hangup"
        onClick={hangup}
        disabled={!isInCall}
      >
        <i className="fas fa-phone-slash"></i> Hang Up
      </button>
      
      {isInCall && (
        <button
          className="btn btn-keypad"
          onClick={() => setShowKeypad(!showKeypad)}
        >
          <i className="fas fa-th"></i> {showKeypad ? 'Hide' : 'Show'} Keypad
        </button>
      )}

      {isInCall && 'documentPictureInPicture' in window && (
        <button
          className="btn btn-pip"
          onClick={openPiP}
          disabled={!!pipWindow}
        >
          <i className="fas fa-external-link-alt"></i> {pipWindow ? 'PiP Active' : 'Open PiP'}
        </button>
      )}
      
      {showKeypad && isInCall && (
        <div className="dtmf-overlay" onClick={() => setShowKeypad(false)}>
          <div className="dtmf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dtmf-header">
              <h3>Dialpad</h3>
              <button className="dtmf-close" onClick={() => setShowKeypad(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="dtmf-keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(digit => (
                <button
                  key={digit}
                  className="dtmf-btn"
                  onClick={() => sendDTMF(digit)}
                >
                  {digit}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dialer;
