// Spielt alle Level in der echten Simulation durch und prüft Sterne, Checkpoints, Abschluss.
const { Sim, Runner, play, P } = require('./lib');
const plans = require('./walkthroughs');
const only = process.argv[2] === undefined ? null : +process.argv[2];
let ok = true;
for (let lvl = 0; lvl < plans.length; lvl++) {
  if (only !== null && lvl !== only) continue;
  const r = new Runner(lvl);
  let sec = 0;
  try {
    for (sec = 0; sec < plans[lvl].length; sec++) {
      const t0 = r.ticks;
      play(r, [plans[lvl][sec](r)]);
      if (r.s.lvl !== lvl) throw new Error('Level sprang');
      if (sec < plans[lvl].length - 1 && r.s.cp !== sec + 1) throw new Error('Checkpoint nicht aktiv');
      if (r.events.some(e => e.e === 'fall')) throw new Error('Absturz im Lösungsweg');
      console.log(`  L${lvl} Abschnitt ${sec}: ok (${((r.ticks - t0) / 60).toFixed(0)}s, Sterne ${r.s.got})`);
    }
    if (r.s.phase !== 'done') throw new Error('kein Abschluss');
    if (r.s.got !== r.w.starCount) throw new Error('Sterne fehlen');
    console.log(`L${lvl} „${r.w.name}“: geschafft, ${r.s.got}/${r.w.starCount} Sterne, Bot-Zeit ${(r.ticks / 60).toFixed(0)}s`);
  } catch (e) {
    ok = false;
    console.log(`L${lvl} Abschnitt ${sec} FEHLER: ${e.message}`);
    console.log('   p0', P(r, 0).x | 0, P(r, 0).y | 0, 'g', P(r, 0).g, ' p1', P(r, 1).x | 0, P(r, 1).y | 0, 'g', P(r, 1).g, 'phase', r.s.phase, 'cp', r.s.cp, 'got', r.s.got);
    console.log('   ', e.stack.split('\n').slice(1, 4).join(' | '));
  }
}
process.exit(ok ? 0 : 1);
