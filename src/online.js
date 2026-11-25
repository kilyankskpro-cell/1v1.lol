export function connectRoom(events) {
  const url = new URL('/duel', window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  const connectTimeout = setTimeout(() => {
    if (socket.readyState === WebSocket.CONNECTING) socket.close();
  }, 6500);
  let deliberate = false;
  let queue = [];
  socket.onopen = () => {
    clearTimeout(connectTimeout);
    queue.forEach((message) => socket.send(message));
    queue = [];
  };
  socket.onmessage = ({ data }) => {
    try { events.message(JSON.parse(data)); }
    catch (error) { console.error('État du salon inattendu', error); }
  };
  socket.onclose = () => {
    clearTimeout(connectTimeout);
    if (!deliberate) events.disconnected();
  };
  return {
    send(type, values) {
      const message = JSON.stringify({ type, ...values });
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 16000) socket.send(message);
      else if (socket.readyState === WebSocket.CONNECTING && type !== 'input') queue.push(message);
    },
    close() { deliberate = true; clearTimeout(connectTimeout); socket.close(); },
  };
}
