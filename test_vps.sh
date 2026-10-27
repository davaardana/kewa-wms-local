#!/bin/bash
# Test STOCK_OUT flow via local API
set -e

BASE="http://localhost:8081/api"

echo "=== 1. Login ==="
RESP=$(curl -sf -X POST "$BASE/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mosaik.id","password":"password"}')
TOKEN=$(echo $RESP | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:20}..."

AUTH="Authorization: Bearer $TOKEN"

echo ""
echo "=== 2. Cek custody ledger STOCK_OUT ==="
curl -sf "$BASE/reports/audit-trail?per_page=20" -H "$AUTH" | \
  grep -o '"action":"[^"]*"' | sort | uniq -c | sort -rn || echo "(no data)"

echo ""
echo "=== 3. Cek shipping docs terakhir ==="
curl -sf "$BASE/shipping-documents?per_page=5" -H "$AUTH" | \
  grep -o '"document_number":"[^"]*"\|"status":"[^"]*"' | paste - - || echo "(no data)"

echo ""
echo "=== 4. Tags state ==="
curl -sf "$BASE/tags?per_page=20" -H "$AUTH" | \
  grep -o '"epc":"[^"]*"\|"status":"[^"]*"\|"last_warehouse_id":[^,}]*' | \
  paste - - - || echo "(no data)"

echo ""
echo "=== 5. Check PHP syntax on controller ==="
php -l /var/www/backend/app/Http/Controllers/Api/ShippingDocumentController.php
php -l /var/www/backend/app/Services/CustodyService.php

echo ""
echo "=== DONE - Backend OK ==="
