# Fix US Calling Issue

## Problem
US calls fail immediately (0 duration) because Twilio blocks them.

## Possible Causes

### 1. **Trial Account Limitations**
If you're on a Twilio trial account:
- You can ONLY call **verified numbers**
- You must verify each US number you want to call at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified

### 2. **Caller ID Not Enabled for Voice**
Your US number `+13479527921` might not have voice calling enabled:
- Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/active
- Click on `+13479527921`
- Check if "Voice & Messaging" is enabled
- If not, you need to purchase a voice-enabled number

### 3. **Geographic Permissions**
Twilio may block international calls by default:
- Go to: https://console.twilio.com/us1/develop/voice/settings/geo-permissions
- Enable "United States & Canada" for outbound calls
- Enable any other countries you want to call

## Quick Solutions

### Solution 1: Use a Different US Number (Recommended)
If your current US number isn't voice-enabled, purchase a new one:
1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/search
2. Select "Country: United States"
3. Check "Voice" capability
4. Purchase number
5. Update `.env` file: `TWILIO_PHONE_US=+1YOURNEWNUMBER`

### Solution 2: Verify Destination Numbers (Trial Account)
If on trial account:
1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/verified
2. Click "Add a new number"
3. Verify each number you want to call
4. Try calling verified numbers only

### Solution 3: Check Current Number Configuration
```bash
# Check if your US number is active and voice-enabled in Twilio Console
# URL: https://console.twilio.com/us1/develop/phone-numbers/manage/active
```

## How to Test
1. Apply one of the solutions above
2. Restart servers: `.\STOP-ALL.bat` then `.\START-ALL.bat`
3. Try calling a US number: `+1XXXXXXXXXX`
4. Check server logs for errors

## Alternative: Remove US Calling
If you only need Israel calling:
1. Remove US number requirement from server.py
2. Only use Israeli caller IDs
