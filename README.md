# Twilio Web Client

A modern browser-based calling application built with React and Flask, powered by Twilio Voice SDK.

## Features

- 📞 Make and receive calls directly from your browser
- 📋 Call history tracking
- 👥 Contact management
- ⏳ Call waiting support
- 🔢 DTMF keypad for IVR navigation
- 🖼️ Picture-in-Picture mode for minimized calls
- 🎯 Conference calling (add participants)

## Prerequisites

- Python 3.8+
- Node.js 14+
- A Twilio account with:
  - Account SID
  - API Key and Secret
  - TwiML App
  - Phone number

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd twilio_web_client
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your Twilio credentials:

```bash
cp .env.example .env
```

Edit `.env` and add your Twilio credentials:

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_API_KEY=your_api_key
TWILIO_API_SECRET=your_api_secret
TWILIO_TWIML_APP_SID=your_twiml_app_sid
TWILIO_PHONE_NUMBER=+1234567890
NGROK_AUTHTOKEN=your_ngrok_authtoken
```

### 3. Configure ngrok

Run the setup script to configure ngrok with your authtoken:

```bash
SETUP-NGROK.bat
```

Or manually:
```bash
ngrok config add-authtoken YOUR_TOKEN_FROM_ENV_FILE
```

### 4. Install Python Dependencies

```bash
pip install flask twilio python-dotenv
```

### 4. Install Node Dependencies

```bash
npm install
```

### 5. Configure Twilio TwiML App

In your Twilio Console, configure your TwiML App with:
- **Voice Request URL**: `https://your-ngrok-url.ngrok.io/voice`
- **Voice Status Callback URL**: (optional)

### 6. Start the Application

#### Option A: Automatic (Windows)

Double-click `START-ALL.bat` to start all servers automatically.

#### Option B: Manual

Start each server in separate terminals:

```bash
# Terminal 1 - Flask Backend
python server.py

# Terminal 2 - React Frontend
npm start

# Terminal 3 - ngrok (for public URL)
ngrok http 5000
```

### 7. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Making Calls
1. Enter a phone number in the format: `+1234567890`
2. Click "Call"
3. Use the keypad button during calls to send DTMF tones

### Receiving Calls
- Incoming calls will show a modal with answer/reject options
- If already on a call, you can:
  - End current call and answer new one
  - Add the new caller to a conference
  - Reject the new call

### Picture-in-Picture
- During a call, minimize the browser window
- A small floating window will automatically appear
- Control the call from the PiP window

### Call History & Contacts
- All calls are automatically logged
- Save frequently called numbers as contacts
- Click any log entry to quickly redial

## Project Structure

```
twilio_web_client/
├── src/
│   ├── components/
│   │   ├── Dialer.js          # Main calling interface
│   │   ├── CallLogs.js        # Call history
│   │   ├── Contacts.js        # Contact management
│   │   └── IncomingCallModal.js
│   ├── services/
│   │   └── TwilioService.js   # Twilio SDK wrapper
│   ├── App.js                 # Root component
│   └── index.js
├── server.py                   # Flask backend API
├── .env                        # Your credentials (not in git)
├── .env.example               # Template for credentials
├── START-ALL.bat              # Windows launcher
└── STOP-ALL.bat               # Stop all servers
```

## Technology Stack

- **Frontend**: React 18.2
- **Backend**: Flask 3.1
- **Calling**: Twilio Voice SDK 2.11
- **Styling**: Custom CSS with Font Awesome icons

## Security Notes

⚠️ **Important**: 
- Never commit your `.env` file to git
- Keep your Twilio credentials secure
- The `.gitignore` is configured to exclude sensitive files

## Troubleshooting

### Calls not connecting
- Check that ngrok is running and the URL is updated in Twilio Console
- Verify all environment variables are set correctly
- Check browser console for errors

### No incoming calls
- Ensure TwiML App is configured with correct ngrok URL
- Verify your Twilio phone number is linked to the TwiML App

### DTMF not working
- Make sure you're in an active call
- Check browser console for "Sending DTMF" logs

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first.
