import { wsControlApi } from './api';

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
  socket.onopen = () => socket.send(JSON.stringify({ action: 'AUTH', ticket: data.ticket }));
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
  socket.onclose = handlers.onClose;
  socket.onerror = (err) => {
    console.warn('WebSocket error:', err);
    handlers.onError?.(err);
  };
  return socket;
}