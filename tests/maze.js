// Rabenlabyrinth in der echten Simulation: Aufbau, Regeln, Raben-Verhalten und Bots mit Wegsuche.
const { Sim, Runner, J, E } = require('./lib');
const { RUN, MZ } = Sim;
let fails = 0, passed = 0;
const ok = (n, c, info = '') => { if (c) { passed++; console.log('  ok  ', n, info); } else { fails++; console.log('  FEHLER', n, info); } };
const ang = a => (Math.round(((a % (2 * Math.PI)) + 2 * Math.PI) / (2 * Math.PI) * 1024) & 1023) << 13;
const fresh = seed => new Runner(0, Sim.newState(RUN.MAZE, seed));
/* Bot: läuft den kürzesten Weg, schaut in Laufrichtung */
function steer(r, i, gx, gy) {
  const m = Sim.mazeOf(r.s.seed), p = r.s.p[i], d = Sim.mazeDist(m, gx, gy, false);
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  if (cx === gx && cy === gy) { const a = Math.atan2(gy + .5 - p.y, gx + .5 - p.x); return J | ang(a); }
  let best = [cx, cy], bd = d[m.at(cx, cy)];
  for (const [x, y] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
    if (m.open(x, y) && d[m.at(x, y)] >= 0 && d[m.at(x, y)] < bd) { bd = d[m.at(x, y)]; best = [x, y]; }
  }
  return J | ang(Math.atan2(best[1] + .5 - p.y, best[0] + .5 - p.x));
}

console.log('Aufbau');
{
  let bad = 0, len = [];
  for (let seed = 1; seed <= 200; seed++) {
    const m = Sim.mazeOf(seed), d = Sim.mazeDist(m, 2, 9, false), e = d[m.at(m.W - 1, m.ey)];
    if (e < 0) bad++; else len.push(e);
    for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (m.g[m.at(x, y)] === 0 && d[m.at(x, y)] < 0) bad++;
    if (m.lamps.length < 6) bad++;
  }
  len.sort((a, b) => a - b);
  ok('200 Labyrinthe: Ausgang und jedes Feld erreichbar, genug Lampen', bad === 0, `Weg ${len[0]} bis ${len[len.length - 1]} Felder, Mitte ${len[100]}`);
  const a = Sim.mazeOf(7), b = Sim.mazeOf(8);
  ok('jeder Zufallswert ergibt ein anderes Labyrinth', Buffer.from(a.g).compare(Buffer.from(b.g)) !== 0);
  ok('Ausgang liegt auf der anderen Seite', a.g[a.at(a.W - 1, a.ey)] === 2);
}
console.log('Regeln');
{
  const r = fresh(21);
  r.tick(J | ang(Math.PI), 0);
  const x0 = r.s.p[0].x;
  for (let i = 0; i < 200; i++) r.tick(J | ang(Math.PI), 0);
  ok('Wand stoppt die Figur', r.s.p[0].x >= 1 + MZ.R - 0.001 && r.s.p[0].x < x0, r.s.p[0].x.toFixed(2));
  const a = fresh(22), b = fresh(22);
  for (let i = 0; i < 900; i++) { const u = J | ang(i * .01); a.tick(u, u); b.tick(u, u); }
  ok('gleiche Eingaben ergeben denselben Stand', JSON.stringify(a.s) === JSON.stringify(b.s));
  /* Ausgang braucht beide */
  const m = Sim.mazeOf(23), e = fresh(23);
  Object.assign(e.s.p[0], { x: m.W - .6, y: m.ey + .5 });
  for (let i = 0; i < 30; i++) e.tick(0, 0);
  ok('einer am Ausgang reicht nicht', e.s.phase === 'play');
  Object.assign(e.s.p[1], { x: m.W - .8, y: m.ey + .5 });
  e.tick(0, 0);
  ok('beide am Ausgang: gewonnen', e.s.phase === 'won' && e.events.filter(q => q.e === 'won').length === 1);
  const t = fresh(24);
  Object.assign(t.s.p[0], { x: 9.5, y: 9.5 });
  t.s.mz.r = { x: 9.6, y: 9.5, tx: 9, ty: 9, st: 'hunt', t: 500 };
  t.tick(0, 0);
  ok('Rabe erwischt eine Figur: Game over', t.s.phase === 'over');
  const safe = fresh(25);
  safe.s.mz.r = { x: 6.5, y: 9.5, tx: 6, ty: 9, st: 'hunt', t: 9999 };
  for (let i = 0; i < 1500; i++) safe.tick(0, 0);
  ok('im hellen Raum seid ihr sicher', safe.s.phase === 'play' && safe.s.mz.r.x > MZ.ROOM);
}
console.log('Rabe');
{
  const r = fresh(31);
  Object.assign(r.s.p[0], { x: 7.5, y: 9.5 });
  let jumps = 0, last = null, gone = 0, peek = 0, far = [];
  for (let i = 0; i < 6000 && r.s.phase === 'play'; i++) {
    const before = r.s.mz.r.st;
    r.tick(0, 0);
    const q = r.s.mz.r;
    if (before !== 'gone' && q.st === 'gone') gone++;
    if (before !== 'peek' && q.st === 'peek') { peek++; far.push(Math.round(Math.hypot(q.x - 7.5, q.y - 9.5))); if (last && Math.hypot(q.x - last[0], q.y - last[1]) > 2) jumps++; }
    if (q.st !== 'gone') last = [q.x, q.y];
  }
  ok('Rabe taucht an anderer Stelle wieder auf', peek >= 1, `${peek}× aufgetaucht, Abstände ${far.join(',')}, Sprünge ${jumps}, verschwunden ${gone}×`);
  const stat = { won: 0, over: 0, t: [] };
  for (let seed = 100; seed < 140; seed++) {
    const b = fresh(seed), m = Sim.mazeOf(seed);
    for (let i = 0; i < 9000 && b.s.phase === 'play'; i++) b.tick(steer(b, 0, m.W - 1, m.ey), steer(b, 1, m.W - 1, m.ey));
    if (b.s.phase === 'won') { stat.won++; stat.t.push(b.s.tick / 60 | 0); } else stat.over++;
  }
  stat.t.sort((a, b) => a - b);
  console.log(`  Bots mit Karte, ohne Ausweichen: ${stat.won} gewonnen, ${stat.over} erwischt, Zeit ${stat.t[0]} bis ${stat.t[stat.t.length - 1]} s`);
  ok('Lauf ist machbar, aber nicht geschenkt', stat.won >= 10 && stat.over >= 4, `${stat.won}/${stat.over}`);
  const p = JSON.parse(JSON.stringify(Sim.pack(fresh(40).s))); p.ev = [];
  ok('gepackter Zustand rechnet weiter', !!Sim.step(p, [J, J], { predict: true }).mz);
}
console.log(`\n${passed} bestanden, ${fails} fehlgeschlagen`);
process.exit(fails ? 1 : 0);
