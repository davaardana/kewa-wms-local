import { wsControlApi } from './api';

export async function openAuthenticatedEdgeSocket(warehouseId, commands, handlers = {}, deviceId, purpose) {
  if (!warehouseId) throw new Error('Warehouse is required for Edge WebSocket');
  const { data } = await wsControlApi.issueTicket(warehouseId, commands, deviceId, purpose);
  const endpoint = new URL(data.edge_ws_url);
  if (endpoint.protocol !== 'wss:' || endpoint.username || endpoint.password || endpoint.hash || endpoint.search
      || /[\s\\%?#]/.test(data.edge_ws_url)
      || data.warehouse_id !== Number(warehouseId) || (deviceId && data.device_id !== Number(deviceId))) {
    throw new Error('Invalid server-selected Edge endpoint');
  }
  const socket = new WebSocket(endpoint.href);
  socket.onopen = () => socket.send(JSON.stringify({ action: 'AUTH', ticket: data.ticket }));
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'AUTH_OK') handlers.onAuthenticated?.(socket);
    else if (message.type === 'AUTH_FAILED') socket.close();
    else handlers.onMessage?.(message, event);
  };
  socket.onclose = handlers.onClose;
  socket.onerror = handlers.onError;
  return socket;
}