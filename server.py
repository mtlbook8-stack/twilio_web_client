"""
Twilio Cloud Calling App - Production Backend
Modular Flask server with proper API routes
"""

from flask import Flask, jsonify, render_template, request
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.twiml.voice_response import VoiceResponse, Dial
import json
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configuration from environment variables
TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID')
TWILIO_API_KEY = os.getenv('TWILIO_API_KEY')
TWILIO_API_SECRET = os.getenv('TWILIO_API_SECRET')
TWILIO_TWIML_APP_SID = os.getenv('TWILIO_TWIML_APP_SID')
CALLER_ID = os.getenv('TWILIO_PHONE_NUMBER')

# Validate required environment variables
required_vars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_API_KEY',
    'TWILIO_API_SECRET',
    'TWILIO_TWIML_APP_SID',
    'TWILIO_PHONE_NUMBER'
]

missing_vars = [var for var in required_vars if not os.getenv(var)]
if missing_vars:
    raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}. Please check your .env file.")

# Data files
CALL_HISTORY_FILE = 'call_history.json'
CONTACTS_FILE = 'contacts.json'

# Helper functions
def load_json(filename):
    if os.path.exists(filename):
        try:
            with open(filename, 'r') as f:
                content = f.read().strip()
                if not content:
                    return [] if 'history' in filename else {}
                return json.loads(content)
        except (json.JSONDecodeError, ValueError):
            print(f"[WARNING] Corrupted JSON file: {filename}, resetting...")
            return [] if 'history' in filename else {}
    return [] if 'history' in filename else {}

def save_json(filename, data):
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

# API Routes
@app.route('/')
def index():
    with open('index.html', 'r', encoding='utf-8') as f:
        return f.read()

@app.route('/api/token')
def get_token():
    """Generate Twilio access token"""
    identity = 'browser-client-1000'
    
    token = AccessToken(
        TWILIO_ACCOUNT_SID,
        TWILIO_API_KEY,
        TWILIO_API_SECRET,
        identity=identity
    )
    
    voice_grant = VoiceGrant(
        outgoing_application_sid=TWILIO_TWIML_APP_SID,
        incoming_allow=True
    )
    
    token.add_grant(voice_grant)
    
    print(f"[TOKEN] Generated for {identity}")
    
    return jsonify({
        'identity': identity,
        'token': token.to_jwt()
    })

@app.route('/api/call-history', methods=['GET', 'POST'])
def call_history():
    """Get or save call history"""
    if request.method == 'GET':
        return jsonify(load_json(CALL_HISTORY_FILE))
    
    elif request.method == 'POST':
        data = request.json
        history = load_json(CALL_HISTORY_FILE)
        
        # Add timestamp
        data['timestamp'] = datetime.now().isoformat()
        
        # Add to beginning
        history.insert(0, data)
        
        # Keep last 100 calls
        if len(history) > 100:
            history = history[:100]
        
        save_json(CALL_HISTORY_FILE, history)
        
        direction = data.get('direction', 'unknown')
        status = data.get('status', 'unknown')
        print(f"[HISTORY] Saved: {direction} call ({status}) - {data.get('number', 'unknown')}")
        
        return jsonify({'success': True})

@app.route('/api/contacts', methods=['GET', 'POST', 'DELETE'])
def contacts():
    """Manage contacts"""
    if request.method == 'GET':
        return jsonify(load_json(CONTACTS_FILE))
    
    elif request.method == 'POST':
        data = request.json
        contacts_dict = load_json(CONTACTS_FILE)
        contacts_dict[data['number']] = data['name']
        save_json(CONTACTS_FILE, contacts_dict)
        
        print(f"[CONTACTS] Saved: {data['name']} - {data['number']}")
        
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        number = request.json.get('number')
        contacts_dict = load_json(CONTACTS_FILE)
        if number in contacts_dict:
            del contacts_dict[number]
            save_json(CONTACTS_FILE, contacts_dict)
            print(f"[CONTACTS] Deleted: {number}")
        
        return jsonify({'success': True})

@app.route('/voice', methods=['POST'])
def voice():
    """Handle outgoing calls"""
    to_number = request.form.get('To', '')
    
    print(f"[VOICE] Outgoing call to: {to_number}")
    
    response = VoiceResponse()
    if to_number:
        dial = Dial(caller_id=CALLER_ID)
        dial.number(to_number)
        response.append(dial)
    
    return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/incoming', methods=['POST'])
def incoming():
    """Handle incoming calls"""
    from_number = request.form.get('From', 'Unknown')
    
    print(f"[INCOMING] Call from: {from_number}")
    
    response = VoiceResponse()
    dial = Dial()
    dial.client('browser-client-1000')
    response.append(dial)
    
    return str(response), 200, {'Content-Type': 'text/xml'}

if __name__ == '__main__':
    print('\n' + '='*60)
    print('  TWILIO CLOUD CALLING APP - PRODUCTION SERVER')
    print('='*60)
    print('\nServer starting at: http://localhost:5000')
    print('Call History: ' + CALL_HISTORY_FILE)
    print('Contacts: ' + CONTACTS_FILE)
    print('\n' + '='*60 + '\n')
    
    app.run(debug=True, host='0.0.0.0', port=5000)
