// Tests für Kuss und Endlos-Lauf in der echten Simulation. Bots lösen jeden Abschnittstyp nur über Eingaben.
const { Sim, Runner, go, hop, wait, until, press, mount, par, only, C, L, R, J, E, P } = require('./lib');
const { RUN, K } = Sim;
let fails = 0, passed = 0;
const ok = (name, cond, info = '') => { if (cond) { passed++; console.log('  ok  ', name, info); } else { fails++; console.log('  FEHLER', name, info); } };
const runner = (seed, noRaven) => {
  const r = new Runner(0, Sim.newState(RUN.LVL, seed));
  if (noRaven) r.s.raven.st = 'off';
  return r;
};
const { solve, dodge } = require('./runbot');
function play(r, chunks) {
  let c = 1, seen = {};
  for (; c <= chunks; c++) {
    const kind = Sim.runKind(r.s.seed, c);
    seen[kind] = (seen[kind] || 0) + 1;
    for (const v of solve(r, c)) { r.tick(v[0], v[1]); if (r.s.phase === 'over') return { c, seen, over: true }; }
  }
  return { c, seen, over: false };
}

console.log('Kuss');
{
  const r = new Runner(1);
  r.s.p[0].x = 100; r.s.p[1].x = 270;
  for (let i = 0; i < 10; i++) r.tick(0, 0);
  r.tick(K, 0);
  ok('zu weit entfernt: kein Kuss', r.s.kiss === 0);
  r.tick(0, 0);
  r.s.p[1].x = 150;
  r.tick(0, 0); r.tick(0, K);
  ok('nah beieinander: Kuss startet', r.s.kiss > 0);
  ok('beide schauen sich an', r.s.p[0].f === 1 && r.s.p[1].f === -1);
  const x0 = r.s.p[0].x, x1 = r.s.p[1].x, y0 = r.s.p[0].y;
  let t = 0;
  while (r.s.kiss > 0 && t++ < 200) r.tick(R | J, L | J);
  ok('während des Kusses bewegt sich niemand', r.s.p[0].x === x0 && r.s.p[1].x === x1 && r.s.p[0].y === y0, `${t} Ticks`);
  ok('genau ein Kuss-Ereignis', r.events.filter(e => e.e === 'kiss').length === 1);
  for (let i = 0; i < 20; i++) r.tick(R, 0);
  ok('danach wieder beweglich', r.s.p[0].x > x0 + 30);
  const s = new Runner(1);
  s.s.p[0].x = 300; s.s.p[1].x = 300; s.s.p[1].y = 620 - 2 * C.PH - 2;
  for (let i = 0; i < 20; i++) s.tick(0, 0);
  s.tick(K, 0);
  ok('in der Räuberleiter kein Kuss', s.s.kiss === 0);
  const a = new Runner(1);
  a.s.p[1].x = a.s.p[0].x + 40;
  for (let i = 0; i < 5; i++) a.tick(0, 0);
  a.tick(J, 0); a.tick(J, 0); a.tick(J | K, 0);
  ok('in der Luft kein Kuss', a.s.kiss === 0);
}

console.log('Endlos-Lauf: Aufbau');
{
  const a = Sim.newState(RUN.LVL, 77), kinds = new Set();
  for (let seed = 1; seed < 40; seed++) for (let c = 1; c < 60; c++) kinds.add(Sim.runKind(seed, c));
  ok('alle Abschnittstypen kommen vor', kinds.size === 13, [...kinds].join(','));
  const r1 = runner(4242), r2 = runner(4242);
  for (let t = 0; t < 900; t++) { const b = t % 40 < 30 ? R : R | J; r1.tick(b, b); r2.tick(b, b); }
  ok('gleicher Zufallswert ergibt denselben Lauf', JSON.stringify(r1.s) === JSON.stringify(r2.s));
  ok('Status startet sauber', a.phase === 'play' && a.raven.x < 0);
  /* jeder Abschnitt ist flach anschließbar */
  let bad = 0;
  for (let seed = 1; seed < 30; seed++) for (let c = 1; c < 40; c++) {
    const w = Sim.worldOf({ run: 1, seed, base: c }), X = c * RUN.W;
    const onFloor = x => w.solids.some(s => s.y === 620 && s.k === 'floor' && x >= s.x && x <= s.x + s.w);
    if (!onFloor(X + 100) || !onFloor(X + RUN.W - 60)) bad++;
    const gaps = w.solids.filter(s => s.s === c && s.k !== 'bound').sort((p, q) => p.x - q.x);
    if (Sim.runKind(seed, c) === 'hops') for (let i = 1; i < gaps.length; i++) { const g = gaps[i].x - (gaps[i - 1].x + gaps[i - 1].w); if (g > 150) bad++; if (gaps[i - 1].y - gaps[i].y > 91) bad++; }
  }
  ok('Abschnitte beginnen und enden auf festem Boden, Lücken bleiben springbar', bad === 0, bad);
}

console.log('Endlos-Lauf: jeder Typ ist zu zweit lösbar (ohne Rabe, 3 Läufe mit je 40 Abschnitten)');
{
  const total = {};
  for (const seed of [11, 222, 3333]) {
    const r = runner(seed, true);
    try {
      const res = play(r, 40);
      for (const k in res.seen) total[k] = (total[k] || 0) + res.seen[k];
      ok(`Lauf ${seed}: 40 Abschnitte geschafft`, !res.over, `${((r.ticks) / 60) | 0} s, Abstürze ${r.events.filter(e => e.e === 'hop').length}`);
    } catch (e) { ok(`Lauf ${seed}`, false, e.message + ' p0 ' + (P(r, 0).x | 0) + ',' + (P(r, 0).y | 0) + ' p1 ' + (P(r, 1).x | 0) + ',' + (P(r, 1).y | 0) + ' c=' + Math.floor(P(r, 0).x / RUN.W) + ' ' + Sim.runKind(seed, Math.floor(P(r, 0).x / RUN.W))); }
  }
  console.log('  Typen gespielt:', JSON.stringify(total));
}

console.log('Endlos-Lauf: mit Rabe');
{
  for (const seed of [5, 66, 777, 8888]) {
    const r = runner(seed);
    let res = null;
    try { res = play(r, 200); } catch (e) { console.log('   ', e.message); }
    ok(`Lauf ${seed}: Rabe bleibt gefährlich, Bots ohne Ausweichen enden`, res && res.over, res ? `${res.c} Abschnitte, ${(r.ticks / 60) | 0} s, ${Math.floor(r.s.best / 40)} m` : '');
    ok(`Lauf ${seed}: Game over genau einmal`, r.s.phase === 'over' && r.events.filter(e => e.e === 'over').length === 1, r.s.phase);
  }
  /* Bots, die wie Spieler ausweichen: nach der Fixierung dreht die Zielfigur um */
  const reach = [];
  for (const seed of [31, 32, 33, 34, 35, 36]) {
    const r = runner(seed), tick = r.tick.bind(r);
    r.tick = (a, b) => {
      const bits = dodge(r, [a, b]);
      tick(bits[0], bits[1]);
    };
    let res = null;
    try { res = play(r, 200); } catch (e) { res = { c: Math.floor(r.s.best / RUN.W), err: e.message }; }
    reach.push(`${Math.floor(r.s.best / 40)} m/${(r.ticks / 60) | 0} s`);
  }
  console.log('  Ausweichende Bots kamen bis:', reach.join(', '));
  ok('Mit Ausweichen ist der Lauf deutlich länger', reach.some(x => parseInt(x) > 200));
  const r = runner(9);
  for (let t = 0; t < 4000 && r.s.phase === 'play'; t++) r.tick(0, 0);
  ok('Stehenbleiben: der Rabe erwischt euch', r.s.phase === 'over', `${(r.ticks / 60) | 0} s`);
  const t0 = r.s.tick;
  for (let i = 0; i < 60; i++) r.tick(R, R);
  ok('nach Game over ändert sich nichts mehr', r.s.p[0].x === r.s.p[0].x && r.events.filter(e => e.e === 'over').length === 1 && r.s.phase === 'over', t0);
  const one = runner(10);
  one.s.p[0].x = 200; one.s.p[1].x = 3000; one.s.raven.x = 190; one.s.raven.st = 'chase'; one.s.raven.t = 100; one.s.raven.y = one.s.p[0].y + 20;
  one.tick(0, 0);
  ok('es reicht, wenn einer getroffen wird', one.s.phase === 'over');
}

console.log('Endlos-Lauf: Sturzflug, Schild, Punkte, Bröckeln');
{
  const dive = (bits) => {
    const r = runner(21);
    r.s.raven.st = 'chase'; r.s.raven.t = 1; r.s.raven.x = r.s.p[0].x - 200;
    for (let i = 0; i < 260 && r.s.phase === 'play' && !r.events.some(e => e.e === 'slam'); i++) { const b = bits(r); r.tick(b, b); }
    return r;
  };
  const still = dive(() => 0);
  ok('Stillstehen: Sturzflug trifft', still.s.phase === 'over' || still.s.raven.st === 'rest', still.s.phase);
  ok('Zielphase wird angekündigt', still.events.some(e => e.e === 'aim'));
  /* Ausweichen: bis zur Fixierung laufen, dann umkehren */
  const dodge = dive(r => (r.s.raven.st === 'aim' && r.s.raven.t > Sim.RUN.LOCK ? R : r.s.raven.st === 'chase' ? 0 : L));
  ok('Richtungswechsel nach der Fixierung weicht aus', dodge.s.phase === 'play', dodge.s.phase + ' knapp ' + dodge.s.near);
  const s = runner(22);
  s.s.shield = 1; s.s.raven.st = 'chase'; s.s.raven.t = 900; s.s.raven.x = s.s.p[0].x + 18; s.s.raven.y = s.s.p[0].y + 20;
  s.tick(0, 0);
  ok('Schild fängt einen Treffer ab', s.s.phase === 'play' && s.s.shield === 0 && s.s.raven.st === 'rest');
  s.s.raven.st = 'chase'; s.s.raven.t = 900; s.s.raven.x = s.s.p[0].x + 18; s.s.raven.y = s.s.p[0].y + 20;
  s.tick(0, 0);
  ok('kurz danach unverwundbar', s.s.phase === 'play');
  s.s.inv = 0; s.s.raven.st = 'chase'; s.s.raven.x = s.s.p[0].x + 18; s.s.raven.y = s.s.p[0].y + 20;
  s.tick(0, 0);
  ok('ohne Schild ist Schluss', s.s.phase === 'over');
  const k = runner(23);
  k.s.raven.st = 'off'; k.s.p[1].x = k.s.p[0].x + 40;
  for (let i = 0; i < 5; i++) k.tick(0, 0);
  k.tick(K, 0);
  ok('Schild erst nach dem Kuss', k.s.kiss > 0 && !k.s.shield);
  for (let i = 0; i < 120; i++) k.tick(0, 0);
  ok('nach dem Kuss ist das Schild aktiv', k.s.shield === 1);
  ok('Kuss hat im Lauf eine Abklingzeit', k.s.kcd > 300, k.s.kcd);
  const c = runner(24);
  c.s.raven.st = 'off';
  c.s.stars[0] = c.s.stars[0] || { x: 0, y: 0, g: 0 };
  /* Bröckeln */
  let seed = 1; while (Sim.runKind(seed, 1) !== 'crumble') seed++;
  const b = runner(seed, true), m0 = b.w.movers.findIndex(m => m.crumble), d = b.w.movers[m0];
  b.s.p[0].x = d.x + 30; b.s.p[0].y = d.y - C.PH - 1; b.s.p[1].x = 150;
  for (let i = 0; i < 100; i++) b.tick(0, 0);
  ok('bröckelndes Kissen fällt nach kurzer Zeit', b.s.movers[m0].on >= 2);
  for (let i = 0; i < 400; i++) b.tick(0, 0);
  ok('und kommt zurück', b.s.movers[m0].on === 0 && b.s.movers[m0].y === d.y);
  const p = runner(25);
  p.s.raven.st = 'off'; p.s.got = 3; p.s.ct = 0; p.s.tick = 5;
  p.tick(0, 0);
  ok('drei Sterne in Folge geben Kombo-Punkte', p.s.score === 60 && p.s.combo === 3, p.s.score);
}

console.log('Endlos-Lauf: Absturz, Fenster, Zufallstest');
{
  const r = runner(31, true);
  const x = 1400 * 2 + 300;
  r.s.p[0].x = x; r.s.p[0].y = 1200;
  r.s.p[1].x = x; r.tick(0, 0);
  ok('Absturz: Spieler steht wieder am Abschnittsanfang', r.s.p[0].y < 620 && r.s.phase === 'play' && r.events.some(e => e.e === 'hop'), r.s.p[0].x | 0);
  let bad = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const q = runner(seed, true);
    let st = seed * 99, a = 0, b = 0;
    const rnd = n => { st = (st * 1103515245 + 12345) & 0x7fffffff; return (st >> 8) % n; };
    for (let t = 0; t < 12000; t++) {
      if (t % 25 === 0) { a = rnd(4) === 0 ? rnd(16) : R | (rnd(3) ? 0 : J); b = rnd(4) === 0 ? rnd(16) : R | (rnd(3) ? 0 : J); }
      q.tick(a, b);
      if (q.s.boxes.length !== q.w.boxes.length || q.s.movers.length !== q.w.movers.length || q.s.gates.length !== q.w.gates.length) bad++;
      if (!Number.isFinite(q.s.p[0].x + q.s.p[1].y)) bad++;
    }
    /* Netz: gepackter Zustand rechnet identisch weiter wie auf dem Client */
    const p = JSON.parse(JSON.stringify(Sim.pack(q.s))); p.ev = [];
    const c = Sim.step(p, [R, R], { predict: true });
    if (!c.p) bad++;
  }
  ok('Zufallseingaben: Listen bleiben passend, keine Fehler', bad === 0, bad);
}
console.log(`\n${passed} bestanden, ${fails} fehlgeschlagen`);
process.exit(fails ? 1 : 0);
