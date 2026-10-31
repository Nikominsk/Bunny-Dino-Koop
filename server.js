// Plüschfreunde – verbindlicher Spielserver.
// Liefert die index.html aus und führt pro Raum die Simulation mit festem Takt.
// Die Simulation stammt direkt aus dem <script id="shared">-Block der index.html.
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = +(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ROOM_TTL_MS = +(process.env.ROOM_TTL_MINUTES || 30) * 60000;
const MAX_ROOMS = +(process.env.MAX_ROOMS || 200);
const SNAPSHOT_EVERY = 2;   // 30 Zustände pro Sekunde
const TICK_MS = 1000 / 60;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const shared = html.match(/<script id="shared">([\s\S]*?)<\/script>/);
if (!shared) throw new Error('Simulation in index.html nicht gefunden');
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(shared[1], sandbox);
const { Sim } = sandbox.module.exports;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size, version: Sim.VERSION })); return; }
  if (url === '/' || url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(fs.readFileSync(htmlPath)); return; }
  res.writeHead(404); res.end('Nicht gefunden');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, verifyClient: info => !ORIGINS.length || ORIGINS.includes(info.origin) });

const rooms = new Map();
function newCode() {
  for (let n = 0; n < 200; n++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
function newRoom() {
  const code = newCode();
  const room = { code, players: [null, null], level: 0, state: null, game: false, paused: false, acc: 0, seats: 0, emptySince: Date.now(), events: [], tickN: 0 };
  rooms.set(code, room);
  return room;
}
const newSeat = c => ({ c, ready: false, ws: null, token: crypto.randomBytes(16).toString('hex'), queue: [], bits: 0, ack: 0 });
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const broadcast = (room, o) => { const m = JSON.stringify(o); room.players.forEach(p => p && send(p.ws, m)); };
function lobby(room) {
  broadcast(room, { t: 'lobby', level: room.level, inGame: room.game, players: room.players.map(p => p && { c: p.c, ready: p.ready, on: !!p.ws }) });
}
function seatIn(room, ws, slot, seat) {
  room.players[slot] = seat; seat.ws = ws; ws.room = room; ws.slot = slot;
  send(ws, { t: 'room', code: room.code, slot, token: seat.token });
}
function startGame(room, lvl) {
  room.state = Sim.newState(lvl);
  room.game = true; room.paused = false; room.acc = 0; room.events = []; room.tickN = 0;
  room.players.forEach(p => { p.queue = []; p.bits = 0; p.ack = 0; });
  broadcast(room, { t: 'go' });
  lobby(room);
  snapshot(room);
}
function maybeStart(room) {
  const [a, b] = room.players;
  if (!room.game && a && b && a.ws && b.ws && a.ready && b.ready && a.c !== null && b.c !== null && a.c !== b.c) startGame(room, room.level);
}
function setPause(room, why) {
  if (!room.game || room.paused) return;
  room.paused = true;
  room.players.forEach(p => { if (p) { p.queue = []; p.bits = 0; } });
  broadcast(room, { t: 'paused', reason: why });
  lobby(room);
}
function dropSeat(room, slot) {
  room.players[slot] = null;
  if (!room.players[0] && !room.players[1]) { rooms.delete(room.code); return; }
  room.game = false; room.paused = false; room.state = null;
  const o = room.players[1 - slot];
  if (o) { o.ready = false; send(o.ws, { t: 'toast', m: 'Dein Partner hat den Raum verlassen.' }); }
  lobby(room);
}

wss.on('connection', ws => {
  ws.alive = true; ws.room = null;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (typeof m !== 'object' || !m) return;
    if (m.t === 'ping') { send(ws, { t: 'pong', c: m.c }); return; }
    if (m.t === 'create' || m.t === 'join' || m.t === 'resume') {
      if (m.v !== Sim.VERSION) { send(ws, { t: 'err', fatal: true, m: 'Spielversion passt nicht zum Server. Bitte Seite neu laden.' }); return; }
      if (ws.room) return;
    }
    if (m.t === 'create') {
      if (rooms.size >= MAX_ROOMS) { send(ws, { t: 'err', m: 'Der Server ist gerade voll.' }); return; }
      const room = newRoom();
      seatIn(room, ws, 0, newSeat(m.c === 1 ? 1 : 0));
      lobby(room);
      return;
    }
    if (m.t === 'join') {
      const room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) { send(ws, { t: 'err', m: 'Diesen Raum gibt es nicht. Stimmt der Code?' }); return; }
      const slot = room.players.findIndex(p => !p);
      if (slot < 0) { send(ws, { t: 'err', m: 'Dieser Raum ist schon voll.' }); return; }
      const other = room.players[1 - slot];
      const want = m.c === 1 ? 1 : 0;
      seatIn(room, ws, slot, newSeat(other && other.c === want ? 1 - want : want));
      lobby(room);
      return;
    }
    if (m.t === 'resume') {
      const room = rooms.get(String(m.code || '').toUpperCase());
      const slot = room ? room.players.findIndex(p => p && p.token === m.token) : -1;
      if (slot < 0) { send(ws, { t: 'err', fatal: true, m: 'Der Raum existiert nicht mehr.' }); return; }
      const seat = room.players[slot];
      if (seat.ws) { const old = seat.ws; old.room = null; old.close(); }
      seat.ws = ws; ws.room = room; ws.slot = slot; seat.queue = []; seat.bits = 0;
      send(ws, { t: 'room', code: room.code, slot, token: seat.token });
      send(ws, { t: 'rejoined', ack: seat.ack, inGame: room.game });
      lobby(room);
      if (room.game) {
        if (room.players.every(p => p && p.ws)) { room.paused = false; broadcast(room, { t: 'resumed' }); snapshot(room); }
        else { send(ws, { t: 'paused', reason: 'partner' }); snapshot(room); }
      }
      return;
    }
    const room = ws.room;
    if (!room) return;
    const seat = room.players[ws.slot];
    if (!seat) return;
    switch (m.t) {
      case 'i':
        if (room.game && !room.paused && Number.isInteger(m.s) && m.s > seat.ack && seat.queue.length < 120) seat.queue.push({ s: m.s, b: m.b & 15 });
        break;
      case 'pick': {
        if (room.game) break;
        const c = m.c === 1 ? 1 : 0, other = room.players[1 - ws.slot];
        if (other && other.c === c) { send(ws, { t: 'err', m: 'Diese Figur ist schon vergeben.' }); break; }
        seat.c = c; seat.ready = false;
        lobby(room);
        break;
      }
      case 'ready': seat.ready = !!m.r && seat.c !== null; lobby(room); maybeStart(room); break;
      case 'level': if (!room.game && Number.isInteger(m.l) && m.l >= 0 && m.l < Sim.levelCount()) { room.level = m.l; room.players.forEach(p => { if (p) p.ready = false; }); lobby(room); } break;
      case 'reset': if (room.game && !room.paused && room.state) { Sim.requestReset(room.state); send(room.players[1 - ws.slot] && room.players[1 - ws.slot].ws, { t: 'toast', m: 'Dein Partner setzt den Abschnitt zurück.' }); } break;
      case 'again': if (room.game && room.state && room.state.phase === 'finale') startGame(room, 0); break;
      case 'leave': seat.ws = null; ws.room = null; dropSeat(room, ws.slot); break;
    }
  });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    const seat = room.players[ws.slot];
    if (!seat || seat.ws !== ws) return;
    seat.ws = null;
    if (room.game) setPause(room, 'partner');
    else { seat.ready = false; lobby(room); }
  });
});

function snapshot(room) {
  const s = room.state;
  if (!s) return;
  const packed = Sim.pack(s);
  const ev = room.events; room.events = [];
  room.players.forEach(p => {
    if (!p || !p.ws) return;
    const o = room.players.find(q => q && q !== p);
    send(p.ws, { t: 's', st: packed, ack: p.ack, oi: o ? o.bits : 0, ev });
  });
}
function nextInput(seat) {
  /* Stau abbauen, ohne Sprünge zu verlieren */
  while (seat.queue.length > 8) { const d = seat.queue.shift(); seat.queue[0].b |= d.b & 4; seat.ack = d.s; }
  const n = seat.queue.shift();
  if (n) { seat.bits = n.b; seat.ack = n.s; }
  return seat.bits;
}
function tick(room) {
  const inp = [0, 0];
  room.players.forEach(p => { if (p) inp[p.c] = nextInput(p); });
  const before = room.state.lvl;
  room.state = Sim.step(room.state, inp);
  if (room.state.ev.length) { room.events.push(...room.state.ev); room.state.ev.length = 0; }
  if (room.state.lvl !== before) room.players.forEach(p => { if (p) p.queue = []; });
  if (++room.tickN % SNAPSHOT_EVERY === 0) snapshot(room);
}

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(250, now - last); last = now;
  for (const room of rooms.values()) {
    if (!room.game || room.paused) continue;
    room.acc += dt;
    while (room.acc >= TICK_MS) { room.acc -= TICK_MS; tick(room); }
  }
}, 4);

/* Tote Verbindungen erkennen, verlassene Räume aufräumen */
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.alive) { ws.terminate(); return; } ws.alive = false; ws.ping(); });
  const now = Date.now();
  for (const room of rooms.values()) {
    const online = room.players.some(p => p && p.ws);
    if (online) room.emptySince = now;
    else if (now - room.emptySince > ROOM_TTL_MS) rooms.delete(room.code);
  }
}, 5000);

/* Beim Neustart des Hosts Clients sauber trennen; sie verbinden sich selbst neu, sobald der Raum noch existiert */
process.on('SIGTERM', () => { wss.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1000); });

server.listen(PORT, HOST, () => {
  console.log(`Plüschfreunde läuft auf http://localhost:${PORT}`);
  if (ORIGINS.length) console.log('Erlaubte Origins:', ORIGINS.join(', '));
});
