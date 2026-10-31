// Regeltests in der echten Simulation: Sterne, Ausgang, Checkpoints, Respawn, Reset, Fuzz.
const { Sim, LEVELS, Runner, play, go, hop, C, L, R, J, E } = require('./lib');
const plans = require('./walkthroughs');

let fails = 0, passed = 0;
const ok = (name, cond, info = '') => { if (cond) { passed++; console.log('  ok  ', name); } else { fails++; console.log('  FEHLER', name, info); } };

function toSection(lvl, sec) { // spielt bis zum Beginn von Abschnitt sec
  const r = new Runner(lvl);
  for (let i = 0; i < sec; i++) play(r, [plans[lvl][i](r)]);
  return r;
}
const hit = Sim.hit;
const inSolid = (r, x, y, w, h) => r.w.solids.some(a => !a.oneWay && hit(x, y, w, h, a.x, a.y, a.w, a.h));

console.log('Stern zählt bei gleichzeitigem Einsammeln nur einmal');
{
  const r = new Runner(0), st = r.s.stars[0];
  for (const p of r.s.p) { p.x = st.x - 18; p.y = st.y - 28; p.vy = 0; }
  r.tick(0, 0);
  ok('Sterne == 1', r.s.got === 1, r.s.got);
  ok('genau ein star-Ereignis', r.events.filter(e => e.e === 'star').length === 1);
  for (let i = 0; i < 30; i++) r.tick(0, 0);
  ok('bleibt 1', r.s.got === 1);
}

console.log('Ausgang braucht alle Sterne und beide Spieler; Abschluss nur einmal');
{
  const r = new Runner(1), e = r.w.exit;
  const put = (p, x) => { p.x = x; p.y = e.y + e.h - C.PH; p.vy = 0; };
  put(r.s.p[0], e.x + 40); put(r.s.p[1], e.x + 80);
  for (let i = 0; i < 90; i++) r.tick(0, 0);
  ok('ohne Sterne kein Abschluss', r.s.phase === 'play');
  r.s.stars.forEach(s => { s.g = 1; }); r.s.got = r.w.starCount;
  r.s.p[1].x = 3000;
  for (let i = 0; i < 90; i++) r.tick(0, 0);
  ok('ein Spieler reicht nicht', r.s.phase === 'play');
  put(r.s.p[1], e.x + 80);
  for (let i = 0; i < 40; i++) r.tick(0, 0);
  ok('beide + alle Sterne = Abschluss', r.s.phase === 'done');
  for (let i = 0; i < 400; i++) { r.tick(0, 0); if (r.s.lvl === 2) { put(r.s.p[0], 1); } }
  ok('Abschluss-Ereignis genau einmal', r.events.filter(e => e.e === 'done').length === 1);
  ok('Levelwechsel genau einmal', r.s.lvl === 2 && r.events.filter(e => e.e === 'level').length === 1, r.s.lvl);
}

console.log('Letztes Level führt ins Finale');
{
  const r = new Runner(LEVELS.length - 1);
  r.s.phase = 'done'; r.s.t = 2;
  for (let i = 0; i < 5; i++) r.tick(0, 0);
  ok('Phase finale', r.s.phase === 'finale');
}

console.log('Spawnpunkte sind sicher');
LEVELS.forEach((d, lvl) => {
  const w = Sim.world(lvl), r = new Runner(lvl);
  w.spawns.forEach((sp, i) => sp.forEach((pos, k) => {
    const x = pos[0], y = pos[1] - C.PH;
    const inGate = w.gates.some(g => hit(x, y, C.PW, C.PH, g.x, g.y, g.w, g.h));
    const inBox = w.boxes.some(b => hit(x - 10, y - 10, C.PW + 20, C.PH + 20, b.x, b.y, C.BOX, C.BOX));
    const floor = w.solids.some(a => a.y === pos[1] && x + C.PW / 2 > a.x && x + C.PW / 2 < a.x + a.w);
    if (inSolid(r, x, y, C.PW, C.PH) || inGate || inBox || !floor) ok(`L${lvl} Spawn ${i}/${k}`, false, JSON.stringify({ inGate, inBox, floor }));
  }));
  ok(`L${lvl}: alle ${w.spawns.length * 2} Spawnpunkte frei und auf festem Boden`, true);
});

console.log('Verpasste Sterne hüpfen zur Flagge und bleiben erreichbar');
{
  for (const [lvl, sec] of [[1, 0], [2, 0], [4, 1]]) {
    const r = toSection(lvl, sec);
    const ids = r.w.stars.map((s, i) => (s.s === sec ? i : -1)).filter(i => i >= 0);
    const c = r.w.cps[sec], base = r.s.got;
    /* Sterne sind verpasst: weit weg gelegt, Spieler landen an der Flagge */
    ids.forEach(i => { r.s.stars[i].y = -5000; });
    r.s.p[0].x = c.flag[0] - 40; r.s.p[0].y = c.flag[1] - C.PH; r.s.p[1].x = c.flag[0] + 20; r.s.p[1].y = c.flag[1] - C.PH;
    r.tick(0, 0);
    ok(`L${lvl}/${sec}: Checkpoint aktiv`, r.s.cp === sec + 1);
    ok(`L${lvl}/${sec}: Sterne an der Flagge`, ids.every(i => Math.abs(r.s.stars[i].y - c.lost[1]) < 1));
    for (const i of ids) {
      const g = go(r, 0, r.s.stars[i].x); for (const b of g) r.tick(b, 0);
      for (const b of hop(r, 0, r.s.stars[i].x)) r.tick(b, 0);
    }
    ok(`L${lvl}/${sec}: alle eingesammelt`, r.s.got === base + ids.length, r.s.got - base);
  }
}

console.log('Absturz: Sterne bleiben, beide am Checkpoint, Abschnitt zurückgesetzt, fertige Abschnitte bleiben');
{
  const r = toSection(1, 2);
  const got = r.s.got, gateOld = r.s.gates.map(g => g.o);
  // Abschnitt 2 anfangen: Box verschieben
  r.s.boxes[0].x += 120;
  r.s.p[0].y = 2000;
  for (let i = 0; i < 90; i++) r.tick(0, 0);
  const sp = r.w.spawns[2];
  ok('Sterne erhalten', r.s.got === got);
  ok('beide am Checkpoint', Math.abs(r.s.p[0].x - sp[0][0]) < 8 && Math.abs(r.s.p[1].x - sp[1][0]) < 8);
  ok('Box zurück', Math.abs(r.s.boxes[0].x - r.w.boxes[0].x) < .01);
  ok('alte Brücke bleibt offen', r.s.gates[r.w.gates.findIndex(g => g.t === 'bridge')].o >= gateOld[r.w.gates.findIndex(g => g.t === 'bridge')] && r.s.gates[r.w.gates.findIndex(g => g.t === 'bridge')].l === 1);
}
console.log('Box in der Grube kehrt von selbst zurück');
{
  const r = toSection(1, 3), i = 1;
  r.s.boxes[i].x = 5120; r.s.boxes[i].y = 640; r.s.boxes[i].g = -1;
  for (let t = 0; t < 120; t++) r.tick(0, 0);
  ok('Box wieder am Start', Math.abs(r.s.boxes[i].x - r.w.boxes[i].x) < .01);
  ok('Absturz ausgelöst? nein', r.s.phase === 'play');
}

console.log('Tür zerquetscht niemanden');
{
  const r = new Runner(1);
  const gi = 0, g = r.w.gates[gi];
  r.s.gates[gi].o = 1;
  r.s.p[0].x = g.x - 6; r.s.p[0].y = 620 - C.PH;
  for (let t = 0; t < 200; t++) r.tick(0, 0);
  const p = r.s.p[0];
  ok('Spieler nicht in Tür', !hit(p.x, p.y, C.PW, C.PH, g.x, g.y, g.w, g.h * (1 - r.s.gates[gi].o)));
  ok('Tür hat geschlossen', r.s.gates[gi].o === 0);
}

console.log('Räuberleiter: Fahrt auf dem Kopf ist stabil');
{
  const r = new Runner(1);
  r.s.p[0].x = 200; r.s.p[1].x = 200; r.s.p[1].y = 620 - 2 * C.PH - 2;
  for (let t = 0; t < 20; t++) r.tick(0, 0);
  ok('steht auf dem Kopf', r.s.p[1].g === Sim.PL);
  let drift = 0;
  for (let t = 0; t < 120; t++) { r.tick(t < 40 ? R : t < 80 ? L : 0, 0); drift = Math.max(drift, Math.abs(r.s.p[1].x - r.s.p[0].x)); }
  ok('rutscht nicht vom Kopf', r.s.p[1].g === Sim.PL && drift < 1, drift);
  r.tick(J, 0);
  ok('Unterer kann mit Partner oben nicht springen', r.s.p[0].vy >= 0);
}

console.log('Fuzz: Zufallsspiel, dann Reset, dann muss der Abschnitt und das Level lösbar bleiben');
{
  let seed = 12345;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const bad = [];
  for (let lvl = 0; lvl < plans.length; lvl++) {
    for (let sec = 0; sec < plans[lvl].length; sec++) {
      const r = toSection(lvl, sec);
      try {
        let a = 0, b = 0;
        for (let t = 0; t < 1500; t++) {
          if (t % 18 === 0) { a = rnd(16); b = rnd(16); }
          r.tick(a, b);
          if (r.s.lvl !== lvl) throw new Error('Fuzz wechselte Level');
        }
        /* NaN oder Kollisionsfehler? */
        for (const p of r.s.p) if (!(Number.isFinite(p.x) && Number.isFinite(p.y)) || inSolid(r, p.x, p.y, C.PW, C.PH)) throw new Error('Spieler in Wand');
        while (r.s.phase !== 'play') r.tick(0, 0);
        Sim.requestReset(r.s);
        for (let t = 0; t < 60; t++) r.tick(0, 0);
        if (r.s.phase !== 'play') throw new Error('nach Reset nicht spielbar');
        for (let i = r.s.cp; i < plans[lvl].length; i++) play(r, [plans[lvl][i](r)]);
        if (r.s.phase !== 'done' || r.s.got !== r.w.starCount) throw new Error(`nicht beendet, Sterne ${r.s.got}`);
      } catch (e) { bad.push(`L${lvl}/${sec}: ${e.message}`); }
    }
  }
  ok('Alle Abschnitte nach Zufallsspiel und Reset lösbar', bad.length === 0, '\n   ' + bad.join('\n   '));
}

console.log(`\n${passed} bestanden, ${fails} fehlgeschlagen`);
process.exit(fails ? 1 : 0);
