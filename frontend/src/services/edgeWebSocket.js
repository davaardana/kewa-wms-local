import { wsControlApi } from './api';
import api from './api';

/**
 * Buka WebSocket terautentikasi ke edge-bridge lokal.
 * Timeout 5 detik — jika edge LAN tidak reachable (browser di luar LAN),
 * akan trigger onClose/onError sehingga SSE fallback segera aktif.
 */
export async function openAuthenticatedEdgeSocket(warehouseId, commands, handlers = {}, deviceId, purpose) {
  if (!warehouseId || warehouseId === 'ALL') throw new Error('Warehouse is required for Edge WebSocket');
  const { data } = await wsControlApi.issueTicket(warehouseId, commands, deviceId, purpose);
  const endpoint = new URL(data.edge_ws_url);
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && endpoint.protocol === 'ws:') {
    endpoint.protocol = 'wss:';
  }
  const isValidProtocol = endpoint.protocol === 'wss:' || endpoint.protocol === 'ws:';
  if (!isValidProtocol || endpoint.username || endpoint.password || endpoint.hash || endpoint.search
      || /[\s\\%?#]/.test(data.edge_ws_url)
      || data.warehouse_id !== Number(warehouseId) || (deviceId && data.device_id !== Number(deviceId))) {
    throw new Error('Invalid server-selected Edge endpoint');
  }
  const socket = new WebSocket(endpoint.href);

  // Timeout 5 detik — jika edge WS (IP LAN lokal) tidak reachable dari luar LAN,
  // browser normalnya tunggu 30-75 detik. Paksa error lebih cepat agar SSE fallback segera aktif.
  const connectTimer = setTimeout(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      console.warn('[WS] connect timeout 5s — edge LAN tidak reachable, trigger SSE fallback');
      socket.close();
    }
  }, 5000);

  socket.onopen = () => {
    clearTimeout(connectTimer);
    socket.send(JSON.stringify({ action: 'AUTH', ticket: data.ticket }));
  };
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'AUTH_OK') handlers.onAuthenticated?.(socket);
      else if (message.type === 'AUTH_FAILED') socket.close();
      else handlers.onMessage?.(message, event);
    } catch (e) {
      console.warn('WS message parse error:', e);
    }
  };
  socket.onclose = (ev) => {
    clearTimeout(connectTimer);
    handlers.onClose?.(ev);
  };
  socket.onerror = (err) => {
    clearTimeout(connectTimer);
    console.warn('WebSocket error:', err);
    handlers.onError?.(err);
  };
  return socket;
}

/**
 * Buka SSE stream dari VPS untuk enrollment live scan.
 * Dipakai sebagai fallback ketika browser tidak bisa reach ws://LAN-IP:2078/
 * (misalnya browser di luar LAN lokal edge).
 *
 * @param {number} warehouseId
 * @param {function} onTag - dipanggil dengan {type, epc, antenna, rssi, gate_id, timestamp}
 * @returns {function} closeFn — panggil untuk menutup stream
 */
export function openEnrollmentSseStream(warehouseId, onTag) {
  if (!warehouseId || warehouseId === 'ALL') return () => {};

  // Ambil token dari axios default headers (di-set oleh auth flow saat login)
  // Fallback ke localStorage jika belum di-set di axios instance
  const token = api.defaults?.headers?.common?.['Authorization']?.replace('Bearer ', '')
    || localStorage.getItem('mosa_token')
    || '';

  if (!token) {
    console.warn('[SSE] Tidak ada token — enrollment SSE tidak bisa konek');
    return () => {};
  }

  let abortCtrl = null;
  let closed = false;
  let reconnectTimer = null;

  // Pastikan URL absolute agar bekerja di dev (port 5173) maupun production (port 80)
  const apiBase = api.defaults.baseURL?.replace(/\/api$/, '') || window.location.origin;
  const streamUrl = `${apiBase}/api/enrollment/stream?warehouse_id=${warehouseId}`;

  async function connect() {
    if (closed) return;
    abortCtrl = new AbortController();

    try {
      const resp = await fetch(streamUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        signal: abortCtrl.signal,
      });

      if (!resp.ok || !resp.body) {
        console.warn('[SSE] enrollment stream resp not ok:', resp.status);
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
        return;
      }

      console.log('[SSE] enrollment stream connected, warehouse_id=' + warehouseId);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // State parsing di luar loop agar persist antar-chunk TCP.
      // Jika TCP memotong event block di tengah (misal "event: tag_read\n" di chunk 1,
      // "data: {...}\n\n" di chunk 2), eventType tidak ter-reset sehingga event tetap terdispatch.
      let eventType = '';
      let dataLines = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done || closed) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? ''; // partial last line

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          } else if (line === '' && dataLines.length > 0) {
            // Dispatch event ke caller
            if (eventType === 'tag_read') {
              try { onTag(JSON.parse(dataLines.join(''))); } catch (_) {}
            } else if (eventType === 'reconnect') {
              reader.cancel();
              if (!closed) reconnectTimer = setTimeout(connect, 500);
              return;
            }
            eventType = '';
            dataLines = [];
          }
        }
      }

      // Stream ended (PHP 30s timeout) — reconnect
      if (!closed) reconnectTimer = setTimeout(connect, 1000);
    } catch (e) {
      if (!closed && e.name !== 'AbortError') {
        console.warn('[SSE] enrollment stream error, retry 3s:', e.message);
        reconnectTimer = setTimeout(connect, 3000);
      }
    }
  }

  connect();

  return function close() {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (abortCtrl) abortCtrl.abort();
  };
}
