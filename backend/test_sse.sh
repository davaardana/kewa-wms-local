#!/bin/bash
LOGIN=$(curl -s -X POST http://206.237.98.48/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"email":"dava@mosaik.co.id","password":"Lamineyamal10!"}')

TOK=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
echo "Token (30 char): ${TOK:0:30}..."
echo "---SSE OUTPUT---"
curl -s -N --max-time 5 \
  -H "Authorization: Bearer $TOK" \
  -H "Accept: text/event-stream" \
  "http://nginx/api/enrollment/stream?warehouse_id=1"
echo ""
echo "---END---"
