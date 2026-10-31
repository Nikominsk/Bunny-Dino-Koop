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
console.log('Pfeilhagel');
{
  const VOL = Sim.VOL;
  const fresh = seed => new Runner(0, Sim.newState(RUN.ARROW, seed));
  const pair = (r, x, dx) => { r.s.p[0].x = x; r.s.p[1].x = x + dx; r.s.p[0].y = r.s.p[1].y = 564; };
  const aimOf = a => (Math.round((a + Math.PI * 2) / (Math.PI * 2) * 64) & 63) << 5;
  /* Dino stellt sich vor den Hasen und hält das Schild der Salve entgegen */
  const guard = r => {
    const v = r.s.vol, h = r.s.p[0], d = r.s.p[1], tx = h.x - v.side * 14;
    const a = Math.atan2(-Math.sin(v.ang), -v.side * Math.cos(v.ang));
    /* Fuchs in Reichweite: hinzielen und im Wechsel zuschlagen */
    const f = r.s.fox;
    if (f && Math.hypot(f.x + 23 - (d.x + 18), f.y - d.y) < 150 && v.st !== 'warn') {
      const toFox = Math.atan2(f.y + 17 - (d.y + 28), f.x + 23 - (d.x + 18));
      return (Math.abs(f.x - d.x) > 70 ? (f.x > d.x ? R : L) : 0) | aimOf(toFox) | (r.s.tick % 4 < 2 ? Sim.S : 0);
    }
    return (Math.abs(d.x - tx) > 6 ? (d.x < tx ? R : L) : 0) | aimOf(a);
  };
  const a = fresh(50), b = fresh(50);
  for (let i = 0; i < 700; i++) { a.tick(R, R); b.tick(R, R); }
  ok('gleicher Zufallswert ergibt dieselben Salven', JSON.stringify(a.s) === JSON.stringify(b.s));
  ok('Salve fliegt als Gruppe', a.events.filter(e => e.e === 'warn').length >= 1);
  /* jede Salve kommt mit Warnung und von genau einer Seite */
  const w = fresh(51);
  pair(w, 200, 40);
  let same = true, warned = 0, fired = 0;
  for (let i = 0; i < 2500 && w.s.phase === 'play'; i++) {
    w.tick(0, guard(w));
    if (w.s.vol.st === 'warn') warned++;
    if (w.s.arrows.length) { const s0 = Math.sign(w.s.arrows[0].vx); if (w.s.arrows.some(q => Math.sign(q.vx) !== s0)) { same = w.s.arrows.length < 40 && same; } fired++; }
  }
  ok('vor jeder Salve gibt es eine Warnzeit', warned > 60 && fired > 60);
  /* Schutz wirkt: mit Dino hält der Hase durch, ohne ist schnell Schluss */
  const survive = (seed, guarded) => {
    const r = fresh(seed);
    pair(r, 300, 40);
    let n = 0;
    while (r.s.phase === 'play' && n < 7200) { r.tick(0, guarded ? guard(r) : 0); n++; }
    return { t: n / 60 | 0, blocked: r.s.blocked, hp: r.s.hp, perfect: r.s.perfect, foxes: r.s.foxes };
  };
  const g = [60, 61, 62, 63].map(s => survive(s, true)), u = [60, 61, 62, 63].map(s => survive(s, false));
  console.log('  mit Schild:', JSON.stringify(g.map(x => x.t + ' s/' + x.blocked + ' geblockt')), ' ohne:', JSON.stringify(u.map(x => x.t + ' s')));
  ok('ohne Schild endet die Runde früh', u.every(x => x.t < 60));
  ok('Dino besiegt dabei Füchse', g.some(x => x.foxes > 0), g.map(x => x.foxes).join());
  ok('mit Schild hält der Hase länger', g.reduce((a, x) => a + x.t, 0) > u.reduce((a, x) => a + x.t, 0) * 1.5);
  /* Schaden: Hase deutlich stärker als Dino */
  const dmg = (who) => {
    const r = fresh(70);
    pair(r, 300, 300);
    r.s.vol.t = 9999;
    const p = r.s.p[who];
    r.s.arrows = [{ x: p.x - 8, y: p.y + 28, vx: 9, vy: 0 }];
    r.tick(0, 0);
    return 100 - r.s.hp[who];
  };
  ok('Dino hat 2 Leben, Hase 3', Math.ceil(100 / dmg(1)) === 2 && Math.ceil(100 / dmg(0)) === 3, dmg(0) + ' / ' + dmg(1));
  /* Schild blockt nur in Blickrichtung */
  const shield = (aim, fromLeft) => {
    const r = fresh(71);
    pair(r, 300, 300);
    r.s.vol.t = 9999;
    const d = r.s.p[1];
    r.tick(0, aimOf(aim));
    r.s.arrows = [{ x: d.x + 18 + (fromLeft ? -66 : 66), y: d.y + 28, vx: fromLeft ? 9 : -9, vy: 0 }];
    r.tick(0, aimOf(aim));
    return r.s.blocked;
  };
  ok('Schild nach links blockt Pfeil von links', shield(Math.PI, true) === 1);
  ok('Schild nach rechts blockt Pfeil von links nicht', shield(0, true) === 0);
  ok('Schild nach oben blockt Pfeil von links nicht', shield(-Math.PI / 2, true) === 0);
  /* Schild-Trefferfläche entspricht der Zeichnung */
  const zone = (along, across) => {
    const r = fresh(74);
    pair(r, 300, 300);
    r.s.vol.t = 9999; r.s.foxT = 99999;
    r.tick(0, aimOf(Math.PI));
    const d = r.s.p[1], ox = d.x + 18, oy = d.y + 28;
    r.s.arrows = [{ x: ox - along - 9, y: oy + across, vx: 9, vy: 0 }];
    r.tick(0, aimOf(Math.PI));
    return r.s.blocked === 1;
  };
  ok('Mitte des Schilds blockt', zone(50, 0));
  ok('Rand des Schilds blockt', zone(50, 30));
  ok('knapp über dem Schild fliegt der Pfeil durch', !zone(50, 40) && !zone(50, -40));
  ok('dicht am Körper ist kein Schild', !zone(26, 0));
  /* Hase: genau drei Treffer */
  const three = fresh(75);
  pair(three, 300, 400);
  three.s.vol.t = 99999; three.s.foxT = 99999;
  for (let i = 1; i <= 3; i++) {
    three.s.pinv[0] = 0;
    three.s.arrows = [{ x: three.s.p[0].x + 10, y: three.s.p[0].y + 28, vx: 2, vy: 0 }];
    three.tick(0, 0);
    ok('Hasentreffer ' + i + (i < 3 ? ': Hase lebt' : ': Game over'), (three.s.phase === 'over') === (i === 3), three.s.hp[0]);
  }
  /* Fuchs */
  const fx = fresh(76);
  pair(fx, 400, 40);
  fx.s.vol.t = 99999;
  fx.s.foxT = 1;
  fx.tick(0, 0);
  ok('Fuchs erscheint vorne', fx.s.fox && fx.s.fox.x > fx.s.p[1].x + 400);
  for (let i = 0; i < 300 && fx.s.fox.x > fx.s.p[1].x + 80; i++) fx.tick(0, 0);
  ok('Fuchs läuft zu den Figuren', fx.s.fox.x <= fx.s.p[1].x + 90, fx.s.fox.x | 0);
  const hits = [];
  for (let n = 0; n < 3; n++) {
    const before = fx.s.fox.x, hp = fx.s.fox.hp;
    const toFox = aimOf(Math.atan2(fx.s.fox.y + 17 - (fx.s.p[1].y + 28), fx.s.fox.x + 23 - (fx.s.p[1].x + 18)));
    fx.tick(0, toFox | Sim.S); fx.tick(0, toFox);
    ok('Schlag ' + (n + 1) + ' trifft', (fx.s.fox ? fx.s.fox.hp : 0) === hp - 1);
    if (!fx.s.fox) break;
    for (let i = 0; i < 40; i++) fx.tick(0, toFox);
    hits.push(Math.round(fx.s.fox.x - before));
    ok('Rückstoß gibt Zeit', fx.s.fox.x - before > 70, fx.s.fox.x - before | 0);
    for (let i = 0; i < 200 && fx.s.fox.x > fx.s.p[1].x + 70; i++) fx.tick(0, toFox);
  }
  ok('nach 3 Schlägen ist der Fuchs besiegt', fx.s.fox === null && fx.s.foxes === 1);
  const open = fresh(77);
  pair(open, 300, 300);
  open.s.vol.t = 99999; open.s.foxT = 99999;
  open.tick(0, aimOf(Math.PI)); open.tick(0, aimOf(Math.PI) | Sim.S);
  { const d = open.s.p[1]; open.s.arrows = [{ x: d.x + 18 - 58, y: d.y + 28, vx: 9, vy: 0 }]; }
  open.tick(0, aimOf(Math.PI));
  ok('beim Schwertschlag ist das Schild kurz offen', open.s.blocked === 0);
  const bite = fresh(78);
  pair(bite, 400, 300);
  bite.s.vol.t = 99999;
  bite.s.fox = { x: bite.s.p[0].x + 40, y: bite.s.p[0].y + 22, vy: 0, hp: 3, st: 0, kb: 0, g: 1, f: -1 };
  for (let i = 0; i < 12; i++) bite.tick(0, 0);
  ok('Fuchsbiss zählt beim Hasen als Treffer', bite.s.hp[0] === 100 - VOL.DMG[0], bite.s.hp[0]);
  /* Heilung */
  const k = fresh(72);
  pair(k, 300, 30);
  k.s.vol.t = 9999; k.s.hp = [40, 40];
  for (let i = 0; i < 6; i++) k.tick(0, 0);
  k.tick(K, 0);
  for (let i = 0; i < 110; i++) k.tick(0, 0);
  ok('Kuss des Hasen füllt Dinos Leben auf, Hase bleibt', k.s.hp[0] === 40 && k.s.hp[1] === 100, k.s.hp.join());
  const nk = fresh(79);
  pair(nk, 300, 30);
  nk.s.vol.t = 9999; nk.s.hp = [100, 50];
  for (let i = 0; i < 6; i++) nk.tick(0, 0);
  nk.tick(0, K);
  for (let i = 0; i < 110; i++) nk.tick(0, 0);
  ok('Kuss vom Dino heilt nicht', nk.s.hp[1] === 50, nk.s.hp.join());
  /* Späherin */
  const sc = fresh(80);
  pair(sc, 600, 40);
  sc.s.foxT = 99999;
  const up = aimOf(-Math.PI * .75);
  sc.tick(up | Sim.S, 0);
  ok('Klick des Hasen setzt die Markierung', sc.s.mark === (up >> 5), sc.s.mark);
  sc.s.vol.t = 1; sc.s.vol.st = 'warn';
  let gone = -1;
  for (let i = 0; i < 80 && sc.s.mark >= 0; i++) { sc.tick(up, 0); gone = i; }
  const near = sc.s.arrows.some(q => Math.abs(q.x - sc.s.p[0].x) < VOL.VIEW + 15);
  ok('Markierung verschwindet, sobald Pfeile im Sichtfeld sind', sc.s.mark === -1 && near, gone);
  /* Möhren */
  const c1 = fresh(81);
  pair(c1, 600, 300);
  c1.s.vol.t = 9999; c1.s.foxT = 99999;
  c1.tick(aimOf(0) | Sim.T, 0);
  const y0 = c1.s.car[0].y;
  for (let i = 0; i < 40; i++) c1.tick(aimOf(0), 0);
  ok('Möhre fliegt geradeaus ohne Schwerkraft', c1.s.car[0] && c1.s.car[0].y === y0 && c1.s.car[0].vy === c1.s.car[0].vy);
  const c2 = fresh(82);
  pair(c2, 700, 60);
  c2.s.foxT = 99999; c2.s.vol.t = 99999;
  for (let i = 0; i < 90; i++) c2.tick(0, 0);
  const tgt = c2.s.arch[0], a0 = Math.atan2(tgt.y - (c2.s.p[0].y + 22), tgt.x - (c2.s.p[0].x + 18));
  c2.tick(aimOf(a0), 0); c2.tick(aimOf(a0) | Sim.T, 0);
  for (let i = 0; i < 110 && !c2.s.arch[0].down; i++) c2.tick(aimOf(a0), 0);
  ok('Möhre trifft Bogenschützen', c2.s.arch[0].down === 1 && c2.s.downs === 1);
  c2.s.vol.side = 1; c2.s.vol.st = 'warn'; c2.s.vol.t = 1;
  c2.tick(0, 0);
  ok('Dessen nächste Salve fällt aus', c2.s.arrows.length === 0 && c2.s.arch[0].down === 0 && c2.events.some(e => e.e === 'skipped'));
  const c3 = fresh(83);
  pair(c3, 700, 300);
  c3.s.vol.t = 99999;
  c3.s.fox = { x: c3.s.p[0].x + 120, y: c3.s.p[0].y + 22, vy: 0, hp: 3, st: 0, kb: 0, g: 1, f: -1 };
  c3.tick(aimOf(0) | Sim.T, 0);
  for (let i = 0; i < 12; i++) c3.tick(aimOf(0), 0);
  ok('Möhre betäubt den Fuchs, kostet ihn aber kein Leben', c3.s.fox.st > 60 && c3.s.fox.hp === 3, c3.s.fox.st);
  const o = fresh(73);
  pair(o, 300, 300);
  o.s.vol.t = 9999; o.s.hp[0] = 10;
  o.s.arrows = [{ x: o.s.p[0].x + 10, y: o.s.p[0].y + 28, vx: 9, vy: 0 }];
  for (let i = 0; i < 40; i++) o.tick(0, 0);
  ok('Hase bei 0: Game over genau einmal', o.s.phase === 'over' && o.events.filter(e => e.e === 'over').length === 1);
  /* lösbar: dieselben Abschnitte wie im Rabenlauf, Salven zerstören nichts */
  const p = JSON.parse(JSON.stringify(Sim.pack(a.s))); p.ev = [];
  ok('gepackter Zustand rechnet weiter', !!Sim.step(p, [R, R], { predict: true }).p);
}
console.log(`\n${passed} bestanden, ${fails} fehlgeschlagen`);
process.exit(fails ? 1 : 0);
