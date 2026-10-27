#!/bin/bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8081/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"email":"superadmin@mosa.id","password":"password"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','NO_TOKEN'))")
echo "TOKEN=$TOKEN"
echo "--- Shipping Documents ---"
curl -s "http://127.0.0.1:8081/api/shipping-documents" \
  -H 'Accept: application/json' \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('total docs:', len(d.get('data',d)) if isinstance(d.get('data',d),list) else d)" 2>&1
echo "--- Items ---"
curl -s "http://127.0.0.1:8081/api/items" \
  -H 'Accept: application/json' \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); arr=d.get('data',d); print('total items:', len(arr) if isinstance(arr,list) else d)" 2>&1
echo "--- RFID Tags ---"
curl -s "http://127.0.0.1:8081/api/rfid-tags" \
  -H 'Accept: application/json' \
  -H "Authorization: Bearer $TOKEN" 2>&1 | head -c 200
