// Lädt die Simulation aus der index.html (dieselbe Quelle wie Server und Browser)
// und stellt einen kleinen Bot für Durchspiel-Tests bereit.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadShared() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<script id="shared">([\s\S]*?)<\/script>/);
  const ctx = { module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(m[1], ctx);
  return ctx.module.exports;
}

const { Sim, LEVELS } = loadShared();
const { L, R, J, E, C } = Sim;

/* Treiber: führt Schritte aus. Ein Schritt ist eine Funktion (ctx) => bits|null pro Spieler. */
class Runner {
  constructor(lvl, state) {
    this.s = state || Sim.newState(lvl);
    this.w = Sim.worldOf(this.s);
    this.events = [];
    this.trace = false;
    this.ticks = 0;
    this.input = [0, 0];
  }
  tick(i0, i1) {
    this.input = [i0 | 0, i1 | 0];
    const lvl = this.s.lvl;
    this.s = Sim.step(this.s, this.input);
    for (const e of this.s.ev) this.events.push(e);
    this.s.ev.length = 0;
    this.ticks++;
    this.w = Sim.worldOf(this.s);
  }
}

/* --- Bot-Bewegungen als Generatoren: yield bits --- */
const P = (r, i) => r.s.p[i];
const footAt = (r, x, y) => { // steht unter (x,y) etwas innerhalb kurzer Distanz?
  const w = r.w;
  for (const a of w.solids) if (x >= a.x && x <= a.x + a.w && a.y >= y - 4 && a.y <= y + 60) return true;
  for (const m of r.s.movers.map((m, i) => ({ x: m.x, y: m.y, w: w.movers[i].w }))) if (x >= m.x && x <= m.x + m.w && m.y >= y - 4 && m.y <= y + 60) return true;
  for (let i = 0; i < w.gates.length; i++) { const g = w.gates[i]; if (g.t === 'bridge' && r.s.gates[i].o > 0.95 && x >= g.x && x <= g.x + g.w && g.y >= y - 4 && g.y <= y + 60) return true; }
  for (const b of r.s.boxes) if (x >= b.x && x <= b.x + C.BOX && b.y >= y - 4 && b.y <= y + 60) return true;
  return false;
};

/* laufen bis Zielspalte; springt automatisch bei Hindernis oder Abgrund */
function* go(r, i, x, opt = {}) {
  if (typeof x !== 'number') throw new Error('go: Ziel fehlt');
  const tol = opt.tol || 5;
  let stuck = 0, lastX = P(r, i).x;
  for (let t = 0; t < (opt.max || 1800); t++) {
    const p = P(r, i);
    const cx = p.x + C.PW / 2, d = x - cx;
    if (Math.abs(d) <= tol) { if (Math.abs(p.vx) < 1 && (p.g !== -1 || opt.air)) return; yield 0; continue; }
    let bits = d > 0 ? R : L;
    const dir = d > 0 ? 1 : -1;
    if (Math.abs(d) < 14 && Math.abs(p.vx) > 1.5) bits = 0; // bremsen
    stuck = Math.abs(p.x - lastX) < 0.3 ? stuck + 1 : 0;
    lastX = p.x;
    const edge = p.g !== -1 && !opt.noPit && !footAt(r, cx + dir * (opt.look || 20), p.y + C.PH);
    if (!opt.noJump && (stuck > 6 && stuck % 20 < 14 || edge)) bits |= J;
    if (p.g === -1 && p.vy < 0 && !opt.short) bits |= J;
    yield bits;
  }
  throw new Error(`go(${i},${x}) Zeitüberschreitung bei x=${P(r, i).x | 0},y=${P(r, i).y | 0}`);
}
/* gezielter Sprung: läuft mit Taste dir, hält Sprung für n Ticks, wartet auf Landung */
function* leap(r, i, dir, opt = {}) {
  const pre = opt.pre || 0;
  for (let t = 0; t < pre; t++) yield dir > 0 ? R : dir < 0 ? L : 0;
  const hold = opt.hold || 22;
  for (let t = 0; t < hold; t++) yield J | (dir > 0 ? R : dir < 0 ? L : 0);
  for (let t = 0; t < 200; t++) { if (P(r, i).g !== -1) return; yield opt.steer === 0 ? 0 : (dir > 0 ? R : dir < 0 ? L : 0); }
  throw new Error('leap: keine Landung');
}
function* press(r, i, bit = E) { yield 0; for (let n = 0; n < 6; n++) yield bit; yield 0; yield 0; }
function* wait(r, n) { for (let t = 0; t < n; t++) yield 0; }
function* until(r, fn, name = 'Bedingung', max = 1800, bits = 0) {
  for (let t = 0; t < max; t++) { if (fn(r)) return; yield bits; }
  throw new Error(`until(${name}) Zeitüberschreitung; p0=${P(r, 0).x | 0},${P(r, 0).y | 0} p1=${P(r, 1).x | 0},${P(r, 1).y | 0}`);
}
/* Box Richtung Ziel schieben: geht auf die andere Seite und drückt */
function* pushTo(r, i, bi, x, opt = {}) {
  const b = () => r.s.boxes[bi];
  const dir = x > b().x ? 1 : -1;
  const side = () => dir > 0 ? b().x - 24 : b().x + C.BOX + 24;
  yield* go(r, i, side(), { ...opt, tol: 6 });
  for (let t = 0; t < 3000; t++) {
    if (dir > 0 ? b().x >= x : b().x <= x) return;
    yield dir > 0 ? R : L;
  }
  throw new Error(`pushTo Zeitüberschreitung, Box bei ${b().x | 0}`);
}
/* i klettert auf den Kopf von Spieler o: auf gleiche Spalte, hochspringen, landen */
function* mount(r, i, o) {
  const pi = () => P(r, i), po = () => P(r, o);
  for (let a = 0; a < 5; a++) {
    yield* go(r, i, po().x + C.PW / 2, { noPit: true, noJump: true, tol: 6 });
    for (let t = 0; t < 70; t++) {
      if (pi().g === Sim.PL + o) { yield* wait(r, 6); return; }
      const d = po().x - pi().x;
      yield (t < 24 ? J : 0) | (Math.abs(d) > 3 ? (d > 0 ? R : L) : 0);
    }
  }
  throw new Error('mount fehlgeschlagen');
}
/* gezielter Sprung auf Spalte x: hält Sprung und lenkt, wartet auf Landung */
function* hop(r, i, x, opt = {}) {
  const hold = opt.hold || 26;
  for (let t = 0; t < 240; t++) {
    const p = P(r, i), d = x - (p.x + C.PW / 2);
    if (t > 3 && p.g !== -1) { yield* wait(r, 4); return; }
    yield (t < hold ? J : 0) | (Math.abs(d) > 5 ? (d > 0 ? R : L) : 0);
  }
  throw new Error('hop: keine Landung');
}
/* wartet, bis Plattform m am Rand steht (fn), und betritt sie bis Spalte offset */
function* ride(r, i, m, edge, off = 100) {
  const pos = () => r.s.movers[m];
  yield* until(r, edge, 'Plattform da', 1800);
  for (let t = 0; t < 200; t++) {
    const p = P(r, i);
    if (p.g === 2000 + m) break;
    const d = pos().x + off - (p.x + C.PW / 2);
    yield d > 0 ? R : L;
  }
  yield* wait(r, 1);
}

/* von der Kante ans Seil springen, schwingen, an der richtigen Stelle loslassen, zum nächsten */
function* swingAcross(r, i, ropes, landX) {
  for (let n = 0; n < 700; n++) {
    const p = P(r, i), cx = p.x + C.PW / 2;
    if (p.g !== -1 && cx >= landX) return;
    if (p.rope >= 0) {
      const q = r.w.ropes[p.rope], last = p.rope === r.w.ropes.findIndex(o => o.x === ropes[ropes.length - 1].x);
      yield R | (p.om > 0 && p.ang > (last ? .42 : .3) ? J : 0);
    } else if (p.g !== -1) {
      const edge = cx > ropes[0].x - 165;
      yield R | (edge ? J : 0);
    } else yield R | (p.vy < 0 ? J : 0);
  }
  throw new Error('swingAcross: nicht drüben, x=' + (P(r, i).x | 0));
}
/* zwischen zwei Kletterwänden hochspringen */
function* wallClimb(r, i, left, right, topY, overX) {
  for (let n = 0; n < 500; n++) {
    const p = P(r, i), cx = p.x + C.PW / 2;
    if (p.y + C.PH <= topY + 2 && p.vx > 0) { yield* hopOver(r, i, overX); return; }
    const toRight = p.wall ? p.wall > 0 : cx < (left + right) / 2;
    if (p.g !== -1) { yield J | R; continue; }
    const go = p.wj ? 0 : (p.wall > 0 ? R : p.wall < 0 ? L : (p.vx >= 0 ? R : L));
    const want = p.wall && p.vy > -2 && !p.wj;
    yield go | (want ? ((p.bits & J) ? 0 : J) : (p.vy < -2 ? J : 0));
    void toRight;
  }
  throw new Error('wallClimb: oben nicht erreicht, y=' + (P(r, i).y | 0));
}
function* hopOver(r, i, x) {
  for (let t = 0; t < 120; t++) { const p = P(r, i); if (t > 2 && p.g !== -1) return; yield R | (p.vy < 0 ? J : 0); void x; }
}

/* Parallel: gen pro Spieler; endet wenn beide fertig (oder ein "lead" fertig ist) */
function* par(r, g0, g1) {
  let a = g0 ? g0 : null, b = g1 ? g1 : null;
  while (a || b) {
    let x = 0, y = 0;
    if (a) { const n = a.next(); if (n.done) a = null; else x = n.value | 0; }
    if (b) { const n = b.next(); if (n.done) b = null; else y = n.value | 0; }
    yield [x, y];
  }
}
/* Schritt nur für einen Spieler, der andere bleibt stehen (hält ggf. eine Platte) */
const only = (r, i, gen) => par(r, i === 0 ? gen : null, i === 1 ? gen : null);

function play(r, plan) {
  for (const stepGen of plan) {
    const g = typeof stepGen === 'function' ? stepGen(r) : stepGen;
    for (const v of g) {
      r.tick(v[0], v[1]);
    }
  }
}

module.exports = { Sim, LEVELS, Runner, go, hop, ride, swingAcross, wallClimb, leap, press, wait, until, pushTo, mount, par, only, play, loadShared, P, L, R, J, E, C };
