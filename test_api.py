import urllib.request, json, sys

BASE = 'http://127.0.0.1:8081'

# Login
req = urllib.request.Request(
    BASE + '/api/auth/login',
    data=json.dumps({'email': 'superadmin@mosa.id', 'password': 'password'}).encode(),
    headers={'Content-Type': 'application/json', 'Accept': 'application/json'}
)
try:
    with urllib.request.urlopen(req) as r:
        data = json.load(r)
        token = data.get('token', '')
        print('LOGIN OK, token len:', len(token))
except Exception as e:
    print('LOGIN FAILED:', e)
    sys.exit(1)

headers = {'Accept': 'application/json', 'Authorization': 'Bearer ' + token}

# Test shipping-documents
req2 = urllib.request.Request(BASE + '/api/shipping-documents', headers=headers)
try:
    with urllib.request.urlopen(req2) as r:
        d = json.load(r)
        arr = d.get('data', d)
        count = len(arr) if isinstance(arr, list) else '?'
        print('shipping-documents count:', count)
        if isinstance(arr, list) and len(arr) > 0:
            print('  latest:', arr[0].get('document_number'), arr[0].get('type'), arr[0].get('status'))
except Exception as e:
    print('shipping-documents FAILED:', e)

# Test items
req3 = urllib.request.Request(BASE + '/api/items', headers=headers)
try:
    with urllib.request.urlopen(req3) as r:
        d = json.load(r)
        arr = d.get('data', d)
        print('items count:', len(arr) if isinstance(arr, list) else d)
except Exception as e:
    print('items FAILED:', e)

# Test tags
req4 = urllib.request.Request(BASE + '/api/tags', headers=headers)
try:
    with urllib.request.urlopen(req4) as r:
        d = json.load(r)
        print('tags:', str(d)[:200])
except Exception as e:
    print('tags endpoint:', e)
