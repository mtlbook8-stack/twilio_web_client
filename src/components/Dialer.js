import React, { useState, useEffect, useRef } from 'react';
import { TwilioService } from '../services/TwilioService';
import './Dialer.css';

function Dialer({ device, currentCall, setCurrentCall, status, setStatus, contacts, callLogs = [], onCallEnd }) {
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
  const [callerIds, setCallerIds] = useState(null);
  const [useIsraelAlt, setUseIsraelAlt] = useState(false);
  const [pipPermissionGranted, setPipPermissionGranted] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const callStartTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const contactsRef = useRef(contacts);
  const currentCallRef = useRef(currentCall);
  const useIsraelAltRef = useRef(false);
  
  // Keep refs in sync with props and state
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);
  
  useEffect(() => {
    currentCallRef.current = currentCall;
  }, [currentCall]);

  useEffect(() => {
    useIsraelAltRef.current = useIsraelAlt;
  }, [useIsraelAlt]);

  // Fetch available caller IDs
  useEffect(() => {
    fetch('/api/caller-ids')
      .then(res => res.json())
      .then(data => setCallerIds(data))
      .catch(err => console.error('Failed to fetch caller IDs:', err));
  }, []);

  // Process call logs into unique numbers
  const callHistory = React.useMemo(() => {
    const uniqueNumbers = {};
    callLogs.forEach(call => {
      if (!uniqueNumbers[call.number] || new Date(call.timestamp) > new Date(uniqueNumbers[call.number].timestamp)) {
        uniqueNumbers[call.number] = call;
      }
    });
    return Object.values(uniqueNumbers);
  }, [callLogs]);

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
    if (!isInCall || !pipPermissionGranted) return;

    const handleVisibilityChange = async () => {
      if (document.hidden && isInCall && !pipWindow && 'documentPictureInPicture' in window) {
        try {
          await openPiP();
        } catch (error) {
          console.log('Auto-PiP blocked by browser (requires direct user interaction). Use PiP button instead.');
          setPipPermissionGranted(false); // Reset permission flag
        }
      }
    };

    const handleBlur = async () => {
      if (isInCall && !pipWindow && 'documentPictureInPicture' in window) {
        setTimeout(async () => {
          if (document.hidden) {
            try {
              await openPiP();
            } catch (error) {
              console.log('Auto-PiP blocked by browser (requires direct user interaction). Use PiP button instead.');
              setPipPermissionGranted(false); // Reset permission flag
            }
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
  }, [isInCall, pipWindow, pipPermissionGranted]);

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

    // Filter suggestions
    if (value.length > 1) {
      const filtered = callHistory.filter(call => {
        const number = call.number.toLowerCase();
        const name = (call.name || '').toLowerCase();
        const searchTerm = value.toLowerCase();
        return number.includes(searchTerm) || name.includes(searchTerm);
      }).slice(0, 5); // Limit to 5 suggestions
      
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setSelectedSuggestionIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handlePhoneKeyDown = (e) => {
    const input = e.target;
    if (e.key === 'Backspace' && input.selectionStart === 1 && input.selectionEnd === 1) {
      e.preventDefault();
      return;
    }

    // Handle arrow keys for suggestion navigation
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
      } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedSuggestionIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
      }
    }
  };

  const selectSuggestion = (call) => {
    setPhoneNumber(call.number);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
    // Focus back on input
    document.getElementById('phoneInput')?.focus();
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

    // Grant PiP permission on user action
    setPipPermissionGranted(true);

    try {
      console.log('Making call to:', targetNumber);
      console.log('useIsraelAlt state:', useIsraelAlt);
      console.log('useIsraelAlt REF:', useIsraelAltRef.current);

      const params = { 
        To: targetNumber,
        UseIsraelAlt: useIsraelAltRef.current.toString()
      };
      
      console.log('Sending params:', params);

      const call = await device.connect({ params });

      setCurrentCall(call);
      setCallWith(getContactName(targetNumber) || targetNumber);
      setIsInCall(true);
      
      // Store the phone number and direction on the call object
      call._outgoingNumber = targetNumber;
      call._direction = 'outgoing';
      call._endHandlersAttached = true; // Mark that we're setting up handlers
      
      // Extract call SID (available after connection starts)
      call._callSid = call.parameters.CallSid;
      console.log('📞 Outgoing Call SID:', call._callSid);
      
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
            handleCallEnd(call._outgoingNumber || targetNumber, 'outgoing', status, call._callSid);
          }
        },
        onCanceled: (status) => {
          if (!call._alreadyLogged) {
            call._alreadyLogged = true;
            handleCallEnd(call._outgoingNumber || targetNumber, 'outgoing', status, call._callSid);
          }
        },
        onRejected: (status) => {
          if (!call._alreadyLogged) {
            call._alreadyLogged = true;
            handleCallEnd(call._outgoingNumber || targetNumber, 'outgoing', status, call._callSid);
          }
        },
        onError: (status) => {
          if (!call._alreadyLogged) {
            call._alreadyLogged = true;
            handleCallEnd(call._outgoingNumber || targetNumber, 'outgoing', status, call._callSid);
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
      
      // Refresh PiP permission on user action
      setPipPermissionGranted(true);
      
      // Get call details before disconnecting
      const number = currentCall._callerNumber || currentCall._outgoingNumber;
      const direction = currentCall._direction || 'outgoing';
      const callSid = currentCall._callSid;
      
      // Mark that we're manually hanging up and already logged
      currentCall._manualHangup = true;
      currentCall._alreadyLogged = true;
      
      // Disconnect all calls
      device.disconnectAll();
      
      // Force UI reset and log only if we have valid number
      setTimeout(() => {
        if (number && number !== 'client:browser-client-1000') {
          // For outgoing calls, callSid is optional (client creates entry)
          // For incoming calls, callSid is required (client updates entry)
          handleCallEnd(number, direction, 'completed', callSid);
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
      
      const updatePiPContent = () => {
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
        
        // Re-attach hangup handler after innerHTML update
        const hangupBtn = pipWin.document.getElementById('pip-hangup');
        if (hangupBtn) {
          hangupBtn.addEventListener('click', () => {
            hangup();
            pipWin.close();
          });
        }
      };
      
      updatePiPContent();
      pipWin.document.body.appendChild(container);

      // Update timer in PiP every second using fresh elapsed time
      const timerInterval = setInterval(() => {
        if (callStartTimeRef.current && !pipWin.closed) {
          const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
          const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
          const seconds = (elapsed % 60).toString().padStart(2, '0');
          const timerEl = pipWin.document.getElementById('pip-timer');
          if (timerEl) {
            timerEl.textContent = `${minutes}:${seconds}`;
          }
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

  const handleCallEnd = (number, direction, status, callSid) => {
    const duration = stopTimer();
    
    // Get contact name from current contacts state
    const contactName = getContactName(number);
    
    console.log(`Call ended: ${number} (${contactName || 'no name'}), ${direction}, ${status}, ${duration}s, SID: ${callSid || 'N/A'}`);
    
    // Log the call
    // Incoming: requires callSid for update
    // Outgoing: creates new entry (callSid optional)
    TwilioService.logCall(number, direction, status, duration, contactName, callSid).then(() => {
      // Refresh logs after logging
      if (onCallEnd) onCallEnd();
    });
    
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
    
    // Expose status setter for IncomingCallModal
    window.setDialerStatus = setStatus;
    
    window.handleIncomingCallAnswer = (call, number, name) => {
      // Store the actual caller number on the call object
      call._callerNumber = number;
      call._callerName = name;
      call._direction = 'incoming';
      // Use customParameters.get('CallSid') (from server) not parameters.CallSid (client leg ID)
      // customParameters is a Map, not an object!
      call._callSid = call.customParameters?.get('CallSid') || call.parameters.CallSid;
      console.log('📞 Call SID extracted:', call._callSid);
      console.log('From parameters:', call.parameters.CallSid);
      console.log('From customParameters:', call.customParameters?.get('CallSid'));
      
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
            const duration = Math.round((Date.now() - callStartTimeRef.current) / 1000);
            const contactName = contactsRef.current[call._callerNumber || number] || name;
            TwilioService.logCall(call._callerNumber || number, 'incoming', 'completed', duration, contactName, call._callSid).then(() => {
              // Refresh logs from server after update
              if (onCallEnd) onCallEnd();
            });
            
            // Reset UI (don't call handleCallEnd - already logged above)
            stopTimer();
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
              setCallTimer('--:--');
            } else {
              setIsInCall(false);
              setCallState('IDLE');
              setCallTimer('00:00');
              setCurrentCall(null);
              setPhoneNumber('+');
              setStatus({ message: 'Ready', type: 'ready' });
              setIsConference(false);
              setConferenceParticipants([]);
            }
          }
        });
        
        call.on('error', (error) => {
          console.error('Incoming call error:', error);
          if (!call._alreadyLogged) {
            call._alreadyLogged = true;
            const duration = Math.round((Date.now() - callStartTimeRef.current) / 1000);
            const contactName = contactsRef.current[call._callerNumber || number] || name;
            TwilioService.logCall(call._callerNumber || number, 'incoming', 'failed', duration, contactName, call._callSid).then(() => {
              // Refresh logs from server after update
              if (onCallEnd) onCallEnd();
            });
            
            // Reset UI (don't call handleCallEnd - already logged above)
            stopTimer();
            setIsInCall(false);
            setCallState('IDLE');
            setCallTimer('00:00');
            setCurrentCall(null);
            setPhoneNumber('+');
            setStatus({ message: 'Ready', type: 'ready' });
            setIsConference(false);
            setConferenceParticipants([]);
          }
        });
      }
    };
    
    window.handleIncomingCallMissed = (call, number, name, status) => {
      console.log(`Incoming call ${status}:`, number);
      if (!call._alreadyLogged) {
        call._alreadyLogged = true;
        const contactName = contactsRef.current[number] || name;
        // Use customParameters.get('CallSid') (from server) not parameters.CallSid (client leg ID)
        const callSid = call.customParameters?.get('CallSid') || call.parameters?.CallSid;
        console.log('📞 Missed call SID:', callSid);
        TwilioService.logCall(number, 'incoming', status, 0, contactName, callSid).then(() => {
          // Refresh logs from server after update
          if (onCallEnd) onCallEnd();
        });
        
        // Reset status to Ready
        setStatus({ message: 'Ready', type: 'ready' });
        
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
      // Extract call SID from customParameters (server-side) or parameters (fallback)
      newCall._callSid = newCall.customParameters?.get('CallSid') || newCall.parameters.CallSid;
      console.log('📞 Hold & Answer - Call SID:', newCall._callSid);
      
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
            const duration = Math.round((Date.now() - callStartTimeRef.current) / 1000);
            const contactName = contactsRef.current[newCall._callerNumber || newNumber] || newName;
            TwilioService.logCall(newCall._callerNumber || newNumber, 'incoming', 'completed', duration, contactName, newCall._callSid).then(() => {
              // Refresh logs from server after update
              if (onCallEnd) onCallEnd();
            });
            
            // Reset UI and switch to held call (don't call handleCallEnd - already logged above)
            stopTimer();
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
              setCallTimer('--:--');
            } else {
              setIsInCall(false);
              setCallState('IDLE');
              setCallTimer('00:00');
              setCurrentCall(null);
              setPhoneNumber('+');
              setStatus({ message: 'Ready', type: 'ready' });
              setIsConference(false);
              setConferenceParticipants([]);
            }
          }
        });
        
        newCall.on('error', (error) => {
          console.error('Active call error:', error);
          if (!newCall._alreadyLogged) {
            newCall._alreadyLogged = true;
            const duration = Math.round((Date.now() - callStartTimeRef.current) / 1000);
            const contactName = contactsRef.current[newCall._callerNumber || newNumber] || newName;
            TwilioService.logCall(newCall._callerNumber || newNumber, 'incoming', 'failed', duration, contactName, newCall._callSid).then(() => {
              // Refresh logs from server after update
              if (onCallEnd) onCallEnd();
            });
            
            // Reset UI (don't call handleCallEnd - already logged above)
            stopTimer();
            setIsInCall(false);
            setCallState('IDLE');
            setCallTimer('00:00');
            setCurrentCall(null);
            setPhoneNumber('+');
            setStatus({ message: 'Ready', type: 'ready' });
            setIsConference(false);
            setConferenceParticipants([]);
          }
        });
      }
    };
    
    window.handleConferenceAdd = (call, number, name) => {
      console.log('Adding to conference:', name || number);
      // Extract call SID for the conference participant
      call._callSid = call.customParameters?.get('CallSid') || call.parameters.CallSid;
      call._direction = 'incoming';
      console.log('📞 Conference - Call SID:', call._callSid);
      
      setIsConference(true);
      setConferenceParticipants(prev => [...prev, { number, name: name || number, call }]);
      setCallWith('Conference Call');
      
      // Set up events for new participant
      call.on('disconnect', () => {
        console.log('Participant left:', name || number);
        setConferenceParticipants(prev => prev.filter(p => p.number !== number));
        // Log the conference participant's disconnect
        if (!call._alreadyLogged) {
          call._alreadyLogged = true;
          const contactName = contactsRef.current[number] || name;
          TwilioService.logCall(number, 'incoming', 'completed', 0, contactName, call._callSid).then(() => {
            if (onCallEnd) onCallEnd();
          });
        }
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
      
      <div className="phone-input-container">
        <input
          id="phoneInput"
          type="text"
          className="phone-input"
          placeholder="Phone number"
          value={phoneNumber}
          onChange={handlePhoneInput}
          onKeyDown={handlePhoneKeyDown}
          disabled={isInCall}
          autoComplete="off"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="suggestions-dropdown">
            {suggestions.map((call, index) => (
              <div
                key={call.number + index}
                className={`suggestion-item ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                onClick={() => selectSuggestion(call)}
              >
                <div className="suggestion-name">{call.name || 'Unknown'}</div>
                <div className="suggestion-number">{call.number}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {callerIds && !isInCall && (
        <div className="caller-id-selector">
          <label htmlFor="callerIdToggle">
            <input 
              id="callerIdToggle"
              type="checkbox"
              checked={useIsraelAlt} 
              onChange={(e) => {
                console.log('Checkbox clicked! New value:', e.target.checked);
                setUseIsraelAlt(e.target.checked);
                console.log('State should now be:', e.target.checked);
              }}
            />
            Use Alternate Israel Number ({callerIds.israel_alt})
          </label>
        </div>
      )}      
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
