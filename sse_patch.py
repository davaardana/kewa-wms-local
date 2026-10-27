#!/usr/bin/env python3
import os, sys, shutil
FILE = '/var/www/mosa/frontend/src/pages/TagEnrollment.jsx'
BAK  = FILE + '.bak_sse'
shutil.copy2(FILE, BAK)
print("Backup:", BAK)
with open(FILE) as f:
    content = f.read()

# PATCH 1: sseConnected state
OLD1 = "  const [wsConnected, setWsConnected] = useState(false);"
NEW1 = "  const [wsConnected, setWsConnected] = useState(false);\n  const [sseConnected, setSseConnected] = useState(false);"
if OLD1 in content:
    content = content.replace(OLD1, NEW1, 1); print("P1 OK")
else: print("WARN P1 not found")

# PATCH 2: SSE fallback effect (after WS effect closing)
WS_CLOSING = "  }, [enrollForm.warehouse_id, selectedReaderId]);\n"
SSE_EFFECT = """\n  // SSE Fallback: sambung ke /api/enrollment/stream saat WS tidak reachable (browser di luar LAN).
  // Edge lokal POST /api/gate/sighting tiap tag scan → cache VPS → SSE push ke browser.
  useEffect(() => {
    const warehouseId = Number(enrollForm.warehouse_id);
    if (!warehouseId) return undefined;
    let es = null;
    let retryTimer = null;
    let isUnmounted = false;
    const connect = () => {
      if (isUnmounted) return;
      const token = localStorage.getItem('mosa_token');
      const url = '/api/enrollment/stream?warehouse_id=' + warehouseId + (token ? '&token=' + encodeURIComponent(token) : '');
      try {
        es = new EventSource(url);
        es.addEventListener('tag_read', (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.epc) {
              const cleanEpc = normalizeEpc(data.epc);
              setSseConnected(true);
              setLiveScannedTag({ epc: cleanEpc, rssi: data.rssi, antenna: data.antenna, timestamp: new Date().toLocaleTimeString() });
              setEnrollForm((prev) => ({ ...prev, epc: cleanEpc }));
              setZiplockEpcs((prev) => prev.includes(cleanEpc) ? prev : [...prev, cleanEpc]);
            }
          } catch (_) {}
        });
        es.addEventListener('reconnect', () => { es.close(); if (!isUnmounted) retryTimer = setTimeout(connect, 2000); });
        es.onopen = () => { if (!isUnmounted) setSseConnected(true); };
        es.onerror = () => { setSseConnected(false); es.close(); if (!isUnmounted) retryTimer = setTimeout(connect, 4000); };
      } catch (_) {}
    };
    connect();
    return () => {
      isUnmounted = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (es) { try { es.close(); } catch (_) {} }
      setSseConnected(false);
    };
  }, [enrollForm.warehouse_id]);
"""
if WS_CLOSING in content:
    content = content.replace(WS_CLOSING, WS_CLOSING + SSE_EFFECT, 1); print("P2 OK")
else: print("WARN P2 not found"); sys.exit(1)

# PATCH 3: badge text
OLD3 = "{wsConnected ? 'Reader Online' : 'Manual / USB HID'}"
NEW3 = "{wsConnected ? 'Reader Online' : sseConnected ? 'SSE Online' : 'Manual / USB HID'}"
if OLD3 in content: content = content.replace(OLD3, NEW3, 1); print("P3 OK")
else: print("WARN P3 not found")

# PATCH 4: badge color
OLD4 = "? 'bg-blue-50 text-blue-700 border-blue-200'\n              : 'bg-slate-100 text-slate-500 border-slate-200'"
NEW4 = "? 'bg-blue-50 text-blue-700 border-blue-200'\n              : sseConnected ? 'bg-green-50 text-green-700 border-green-200'\n              : 'bg-slate-100 text-slate-500 border-slate-200'"
if OLD4 in content: content = content.replace(OLD4, NEW4, 1); print("P4 OK")
else: print("WARN P4 not found")

# PATCH 5: Radio icon animate
OLD5 = "w-3.5 h-3.5 ${wsConnected ? 'animate-pulse text-blue-500' : 'text-slate-400'}"
NEW5 = "w-3.5 h-3.5 ${wsConnected ? 'animate-pulse text-blue-500' : sseConnected ? 'animate-pulse text-green-500' : 'text-slate-400'}"
if OLD5 in content: content = content.replace(OLD5, NEW5, 1); print("P5 OK")
else: print("WARN P5 not found")

with open(FILE, 'w') as f:
    f.write(content)
print("Written:", FILE, "lines:", content.count('\n'))
assert 'sseConnected' in content
assert 'EventSource' in content
assert 'enrollment/stream' in content
print("ALL OK")

