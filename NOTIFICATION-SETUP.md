# Browser Notifications & Missed Call Tracking

## What Was Implemented

### 1. Browser Notifications ✅
- **Desktop notifications** when incoming calls arrive, even when the tab is not active
- **Auto-request permission** on first app load
- **Click-to-focus** - clicking notification brings the app window into focus
- **Auto-dismiss** after 30 seconds
- Shows caller name or number in the notification

### 2. Server-Side Missed Call Tracking ✅
- **Automatic missed call logging** - when calls are not answered, the server logs them
- **Status callback webhook** - `/call-status` endpoint handles Twilio's callback
- Tracks call status: `no-answer`, `busy`, `failed`, `canceled`
- **Persistent storage** - missed calls saved to `call_history.json` even if browser is closed

### 3. Missed Call Display ✅
- **Red badge** in call logs for missed calls
- **Distinct styling** - already implemented in CallLogs.css
- Shows as "Missed" with 0 duration

## How It Works

### Flow Diagram
```
Incoming Call → Twilio → /incoming webhook (server)
                            ↓
                    Stores call info + Call SID
                            ↓
                    Dials browser client (30s timeout)
                            ↓
                    Browser shows notification
                            ↓
            ┌───────────────┴───────────────┐
            ↓                               ↓
        ANSWERED                       NO ANSWER
            ↓                               ↓
    Client logs call              /call-status callback
                                           ↓
                                  Server logs as MISSED
```

## Setup Instructions

### 1. Enable Browser Notifications
When you first load the app, you'll see a browser permission prompt:
- Click **"Allow"** to enable notifications
- If you clicked "Block" by mistake:
  1. Click the lock icon in your browser's address bar
  2. Change "Notifications" to "Allow"
  3. Refresh the page

### 2. Configure Twilio Webhook (IMPORTANT!)

For missed calls to be logged on the server side, you need to ensure your ngrok URL is publicly accessible:

#### A. Start ngrok (if not already running)
```bash
ngrok http 5000
```

#### B. Update Twilio TwiML App
1. Go to: https://console.twilio.com/us1/develop/voice/manage/twiml-apps
2. Find your TwiML App
3. Set **Voice Request URL** to:
   ```
   https://YOUR-NGROK-URL.ngrok-free.app/incoming
   ```
   (Replace `YOUR-NGROK-URL` with your actual ngrok URL)

4. Set **Voice Request Method** to: `POST`

5. Click **Save**

> **Note**: Every time ngrok restarts, you get a new URL and need to update Twilio!

### 3. Test It Out

#### Test Missed Calls:
1. Call your Twilio number from another phone
2. **Don't answer** or **reject** the call
3. Check the call logs - you should see a red "Missed" entry
4. The missed call is logged **even if your browser was closed**!

#### Test Notifications:
1. Minimize or switch away from the browser tab
2. Call your Twilio number
3. You should see a desktop notification pop up
4. Click the notification to bring the app into focus

## Files Modified

### Server-Side (`server.py`)
- **`/incoming` endpoint**: Enhanced to track call SID and set timeout
- **`/call-status` endpoint**: NEW - handles missed call logging
- **`incoming_calls.json`**: NEW - temporary tracking file

### Client-Side (`src/App.js`)
- **`requestNotificationPermission()`**: Requests permission on load
- **`showNotification()`**: Shows browser notification
- **`handleIncomingCall()`**: Enhanced to trigger notification

## Troubleshooting

### Notifications Not Showing?
1. **Check browser permission**: Should see "Allowed" for notifications
2. **Check Do Not Disturb**: Disable system DND mode
3. **Check console**: Look for "Notification permission: granted"

### Missed Calls Not Logged?
1. **Check ngrok is running**: `ngrok http 5000`
2. **Check Twilio webhook URL**: Must point to your current ngrok URL
3. **Check server logs**: Look for `[CALL-STATUS]` and `[MISSED-CALL]` messages
4. **Check files exist**: 
   - `call_history.json` should contain missed entries
   - `incoming_calls.json` tracks active/recent calls

### Getting "ngrok not found"?
Install ngrok:
```bash
choco install ngrok
# OR download from: https://ngrok.com/download
```

## Browser Support

| Browser | Notifications | Status |
|---------|--------------|---------|
| Chrome | ✅ Full Support | Recommended |
| Edge | ✅ Full Support | Recommended |
| Firefox | ✅ Full Support | Works great |
| Safari | ⚠️ Limited | May need extra permissions |

## Privacy & Security

- Notifications only show when **permission is granted**
- Can be **disabled anytime** from browser settings
- No data is sent to external services
- All call data stays on your server

## Need Help?

Check the browser console for detailed logs:
- `[INCOMING]` - Incoming call received by server
- `[CALL-STATUS]` - Call status callback from Twilio
- `[MISSED-CALL]` - Missed call logged to history
- `Notification permission: ...` - Current notification status
