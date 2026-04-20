import React, { useEffect } from 'react';
import { TwilioService } from '../services/TwilioService';
import { HeadsetService } from '../services/HeadsetService';
import './IncomingCallModal.css';

function IncomingCallModal({ incomingCall, setIncomingCall, setCurrentCall, currentCall, contacts, onCallEnd }) {
  const callerNumber = incomingCall?.parameters.From;
  const callerName = contacts[callerNumber] || callerNumber;
  const isCallWaiting = !!currentCall;
  
  console.log('IncomingCallModal render:', { 
    hasIncoming: !!incomingCall, 
    hasCurrent: !!currentCall, 
    isCallWaiting,
    callerNumber 
  });

  // Expose answer function for headset & signal incoming call to Jabra headset
  useEffect(() => {
    if (incomingCall) {
      window.answerPendingIncomingCall = () => answerCall();

      // Ring the Jabra headset — if user presses call button, auto-answer
      if (HeadsetService.connected) {
        HeadsetService.signalIncomingCall(60000).then(accepted => {
          if (accepted === true && window.answerPendingIncomingCall) {
            console.log('🎧 Jabra SDK: Answering incoming call via headset button');
            window.answerPendingIncomingCall();
          } else if (accepted === false) {
            console.log('🎧 Jabra SDK: Call rejected from headset');
          }
        });
      }
    } else {
      // incomingCall became null — call was answered, rejected, or cancelled from UI
      // Stop headset ringing if it's still going
      HeadsetService.stopRinging();
      delete window.answerPendingIncomingCall;
    }
    return () => { delete window.answerPendingIncomingCall; };
  }, [incomingCall, currentCall]);

  useEffect(() => {
    if (incomingCall && !incomingCall._cancelHandlerAttached) {
      incomingCall._cancelHandlerAttached = true;
      
      incomingCall.on('cancel', () => {
        console.log('Incoming call canceled - entry already exists as missed');
        HeadsetService.stopRinging();
        setIncomingCall(null);
        
        // Reset status
        if (window.setDialerStatus) {
          window.setDialerStatus({ message: 'Ready', type: 'ready' });
        }

        // Refresh call logs so the missed call appears without manual page refresh
        if (onCallEnd) onCallEnd();
      });
      
      incomingCall.on('reject', () => {
        console.log('Incoming call rejected');
        
        // Mark as answered to prevent cancel from firing
        incomingCall._wasAnswered = true;
        
        // Update the existing entry with rejected status
        if (window.handleIncomingCallMissed) {
          window.handleIncomingCallMissed(incomingCall, callerNumber, callerName, 'rejected');
        }
      });
    }
  }, [incomingCall, callerNumber, callerName]);

  const holdAndAnswer = () => {
    if (incomingCall && currentCall) {
      console.log('Hold and answer initiated');
      
      // Stop headset ringing immediately
      HeadsetService.stopRinging();
      
      // Mark incoming call as answered
      incomingCall._wasAnswered = true;
      
      // Call the global handler FIRST to set up hold logic
      if (window.handleHoldAndAnswer) {
        window.handleHoldAndAnswer(incomingCall, callerNumber, callerName, currentCall);
      }
      
      // Accept the incoming call AFTER hold is set up
      incomingCall.accept();
      setIncomingCall(null);
    }
  };

  const answerCall = () => {
    if (incomingCall) {
      console.log('Answering call...');
      
      // Stop headset ringing immediately
      HeadsetService.stopRinging();
      
      // Mark call as answered to prevent cancel handler from logging it as missed
      incomingCall._wasAnswered = true;
      
      // If already on a call, end it first
      if (currentCall) {
        console.log('Ending current call to answer new call');
        if (window.device) {
          window.device.disconnectAll();
        }
        // Small delay to ensure current call ends
        setTimeout(() => {
          incomingCall.accept();
          setCurrentCall(incomingCall);
          setIncomingCall(null);
          
          if (window.handleIncomingCallAnswer) {
            window.handleIncomingCallAnswer(incomingCall, callerNumber, callerName);
          }
        }, 300);
      } else {
        incomingCall.accept();
        setCurrentCall(incomingCall);
        setIncomingCall(null);
        
        if (window.handleIncomingCallAnswer) {
          window.handleIncomingCallAnswer(incomingCall, callerNumber, callerName);
        }
      }
    }
  };

  const addToConference = () => {
    if (incomingCall && currentCall) {
      console.log('Adding to conference...');
      
      // Stop headset ringing immediately
      HeadsetService.stopRinging();
      
      // Accept the incoming call to join conference
      incomingCall.accept();
      
      if (window.handleConferenceAdd) {
        window.handleConferenceAdd(incomingCall, callerNumber, callerName);
      }
      
      setIncomingCall(null);
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      console.log('Rejecting call...');
      
      // Stop headset ringing immediately
      HeadsetService.stopRinging();
      
      // Mark as answered to prevent cancel from also firing
      incomingCall._wasAnswered = true;
      
      // Reject will trigger the reject event which updates the entry
      incomingCall.reject();
      setIncomingCall(null);
    }
  };

  if (!incomingCall) return null;

  return (
    <div className="incoming-modal">
      <div className="modal-content">
        <div className="modal-title">📞 {isCallWaiting ? 'Call Waiting' : 'Incoming Call'}</div>
        <div className="modal-caller">{callerName}</div>
        
        {isCallWaiting && (
          <div className="call-waiting-info">
            <i className="fas fa-exclamation-circle"></i>
            You're currently on a call
          </div>
        )}
        
        <div className="modal-actions">
          <button className="btn-answer" onClick={answerCall}>
            <i className="fas fa-phone"></i> {isCallWaiting ? 'End & Answer' : 'Answer'}
          </button>
          {isCallWaiting && (
            <button className="btn-conference" onClick={addToConference}>
              <i className="fas fa-users"></i> Add to Call
            </button>
          )}
          <button className="btn-reject" onClick={rejectCall}>
            <i className="fas fa-phone-slash"></i> Reject
          </button>
        </div>
      </div>
    </div>
  );
}

export default IncomingCallModal;
