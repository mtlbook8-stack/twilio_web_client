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

# Caller ID Numbers
CALLER_IDS = {
    'israel': os.getenv('TWILIO_PHONE_IL'),
    'israel_alt': os.getenv('TWILIO_PHONE_IL_ALT'),
    'us': os.getenv('TWILIO_PHONE_US')
}

# Validate required environment variables
required_vars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_API_KEY',
    'TWILIO_API_SECRET',
    'TWILIO_TWIML_APP_SID',
    'TWILIO_PHONE_IL',
    'TWILIO_PHONE_US'
]

missing_vars = [var for var in required_vars if not os.getenv(var)]
if missing_vars:
    raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}. Please check your .env file.")

def validate_e164(number):
    """Validate and ensure E.164 format"""
    if not number:
        return None
    
    # Remove any whitespace
    number = number.strip()
    
    # E.164 format: starts with +, only digits after
    if not number.startswith('+'):
        return None
    
    # Check that everything after + is digits
    if not number[1:].isdigit():
        return None
    
    return number

def get_caller_id(destination_number, use_israel_alt=False):
    """Select appropriate caller ID based on destination"""
    # Validate destination number format
    destination_number = validate_e164(destination_number)
    if not destination_number:
        raise ValueError(f"Invalid phone number format. Must be E.164 format (e.g., +12125551234)")
    
    # Validate caller ID numbers are in E.164 format
    for key, number in CALLER_IDS.items():
        if number and not validate_e164(number):
            print(f"[ERROR] Caller ID '{key}' is not in valid E.164 format: {number}")
    
    # US & Canada (country code +1)
    if destination_number.startswith('+1'):
        us_caller_id = CALLER_IDS.get('us')
        if us_caller_id and validate_e164(us_caller_id):
            return us_caller_id
        # Fallback to Israeli number if US number not registered
        print(f"[WARNING] US caller ID not available or invalid, using Israeli number")
        return CALLER_IDS['israel']
    # Israel (country code +972)
    elif destination_number.startswith('+972'):
        if use_israel_alt and CALLER_IDS.get('israel_alt'):
            alt_id = CALLER_IDS['israel_alt']
            if validate_e164(alt_id):
                return alt_id
        return CALLER_IDS['israel']
    
    # No default fallback - caller must specify valid region
    raise ValueError(f"Cannot determine caller ID for number: {destination_number}")

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
    
    # Token valid for 4 hours (14400 seconds)
    ttl = 14400
    
    token = AccessToken(
        TWILIO_ACCOUNT_SID,
        TWILIO_API_KEY,
        TWILIO_API_SECRET,
        identity=identity,
        ttl=ttl
    )
    
    voice_grant = VoiceGrant(
        outgoing_application_sid=TWILIO_TWIML_APP_SID,
        incoming_allow=True
    )
    
    token.add_grant(voice_grant)
    
    print(f"[TOKEN] Generated for {identity} (valid for {ttl}s)")
    
    return jsonify({
        'identity': identity,
        'token': token.to_jwt(),
        'ttl': ttl  # Send TTL to client so it knows when to refresh
    })

@app.route('/api/call-history', methods=['GET', 'POST'])
def call_history():
    """Get or save call history"""
    if request.method == 'GET':
        return jsonify(load_json(CALL_HISTORY_FILE))
    
    elif request.method == 'POST':
        data = request.json
        
        # Only allow OUTGOING calls to be created here
        # Incoming calls are created by /incoming endpoint and updated by /api/update-call-history
        if data.get('direction') == 'incoming':
            print(f"[CALL-HISTORY] ERROR: Incoming calls should not be created via POST")
            return jsonify({'success': False, 'error': 'Use /api/update-call-history for incoming calls'}), 400
        
        history = load_json(CALL_HISTORY_FILE)
        
        # Add timestamp
        data['timestamp'] = datetime.now().isoformat()
        
        # Add to beginning
        history.insert(0, data)
        
        # Keep last 100 calls
        if len(history) > 100:
            history = history[:100]
        
        save_json(CALL_HISTORY_FILE, history)
        print(f"[CALL-HISTORY] Saved outgoing: {data.get('number')} - {data.get('status')}")
        
        return jsonify({'success': True})

@app.route('/api/caller-ids', methods=['GET'])
def caller_ids():
    """Get available caller IDs"""
    return jsonify({
        'israel': CALLER_IDS['israel'],
        'israel_alt': CALLER_IDS['israel_alt'],
        'us': CALLER_IDS['us']
    })

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
    to_number = request.form.get('To', '').strip()
    custom_caller_id = request.form.get('CallerId', '').strip()
    use_israel_alt = request.form.get('UseIsraelAlt', 'false').lower() == 'true'
    
    # Validate E.164 format for destination number
    if not validate_e164(to_number):
        print(f"[VOICE ERROR] Invalid destination number format: {to_number}")
        response = VoiceResponse()
        response.say("Invalid phone number format. Please use international format with plus sign.")
        return str(response), 200, {'Content-Type': 'text/xml'}
    
    # DEBUG: Log all incoming parameters
    print(f"[VOICE] === DEBUG ===")
    print(f"[VOICE] All form data: {dict(request.form)}")
    print(f"[VOICE] To (validated): {to_number}")
    print(f"[VOICE] UseIsraelAlt param: {request.form.get('UseIsraelAlt', 'NOT FOUND')}")
    print(f"[VOICE] UseIsraelAlt parsed: {use_israel_alt}")
    print(f"[VOICE] ===============")
    
    # Use custom caller ID if provided, otherwise auto-select
    if custom_caller_id:
        # Validate custom caller ID
        if not validate_e164(custom_caller_id):
            print(f"[VOICE ERROR] Invalid caller ID format: {custom_caller_id}")
            response = VoiceResponse()
            response.say("Invalid caller ID format.")
            return str(response), 200, {'Content-Type': 'text/xml'}
        caller_id = custom_caller_id
        print(f"[VOICE] Using custom caller ID: {caller_id}")
    else:
        try:
            caller_id = get_caller_id(to_number, use_israel_alt)
        except ValueError as e:
            print(f"[VOICE] Error: {e}")
            response = VoiceResponse()
            response.say("Unable to determine caller ID for this destination.")
            return str(response), 200, {'Content-Type': 'text/xml'}
    
    print(f"[VOICE] Outgoing call to: {to_number} using caller ID: {caller_id}")
    
    # NOTE: Outgoing calls are logged by the client, not here
    # Only incoming calls are logged by server (in /incoming endpoint)
    
    response = VoiceResponse()
    if to_number:
        dial = Dial(caller_id=caller_id)
        dial.number(to_number)
        response.append(dial)
    
    return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/incoming', methods=['POST'])
def incoming():
    """Handle incoming calls"""
    from_number = request.form.get('From', 'Unknown')
    call_sid = request.form.get('CallSid', 'Unknown')
    
    # Ensure phone number has + prefix
    if from_number and not from_number.startswith('+'):
        from_number = '+' + from_number.lstrip()
    
    print(f"[INCOMING] Call from: {from_number}, SID: {call_sid}")
    
    # Get contact name
    contacts = load_json(CONTACTS_FILE)
    contact_name = contacts.get(from_number)
    
    # Immediately log as missed with call_sid for later updates
    call_history = load_json(CALL_HISTORY_FILE)
    call_history.insert(0, {
        'call_sid': call_sid,
        'number': from_number,
        'name': contact_name,
        'direction': 'incoming',
        'status': 'missed',
        'duration': 0,
        'timestamp': datetime.now().isoformat()
    })
    save_json(CALL_HISTORY_FILE, call_history)
    print(f"[INCOMING-LOG] Logged call from {from_number} as 'missed' (will update if answered)")
    
    response = VoiceResponse()
    dial = Dial(timeout=30)
    # Pass the CallSid as a custom parameter to the client
    client = dial.client('browser-client-1000')
    client.parameter(name='CallSid', value=call_sid)
    response.append(dial)
    
    print(f"[INCOMING] Passing CallSid to client: {call_sid}")
    return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/api/update-call-history', methods=['POST'])
def update_call_history():
    """Update existing call history entry when client handles the call"""
    data = request.json
    call_sid = data.get('call_sid')
    status = data.get('status')
    duration = data.get('duration', 0)
    
    if not call_sid:
        return jsonify({'success': False, 'error': 'Missing call_sid'}), 400
    
    print(f"[UPDATE-CALL] Updating call {call_sid} to status: {status}, duration: {duration}")
    
    call_history = load_json(CALL_HISTORY_FILE)
    
    # Find and update the entry with matching call_sid
    updated = False
    for entry in call_history:
        if entry.get('call_sid') == call_sid:
            entry['status'] = status
            entry['duration'] = duration
            updated = True
            print(f"[UPDATE-CALL] Updated entry for {entry['number']}")
            break
    
    if updated:
        save_json(CALL_HISTORY_FILE, call_history)
        return jsonify({'success': True})
    else:
        print(f"[UPDATE-CALL] WARNING: Call SID {call_sid} not found in history")
        return jsonify({'success': False, 'error': 'Call not found'}), 404

if __name__ == '__main__':
    print('\n' + '='*60)
    print('  TWILIO CLOUD CALLING APP - PRODUCTION SERVER')
    print('='*60)
    print('\nServer starting at: http://localhost:5000')
    print('Call History: ' + CALL_HISTORY_FILE)
    print('Contacts: ' + CONTACTS_FILE)
    print('\n' + '='*60 + '\n')
    
    app.run(debug=True, host='0.0.0.0', port=5000)
