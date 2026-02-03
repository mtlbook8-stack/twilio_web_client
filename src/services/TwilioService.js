export class TwilioService {
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

      // Device ready
      device.on('registered', () => {
        console.log('Twilio Device Ready');
        setStatus({ message: 'Ready', type: 'ready' });
      });

      // Incoming call
      console.log('Setting up incoming call handler');
      device.on('incoming', (call) => {
        console.log('🔔 DEVICE INCOMING EVENT FIRED:', call.parameters.From);
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

  static async logCall(phoneNumber, direction, status, duration, contactName) {
    try {
      const logEntry = {
        number: phoneNumber,
        name: contactName || null,
        direction,
        status,
        duration
      };

      await fetch('/api/call-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      });
    } catch (error) {
      console.error('Failed to log call:', error);
    }
  }
}
