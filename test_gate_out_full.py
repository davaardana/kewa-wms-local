#!/usr/bin/env python3
"""
Test end-to-end GATE OUT + STOCK_OUT flow.
Usage: python test_gate_out_full.py
"""
import json, sys
import urllib.request, urllib.parse, urllib.error

BASE = "http://206.237.98.48"
CREDS = {"email": "admin@mosaik.id", "password": "password"}

def req(method, path, body=None, token=None):
    url = BASE + "/api" + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def ok(label, status, data):
    symbol = "✓" if status < 300 else "✗"
    print(f"  {symbol} [{status}] {label}")
    if status >= 300:
        print(f"      {json.dumps(data)[:200]}")
    return status < 300

# 1. Login
print("\n=== 1. Login ===")
s, d = req("POST", "/login", CREDS)
assert ok("login", s, d), "Login failed, abort"
token = d["token"]

# 2. Cek custody ledger sebelum
print("\n=== 2. Cek custody ledger (latest 10) ===")
s, d = req("GET", "/reports/audit-trail?per_page=10", token=token)
ok("audit-trail", s, d)
entries = d.get("data", d) if isinstance(d, dict) else d
if isinstance(entries, list):
    for e in entries[-5:]:
        print(f"    action={e.get('action')} tag={e.get('tag_epc','')[:12]}... doc_id={e.get('ref_id')}")

# 3. Cek shipping docs
print("\n=== 3. Cek dokumen outbound ===")
s, d = req("GET", "/shipping-documents?type=outbound&per_page=5", token=token)
ok("list outbound docs", s, d)
docs = d.get("data", d) if isinstance(d, dict) else d
if isinstance(docs, list):
    for doc in docs[:5]:
        print(f"    id={doc.get('id')} num={doc.get('document_number')} status={doc.get('status')}")

# 4. Tags state
print("\n=== 4. State rfid_tags ===")
s, d = req("GET", "/tags?per_page=20", token=token)
ok("tags", s, d)
tags = d.get("data", d) if isinstance(d, dict) else d
if isinstance(tags, list):
    for t in tags:
        print(f"    epc={t.get('epc','')[:16]}... status={t.get('status')} wh={t.get('last_warehouse_id')}")

# 5. Custody ledger STOCK_OUT entries
print("\n=== 5. Cek STOCK_OUT entries di ledger ===")
s, d = req("GET", "/reports/audit-trail?action=STOCK_OUT&per_page=20", token=token)
ok("audit-trail STOCK_OUT", s, d)
entries = d.get("data", d) if isinstance(d, dict) else d
if isinstance(entries, list):
    if entries:
        for e in entries:
            print(f"    STOCK_OUT: tag={e.get('tag_epc','')[:16]} ref_id={e.get('ref_id')} ts={e.get('created_at','')[:19]}")
    else:
        print("    (kosong — belum ada STOCK_OUT atau filter tidak support action param)")

print("\n=== Done ===")
print("Jika ingin test complete baru: buat dokumen OUT baru, assign tag, scan via gate, lalu complete.")
