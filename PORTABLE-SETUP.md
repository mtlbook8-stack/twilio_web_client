# Twilio Browser Voice Client - Portable Setup

## Files Needed (copy these to new computer)
1. All project files from GitHub repository
2. `.env.example` - Copy and rename to `.env`, then fill in your credentials

## Quick Setup on New Computer

### Step 1: Clone Repository
```bash
git clone <your-repo-url>
cd twilio_web_client
```

### Step 2: Configure Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your credentials:
# - TWILIO_ACCOUNT_SID
# - TWILIO_API_KEY
# - TWILIO_API_SECRET
# - TWILIO_TWIML_APP_SID
# - TWILIO_PHONE_NUMBER
# - NGROK_AUTHTOKEN
```

### Step 3: Install Python Dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Install Node Dependencies
```bash
npm install
```

### Step 5: Configure ngrok
```bash
# Run the setup script (reads from .env)
SETUP-NGROK.bat

# Or manually:
ngrok config add-authtoken YOUR_NGROK_TOKEN_FROM_ENV
```

### Step 6: Start All Services
```bash
# Windows: Double-click START-ALL.bat
# Or manually start each service in separate terminals:

# Terminal 1 - Flask Server
python server.py

# Terminal 2 - React Dev Server
npm start

# Terminal 3 - ngrok Tunnel
ngrok http 5000
```

### Step 7: Configure Twilio TwiML App
1. Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok-free.app`)
2. Go to: https://console.twilio.com/us1/develop/voice/manage/twiml-apps
3. Select your TwiML App
4. Set "Voice Request URL" to: `https://YOUR-NGROK-URL/voice`
5. Set HTTP method to: POST
6. Click Save

### Step 8: Test
Open browser: http://localhost:3000
Enter phone number and click Call!

---

## Your Credentials
All credentials are stored in `.env` file (NOT committed to git).
Get your credentials from:
- Twilio Console: https://console.twilio.com
- ngrok Dashboard: https://dashboard.ngrok.com/get-started/your-authtoken

---

## Troubleshooting
- **Port 5000 in use**: Change to another port in code and ngrok command
- **Can't reach localhost:3000**: Check React dev server is running
- **No audio**: Make sure ngrok URL is configured in Twilio TwiML App
- **Missing credentials**: Check your .env file is properly configured
- **Certificate errors**: Try different network (not filtered)
