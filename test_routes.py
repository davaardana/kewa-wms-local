import urllib.request, json, sys

BASE = 'http://127.0.0.1:8081'

# Login
req = urllib.request.Request(
    BASE + '/api/auth/login',
    data=json.dumps({'email': 'superadmin@mosa.id', 'password': 'password'}).encode(),
    headers={'Content-Type': 'application/json', 'Accept': 'application/json'}
)
with urllib.request.urlopen(req) as r:
    token = json.load(r).get('token', '')
headers = {'Accept': 'application/json', 'Authorization': 'Bearer ' + token}

# Test items raw
req_items = urllib.request.Request(BASE + '/api/items', headers=headers)
with urllib.request.urlopen(req_items) as r:
    raw = r.read().decode()
    print('ITEMS RAW (first 500):', raw[:500])

# Test rfid-tags route
print('\n--- Testing route names ---')
for route in ['/api/rfid-tags', '/api/tags', '/api/items?per_page=5']:
    try:
        req_r = urllib.request.Request(BASE + route, headers=headers)
        with urllib.request.urlopen(req_r) as r:
            d = json.load(r)
            print(f'{route}: OK, type={type(d).__name__}, keys={list(d.keys()) if isinstance(d,dict) else "list"}')
    except urllib.error.HTTPError as e:
        print(f'{route}: HTTP {e.code} - {e.read().decode()[:100]}')

# Test warehouses
req_w = urllib.request.Request(BASE + '/api/warehouses', headers=headers)
try:
    with urllib.request.urlopen(req_w) as r:
        d = json.load(r)
        print(f'\nwarehouses: {str(d)[:200]}')
except urllib.error.HTTPError as e:
    print(f'warehouses: HTTP {e.code}')
