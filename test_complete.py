import urllib.request, json, sys

BASE = 'http://127.0.0.1:8081'

# Login as superadmin
req = urllib.request.Request(
    BASE + '/api/auth/login',
    data=json.dumps({'email': 'superadmin@mosa.id', 'password': 'password'}).encode(),
    headers={'Content-Type': 'application/json', 'Accept': 'application/json'}
)
with urllib.request.urlopen(req) as r:
    data = json.load(r)
    token = data.get('token', '')
    print('LOGIN OK, token len:', len(token))

headers = {'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token}

# Try complete doc 45
req_complete = urllib.request.Request(
    BASE + '/api/shipping-documents/45/complete',
    data=b'{}',
    headers=headers,
    method='POST'
)
try:
    with urllib.request.urlopen(req_complete) as r:
        d = json.load(r)
        print('COMPLETE SUCCESS:', json.dumps(d, indent=2)[:500])
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f'COMPLETE FAILED HTTP {e.code}:', body[:500])
