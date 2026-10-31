// Koop-Prüfung: Kann ein einzelner Spieler den nächsten Checkpoint/Ausgang allein erreichen,
// während der Partner am Abschnittsanfang stehen bleibt? Breitensuche über Bewegungsmakros in der
// echten Physik (auch mit Schieben, Hebeln und Platten). Ergebnis ist eine Stichprobe, kein Beweis.
const { Sim, Runner, play, C, L, R, J, E } = require('./lib');
const plans = require('./walkthroughs');
const LIMIT = +(process.argv[2] || 1600);

const ACTIONS = [
  { n: 'r', seq: [[R, 14]] }, { n: 'l', seq: [[L, 14]] }, { n: 'R', seq: [[R, 40]] }, { n: 'L', seq: [[L, 40]] },
  { n: 'jr', seq: [[R | J, 24], [R, 60]] }, { n: 'jl', seq: [[L | J, 24], [L, 60]] }, { n: 'j', seq: [[J, 24], [0, 60]] },
  { n: 'rj', seq: [[R, 12], [R | J, 24], [R, 60]] }, { n: 'lj', seq: [[L, 12], [L | J, 24], [L, 60]] },
  { n: 'e', seq: [[E, 2], [0, 4]] }, { n: 'w', seq: [[0, 50]] },
];
function explore(start, goal, who) {
  const key = s => {
    const p = s.p[who];
    return [Math.round(p.x / 18), Math.round(p.y / 18), s.boxes.map(b => Math.round(b.x / 40)).join(','), s.levers.join(''), s.gates.map(g => g.l).join(''), s.movers.map(m => Math.round((m.x + m.y) / 90)).join(',')].join('|');
  };
  const seen = new Set([key(start)]);
  let q = [start], n = 0;
  while (q.length && n < LIMIT) {
    const nq = [];
    for (const s0 of q) {
      if (n++ >= LIMIT) break;
      for (const a of ACTIONS) {
        let s = JSON.parse(JSON.stringify(s0));
        const lvl = s.lvl;
        let dead = false;
        outer: for (const [bits, t] of a.seq) for (let i = 0; i < t; i++) {
          const inp = [0, 0]; inp[who] = bits;
          s = Sim.step(s, inp); s.ev.length = 0;
          if (s.phase !== 'play' || s.lvl !== lvl) { dead = s.phase === 'fall'; break outer; }
          if (bits === (bits & (L | R)) && false) break;
          if (i > 6 && s.p[who].g !== -1 && (bits & J) === 0 && t === 60) break;
        }
        if (dead) continue;
        if (goal(s)) return { reached: true, nodes: n };
        const k = key(s);
        if (!seen.has(k)) { seen.add(k); nq.push(s); }
      }
    }
    q = nq;
  }
  return { reached: false, nodes: n, exhausted: !q.length };
}
const res = [];
for (let lvl = 0; lvl < plans.length; lvl++) {
  const r = new Runner(lvl);
  for (let sec = 0; sec < plans[lvl].length; sec++) {
    const start = JSON.parse(JSON.stringify(r.s));
    const w = r.w, c = w.cps[sec];
    const fromCp = start.cp;
    for (const who of [0, 1]) {
      const goal = c
        ? s => { const p = s.p[who]; return Sim.hit(p.x, p.y, C.PW, C.PH, c.x, c.y, c.w, c.h); }
        : s => Sim.inExit(w, s.p[who]);
      const o = explore(start, goal, who);
      res.push({ lvl, sec, who, ...o });
      console.log(`L${lvl}/${sec} ${who ? 'Dino' : 'Hase'} allein: ${o.reached ? 'ERREICHT Ziel' : 'kommt nicht hin'} (${o.nodes} Knoten${o.exhausted ? ', vollständig' : ''})`);
    }
    play(r, [plans[lvl][sec](r)]);
    void fromCp;
  }
}
const solo = res.filter(x => x.reached).map(x => `L${x.lvl}/${x.sec}`);
console.log('Allein erreichbar:', [...new Set(solo)].join(', ') || 'keiner');
