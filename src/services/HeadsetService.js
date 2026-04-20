// Jabra headset call control via @gnaudio/jabra-js SDK
//
// Note: With Jabra Link 380 dongle + wireless headset, the SDK cannot
// distinguish headset on vs off — the dongle always appears connected.
// This matches Teams' behavior. We connect to the dongle and it works
// transparently when the headset is powered on.
//
// Limitation: The Jabra SDK call lock is per-transport — whichever softphone
// starts a call first "owns" the headset. We can't put Teams on hold from here.

import { init, webHidPairing, EasyCallControlFactory, RequestedBrowserTransport } from '@gnaudio/jabra-js';

export class HeadsetService {
  static _jabra = null;           // SDK API instance
  static _callControl = null;     // SingleCallControl instance
  static _device = null;          // Current Jabra device
  static _subscriptions = [];     // RxJS subscriptions for call control
  static _sdkSubscriptions = [];  // SDK-level subscriptions (survive reconnects)
  static _callStarted = false;    // True after startCall(), prevents spurious hangups
  static _reconnecting = false;   // Prevents reconnect loops
  static _ringing = false;        // True while signalIncomingCall is active
  static connected = false;       // Device is present (for icon)
  static callbacks = {
    onHookSwitch: null,
    onRejectCall: null,
    onMuteChange: null,
    onConnectedChange: null,
  };

  static isSupported() {
    const supported = 'hid' in navigator;
    console.log('🎧 Jabra SDK: isSupported =', supported, '| secure context:', window.isSecureContext);
    return supported;
  }

  static async _initSdk() {
    if (this._jabra) return this._jabra;

    try {
      console.log('🎧 Jabra SDK: Initializing...');
      this._jabra = await init({
        transport: RequestedBrowserTransport.WEB_HID,
        appId: 'twilio-web-client',
        appName: 'Twilio Web Client',
      });
      console.log('🎧 Jabra SDK: ✅ Initialized');

      // Auto-detect devices — icon is based on device presence (deviceAdded/Removed),
      // NOT on call control state (which can disconnect/reconnect without losing the device)
      this._sdkSubscriptions.push(
        this._jabra.deviceAdded.subscribe((device) => {
          console.log('🎧 Jabra SDK: Device added:', device.name, '(type:', device.type, ')');
          if (!this.connected) {
            this._device = device;
            this.connected = true;
            if (this.callbacks.onConnectedChange) {
              this.callbacks.onConnectedChange(true);
            }
            this._setupCallControl(device);
          }
        })
      );

      this._sdkSubscriptions.push(
        this._jabra.deviceRemoved.subscribe((device) => {
          console.log('🎧 Jabra SDK: Device removed:', device.name);
          if (this._device && this._device.id?.toString() === device.id?.toString()) {
            this._cleanupCallControl();
            this._device = null;
            this.connected = false;
            if (this.callbacks.onConnectedChange) {
              this.callbacks.onConnectedChange(false);
            }
          }
        })
      );

      return this._jabra;
    } catch (err) {
      console.error('🎧 Jabra SDK: Init failed:', err);
      this._jabra = null;
      return null;
    }
  }

  static async tryAutoConnect() {
    if (!this.isSupported() || this.connected) return false;

    try {
      const jabra = await this._initSdk();
      if (!jabra) return false;

      const devices = jabra.getCurrentDevices();
      console.log('🎧 Jabra SDK: Auto-connect: found', devices.length, 'device(s)');

      if (devices.length > 0) {
        const device = devices[0];
        console.log('🎧 Jabra SDK: Auto-connecting to:', device.name);
        this._device = device;
        this.connected = true;
        await this._setupCallControl(device);
        return true;
      }
    } catch (err) {
      console.warn('🎧 Jabra SDK: Auto-connect failed:', err.message);
    }
    return false;
  }

  static async connect() {
    if (!this.isSupported()) return false;
    if (this.connected) return true;

    try {
      const jabra = await this._initSdk();
      if (!jabra) return false;

      console.log('🎧 Jabra SDK: Requesting WebHID pairing...');
      await webHidPairing();
      await new Promise(r => setTimeout(r, 1000));

      const devices = jabra.getCurrentDevices();
      if (devices.length > 0) {
        const device = devices[0];
        this._device = device;
        this.connected = true;
        await this._setupCallControl(device);
        return true;
      }
      return false;
    } catch (err) {
      console.error('🎧 Jabra SDK: Connect failed:', err);
      return false;
    }
  }

  static async _setupCallControl(device) {
    try {
      console.log('🎧 Jabra SDK: Setting up call control for:', device.name);

      const eccFactory = new EasyCallControlFactory(this._jabra);

      if (!eccFactory.supportsEasyCallControl(device)) {
        console.warn('🎧 Jabra SDK: Device does not support EasyCallControl');
        return;
      }

      // Clean up any existing call control before creating new one
      this._subscriptions.forEach(s => s.unsubscribe());
      this._subscriptions = [];
      if (this._callControl) {
        try { this._callControl.teardown(); } catch (e) { /* ignore */ }
      }

      this._callControl = await eccFactory.createSingleCallControl(device);
      this._callStarted = false;
      console.log('🎧 Jabra SDK: ✅ SingleCallControl created');

      // Subscribe to mute state changes (boom arm + mute button)
      this._subscriptions.push(
        this._callControl.muteState.subscribe((state) => {
          const stateStr = String(state);
          console.log('🎧 Jabra SDK: Mute state:', stateStr, '(raw:', state, ')');
          if (this.callbacks.onMuteChange) {
            this.callbacks.onMuteChange(stateStr);
          }
        })
      );

      // Subscribe to device disconnect (call control level)
      // This does NOT change the connected icon — only deviceRemoved does that.
      // Instead, attempt to silently reconnect call control.
      this._subscriptions.push(
        this._callControl.onDisconnect.subscribe(() => {
          console.log('🎧 Jabra SDK: Call control disconnected (device still present)');
          this._subscriptions.forEach(s => s.unsubscribe());
          this._subscriptions = [];
          if (this._callControl) {
            try { this._callControl.teardown(); } catch (e) { /* ignore */ }
            this._callControl = null;
          }
          this._callStarted = false;

          // Try to reconnect call control after a delay
          if (this._device && !this._reconnecting) {
            this._reconnecting = true;
            setTimeout(() => {
              this._reconnecting = false;
              if (this._device) {
                console.log('🎧 Jabra SDK: Reconnecting call control...');
                this._setupCallControl(this._device);
              }
            }, 3000);
          }
        })
      );

      // Subscribe to callActive — only trigger hangup AFTER we've called startCall()
      // to prevent the initial emission of false from disconnecting an active Twilio call
      this._subscriptions.push(
        this._callControl.callActive.subscribe((active) => {
          console.log('🎧 Jabra SDK: callActive changed:', active, '(callStarted:', this._callStarted, ')');
          if (!active && this._callStarted && this.callbacks.onHookSwitch) {
            this.callbacks.onHookSwitch('hangup');
          }
        })
      );

      console.log('🎧 Jabra SDK: ✅ Call control ready — hook switch = call button, mute = boom arm');
    } catch (err) {
      console.error('🎧 Jabra SDK: Call control setup failed:', err);
    }
  }

  // Signal incoming call — resolves true if user accepts on headset, false if rejected
  static async signalIncomingCall(timeoutMs = 30000) {
    if (!this._callControl) return null;

    try {
      console.log('🎧 Jabra SDK: Signaling incoming call to headset');
      this._ringing = true;
      const accepted = await this._callControl.signalIncomingCall(timeoutMs);
      this._ringing = false;
      console.log('🎧 Jabra SDK: Incoming call', accepted ? 'ACCEPTED' : 'REJECTED', 'on headset');
      return accepted;
    } catch (err) {
      this._ringing = false;
      console.warn('🎧 Jabra SDK: signalIncomingCall error:', err.message);
      return null;
    }
  }

  // Stop headset ringing (when call is answered/rejected/cancelled from UI, not from headset)
  static async stopRinging() {
    if (!this._callControl || !this._ringing) return;

    try {
      console.log('🎧 Jabra SDK: Stopping headset ring');
      this._ringing = false;
      await this._callControl.rejectIncomingCall();
    } catch (err) {
      console.warn('🎧 Jabra SDK: stopRinging error:', err.message);
    }
  }

  static async startCall() {
    if (!this._callControl) return;

    try {
      // Must stop any pending ring before starting a call,
      // otherwise the SDK throws "Cannot start a new call while another call is incoming"
      if (this._ringing) {
        await this.stopRinging();
      }
      this._callStarted = true;
      await this._callControl.startCall();
      console.log('🎧 Jabra SDK: startCall — headset in call mode');
    } catch (err) {
      console.warn('🎧 Jabra SDK: startCall error:', err.message);
    }
  }

  static async endCall() {
    if (!this._callControl) return;

    try {
      // Safety: stop any lingering ring state
      if (this._ringing) {
        await this.stopRinging();
      }
      this._callStarted = false;
      await this._callControl.endCall();
      console.log('🎧 Jabra SDK: endCall — headset idle');
    } catch (err) {
      console.warn('🎧 Jabra SDK: endCall error:', err.message);
    }
  }

  static setCallbacks({ onHookSwitch, onRejectCall, onMuteChange, onConnectedChange }) {
    this.callbacks = {
      onHookSwitch: onHookSwitch || null,
      onRejectCall: onRejectCall || null,
      onMuteChange: onMuteChange || null,
      onConnectedChange: onConnectedChange || null,
    };
    console.log('🎧 Jabra SDK: Callbacks set', {
      hasHookSwitch: !!onHookSwitch,
      hasRejectCall: !!onRejectCall,
      hasMuteChange: !!onMuteChange,
      hasConnectedChange: !!onConnectedChange,
    });
  }

  // Legacy compatibility — maps to startCall/endCall
  static async setCallState({ offHook = false, ringing = false } = {}) {
    // Call state is now managed through startCall/endCall/signalIncomingCall
    // This method is kept for backward compatibility but is a no-op
  }

  static _cleanupCallControl() {
    this._subscriptions.forEach(s => s.unsubscribe());
    this._subscriptions = [];
    if (this._callControl) {
      try { this._callControl.teardown(); } catch (e) { /* ignore */ }
      this._callControl = null;
    }
    this._callStarted = false;
  }

  static disconnect() {
    console.log('🎧 Jabra SDK: Disconnecting');
    this._cleanupCallControl();
    this._sdkSubscriptions.forEach(s => s.unsubscribe());
    this._sdkSubscriptions = [];
    if (this._jabra) {
      try { this._jabra.dispose(); } catch (e) { /* ignore */ }
      this._jabra = null;
    }
  }

  // Clean up on page close to prevent headset stuck in ringing/call state
  static {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        HeadsetService._cleanupCallControl();
      });
    }
  }
}
