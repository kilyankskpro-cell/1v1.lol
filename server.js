// Serveur LAN : sert le jeu et relaie les parties 1v1 via WebSocket.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { WebSocketServer } = require('ws');
const { Game } = require('./public/game.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let f = req.url.split('?')[0];
  if (f === '/') f = '/index.html';
  const full = path.join(PUB, path.normalize(f));
  if (!full.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
    res.end(d);
  });
});

const rooms = {}; // code -> { game, sockets:[], inputs:[{},{}], timer }
const wss = new WebSocketServer({ server });
const send = (ws, m) => ws.readyState === 1 && ws.send(JSON.stringify(m));

function closeRoom(code) {
  const r = rooms[code]; if (!r) return;
  clearInterval(r.timer); delete rooms[code];
}
function startRoom(code) {
  const r = rooms[code];
  r.game = new Game(); r.inputs = [{}, {}];
  r.sockets.forEach((s, i) => send(s, { t: 'start', you: i }));
  let tick = 0;
  r.timer = setInterval(() => {
    r.game.step(1 / 60, r.inputs);
    if (++tick % 2 === 0 || r.game.winner >= 0) r.sockets.forEach(s => send(s, { t: 'state', s: r.game.snapshot() }));
  }, 1000 / 60);
}

wss.on('connection', ws => {
  ws.room = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'host') {
      let code; do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms[code]);
      rooms[code] = { sockets: [ws] }; ws.room = code; ws.idx = 0;
      send(ws, { t: 'hosted', code });
    } else if (m.t === 'join') {
      const r = rooms[m.code];
      if (!r || r.sockets.length !== 1) return send(ws, { t: 'error', msg: 'Salon introuvable ou plein' });
      r.sockets.push(ws); ws.room = m.code; ws.idx = 1;
      startRoom(m.code);
    } else if (m.t === 'input' && ws.room && rooms[ws.room] && rooms[ws.room].inputs) {
      rooms[ws.room].inputs[ws.idx] = m.i;
    }
  });
  ws.on('close', () => {
    const r = rooms[ws.room]; if (!r) return;
    r.sockets.forEach(s => s !== ws && send(s, { t: 'error', msg: "L'adversaire a quitté la partie" }));
    closeRoom(ws.room);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Jeu lancé. Local : http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list) if (n.family === 'IPv4' && !n.internal) console.log(`Réseau local : http://${n.address}:${PORT}`);
});
