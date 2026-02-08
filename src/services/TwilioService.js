export class TwilioService {
  static tokenRefreshTimer = null;

  static async initialize(setStatus, onIncomingCall) {
    try {
      // Get access token from Python API
      const response = await fetch('/api/token');
      const data = await response.json();
      
      if (!data.token) {
        throw new Error('Failed to get access token');
      }

      // Create Twilio Device with options to allow call waiting
      const device = new window.Twilio.Device(data.token, {
        allowIncomingWhileBusy: true,  // Enable call waiting
        codecPreferences: ['opus', 'pcmu'],
        maxCallSignalingTimeoutMs: 30000
      });
      
      console.log('Device created with allowIncomingWhileBusy enabled');
      
      // Set up automatic token refresh (refresh 5 minutes before expiration)
      if (data.ttl) {
        const refreshInterval = (data.ttl - 300) * 1000; // Convert to ms, refresh 5 min early
        console.log(`🔄 Token auto-refresh will occur every ${Math.round(refreshInterval / 60000)} minutes`);
        
        TwilioService.setupTokenRefresh(device, refreshInterval, setStatus);
      }

      // Device ready
      device.on('registered', () => {
        console.log('Twilio Device Ready');
        setStatus({ message: 'Ready', type: 'ready' });
      });

      // Incoming call
      console.log('Setting up incoming call handler');
      device.on('incoming', (call) => {
        console.log('🔔 DEVICE INCOMING EVENT FIRED:', call.parameters.From);
        console.log('Call parameters:', call.parameters);
        console.log('Call customParameters:', call.customParameters);
        console.log('Device state:', device.state);
        console.log('Calling onIncomingCall...');
        onIncomingCall(call);
      });

      // Device errors
      device.on('error', (error) => {
        console.error('Device Error:', error);
        setStatus({ message: 'Error: ' + error.message, type: 'error' });
      });

      // Register the device
      await device.register();

      return device;
    } catch (error) {
      throw error;
    }
  }

  static setupTokenRefresh(device, interval, setStatus) {
    // Clear any existing timer
    if (TwilioService.tokenRefreshTimer) {
      clearInterval(TwilioService.tokenRefreshTimer);
    }

    // Set up periodic token refresh
    TwilioService.tokenRefreshTimer = setInterval(async () => {
      try {
        console.log('🔄 Refreshing Twilio access token...');
        const response = await fetch('/api/token');
        const data = await response.json();
        
        if (data.token && device) {
          await device.updateToken(data.token);
          console.log('✅ Token refreshed successfully');
          
          // Brief status update
          const previousStatus = setStatus;
          setStatus({ message: 'Token refreshed', type: 'ready' });
          setTimeout(() => {
            setStatus({ message: 'Ready', type: 'ready' });
          }, 2000);
        }
      } catch (error) {
        console.error('❌ Failed to refresh token:', error);
        setStatus({ message: 'Token refresh failed - please refresh page', type: 'error' });
      }
    }, interval);
  }

  static setupCallEvents(call, callbacks) {
    const { onRinging, onConnected, onDisconnected, onCanceled, onRejected, onError } = callbacks;

    call.on('ringing', () => {
      console.log('Call is ringing...');
      onRinging && onRinging();
    });

    call.on('accept', () => {
      console.log('Call connected');
      onConnected && onConnected();
    });

    call.on('disconnect', () => {
      console.log('Call disconnected');
      onDisconnected && onDisconnected('completed');
    });

    call.on('cancel', () => {
      console.log('Call canceled');
      onCanceled && onCanceled('canceled');
    });

    call.on('reject', () => {
      console.log('Call rejected');
      onRejected && onRejected('rejected');
    });

    call.on('error', (error) => {
      console.error('Call error:', error);
      onError && onError('failed');
    });
  }

  static async logCall(phoneNumber, direction, status, duration, contactName, callSid = null) {
    console.log('🔹 logCall called:', { phoneNumber, direction, status, duration, contactName, callSid });
    
    try {
      // Incoming calls: Server creates, client updates (requires callSid)
      if (direction === 'incoming') {
        if (!callSid) {
          console.error('ERROR: Incoming call missing callSid - cannot update!');
          return;
        }
        
        console.log('📥 Updating incoming call...');
        await fetch('/api/update-call-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_sid: callSid,
            status: status,
            duration: duration
          })
        });
        console.log(`✅ Updated incoming call ${callSid} with status: ${status}, duration: ${duration}`);
      } else {
        // Outgoing calls: Client creates new entry
        console.log('📤 Creating outgoing call entry...');
        const logEntry = {
          number: phoneNumber,
          name: contactName || null,
          direction,
          status,
          duration
        };

        const response = await fetch('/api/call-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logEntry)
        });
        
        const result = await response.json();
        console.log(`✅ Created outgoing call log: ${phoneNumber}, status: ${status}, duration: ${duration}`, result);
      }
    } catch (error) {
      console.error('Failed to log call:', error);
    }
  }
}
