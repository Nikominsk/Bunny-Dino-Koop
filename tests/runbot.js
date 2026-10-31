// Bot-Lösungswege für die Abschnitte des Endlos-Laufs (nur Eingaben, gelesen aus dem Spielzustand)
const { Sim, go, hop, until, press, mount, par, only, swingAcross, wallClimb, R, L, P } = require('./lib');
const { RUN } = Sim;
const both = (r, a, b, o) => par(r, go(r, 0, a, o), go(r, 1, b, o));
const boxOf = (r, c) => r.w.boxes.findIndex(h => h.s === c);
const movers = (r, c) => r.w.movers.map((m, i) => (m.s === c ? i : -1)).filter(i => i >= 0);
function* pushAt(r, i, c, x) {
  yield* go(r, i, r.s.boxes[boxOf(r, c)].x - 24, { tol: 6, noJump: true });
  for (let t = 0; t < 800; t++) { const b = boxOf(r, c); if (b < 0 || r.s.boxes[b].x >= x) return; yield R; }
  throw new Error('Box klemmt');
}
function* rideBoth(r, c, m, off, horiz) {
  yield* par(r, until(r, q => (horiz ? q.s.movers[movers(q, c)[m]].x <= c * RUN.W + 318 : q.s.movers[movers(q, c)[m]].y >= 612), 'Plattform da', 900));
  for (let t = 0; t < 160; t++) {
    const mm = r.s.movers[movers(r, c)[m]], tx = mm.x + off;
    const a = tx - 26 - (P(r, 0).x + 18), b = tx + 26 - (P(r, 1).x + 18);
    if (P(r, 0).g === 2000 + movers(r, c)[m] && P(r, 1).g === 2000 + movers(r, c)[m]) return;
    yield [Math.abs(a) > 5 ? (a > 0 ? R : L) : 0, Math.abs(b) > 5 ? (b > 0 ? R : L) : 0];
  }
}
function* solve(r, c) {
  const X = c * RUN.W, kind = Sim.runKind(r.s.seed, c), end = X + RUN.W + 90;
  switch (kind) {
    case 'swing': {
      const ropes = () => r.w.ropes.filter(q => q.s === c);
      yield* both(r, X + 200, X + 150, { noJump: true });
      yield* par(r, swingAcross(r, 0, ropes(), X + 990), swingAcross(r, 1, ropes(), X + 990));
      break;
    }
    case 'shaft':
      yield* both(r, X + 515, X + 515, { noJump: true });
      yield* par(r, wallClimb(r, 0, X + 460, X + 570, 230, X + 680), wallClimb(r, 1, X + 460, X + 570, 230, X + 680));
      yield* both(r, X + 1090, X + 1050, { noJump: true, noPit: true });
      break;
    case 'boxgap':
      yield* only(r, 0, pushAt(r, 0, c, X + 704));
      break;
    case 'hold':
      yield* both(r, X + 428, X + 300, { noJump: true });
      yield* only(r, 0, until(r, () => true, 'x'));
      yield* only(r, 1, go(r, 1, X + 998, { noPit: true, noJump: true }));
      yield* only(r, 0, go(r, 0, X + 1100, { noPit: true, noJump: true }));
      break;
    case 'twin':
      yield* both(r, X + 378, X + 738);
      yield* par(r, until(r, q => q.s.gates[q.w.gates.findIndex(g => g.s === c)].l === 1, 'Tür', 300));
      break;
    case 'ferry':
      yield* both(r, X + 270, X + 220, { noJump: true });
      yield* rideBoth(r, c, 0, 100, 'x');
      yield* par(r, until(r, q => q.s.movers[movers(q, c)[0]].x >= X + 799, 'drüben', 400));
      break;
    case 'boxwall':
      yield* only(r, 0, pushAt(r, 0, c, X + 744));
      break;
    case 'lift':
      yield* both(r, X + 300, X + 250, { noJump: true });
      yield* rideBoth(r, c, 0, 95);
      yield* par(r, until(r, q => q.s.movers[movers(q, c)[0]].y <= 472, 'Lift oben', 400));
      break;
    case 'updown':
      yield* both(r, X + 220, X + 170, { noJump: true });
      yield* rideBoth(r, c, 0, 85);
      yield* par(r, until(r, q => q.s.movers[movers(q, c)[0]].y <= 505, 'A oben', 400));
      yield* par(r, hop(r, 0, X + 640), hop(r, 1, X + 640));
      yield* par(r, hop(r, 0, X + 800), hop(r, 1, X + 800));
      break;
    case 'stack':
      yield* both(r, X + 620, X + 560);
      yield* only(r, 1, go(r, 1, X + 680));
      yield* only(r, 0, mount(r, 0, 1));
      yield* only(r, 0, hop(r, 0, X + 760)); yield* only(r, 0, go(r, 0, X + 800, { noJump: true })); yield* only(r, 0, press(r, 0));
      yield* only(r, 1, go(r, 1, X + 630, { noJump: true })); yield* only(r, 1, hop(r, 1, X + 630)); yield* only(r, 1, hop(r, 1, X + 760));
      break;
  }
  yield* both(r, end, end - 60);
}
/* weicht dem fixierten Sturzflug aus: raus aus dem Kreis, nicht hineinlaufen */
function dodge(r, bits) {
  const v = r.s.raven;
  if (!(v.st === 'dive' || (v.st === 'aim' && v.t <= RUN.LOCK))) return bits;
  return bits.map((x, k) => {
    const d = r.s.p[k].x + 18 - v.lx;
    if (Math.abs(d) < 110) return d > 0 ? R : L;
    return Math.abs(d) < 230 && ((d < 0 && (x & R)) || (d > 0 && (x & L))) ? 0 : x;
  });
}
module.exports = { solve, dodge };
