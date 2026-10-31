// Lokaler Koop im Browser, geöffnet direkt als Datei (file://), also ganz ohne Server:
// prüft die Tastenbelegung, die Kamera und spielt alle Level mit beiden Figuren auf einer Seite durch.
const { chromium } = require('playwright');
const path = require('path');
const { Sim } = require('./lib');
const plans = require('./walkthroughs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(ok ? 'OK    ' : 'FEHLER', n, info); };
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : [0, 1, 2, 3, 4];

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => check('Seitenfehler: ' + e.message, false));
  await p.goto('file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/'));
  await p.click('#btnLocal'); await p.click('#btnLocalGo');
  await p.waitForFunction(() => PF.G.s);
  const pos = () => p.evaluate(() => PF.G.s.p.map(q => ({ x: q.x, y: q.y, g: q.g })));
  const a = await pos();
  await p.keyboard.down('d'); await p.keyboard.down('ArrowRight'); await sleep(350); await p.keyboard.up('d'); await p.keyboard.up('ArrowRight');
  const c = await pos();
  check('Beide Figuren laufen gleichzeitig (D und Pfeil rechts)', c[0].x > a[0].x + 40 && c[1].x > a[1].x + 40);
  await p.keyboard.down('w'); await sleep(80); const d = await pos(); await p.keyboard.up('w');
  check('W springt nur mit dem Hasen', d[0].g === -1 && d[1].g !== -1);
  await sleep(800);
  await p.keyboard.down('ArrowUp'); await sleep(80); const e = await pos(); await p.keyboard.up('ArrowUp');
  check('Pfeil hoch springt nur mit dem Dino', e[1].g === -1 && e[0].g !== -1);
  await sleep(800);
  await p.keyboard.down('a'); await sleep(250); await p.keyboard.up('a');
  await p.keyboard.down('ArrowLeft'); await sleep(250); await p.keyboard.up('ArrowLeft');
  /* E und Enter am Hebel */
  for (const [who, key] of [[0, 'e'], [1, 'Enter']]) {
    await p.evaluate(([who]) => { PF.startLocal(0); const s = PF.G.s, l = PF.G.w.levers[0]; s.p[who].x = l.x - 18; s.p[who].y = l.y - 56; }, [who]);
    await sleep(120); await p.keyboard.press(key); await sleep(120);
    check(`${key} betätigt den Hebel`, await p.evaluate(() => PF.G.s.levers[0] === 1));
  }
  /* Kamera */
  await p.evaluate(() => { PF.startLocal(1); const s = PF.G.s; s.p[0].x = 300; s.p[1].x = 800; }); await sleep(900);
  let cam = await p.evaluate(() => ({ split: PF.G.split, z: PF.G.cams[0].z }));
  check('Mittlerer Abstand: gemeinsame Kamera zoomt heraus', cam.split === 0 && cam.z < .95, JSON.stringify(cam));
  await p.evaluate(() => { const s = PF.G.s; s.p[0].x = 300; s.p[1].x = 1450; s.p[1].y = 564; }); await sleep(500);
  cam = await p.evaluate(() => ({ split: PF.G.split }));
  check('Großer Abstand: geteilter Bildschirm', cam.split === 1);
  await p.screenshot({ path: path.join(process.env.SHOTS || '.', 'local_split.png') });
  await p.keyboard.press('Escape'); await sleep(100);
  const paused = await p.evaluate(() => [PF.G.paused, document.getElementById('scrPause').classList.contains('on')]);
  const t0 = await p.evaluate(() => PF.G.s.tick); await sleep(200); const t1 = await p.evaluate(() => PF.G.s.tick);
  check('Esc pausiert lokal und zeigt das Menü', paused[0] && paused[1] && t0 === t1);
  await p.keyboard.press('Escape');

  /* Alle Level */
  const r = { s: null, w: null };
  for (const lvl of only) {
    await p.evaluate(l => PF.startLocal(l), lvl);
    let bits = [0, 0];
    const sync = async () => { const j = await p.evaluate(([x, y]) => { PF.setInput(0, x); PF.setInput(1, y); return JSON.stringify(PF.G.s); }, bits); r.s = JSON.parse(j); r.w = Sim.world(r.s.lvl); };
    await sync();
    const t = Date.now();
    let tries = 0, failed = false;
    while (r.s.phase === 'play' && r.s.lvl === lvl && tries < 8) {
      const sec = Math.min(r.s.cp, plans[lvl].length - 1), iter = plans[lvl][sec](r)(r)[Symbol.iterator]();
      let next = Date.now();
      try {
        for (;;) {
          const n = iter.next();
          if (n.done) break;
          bits = n.value; next += 1000 / 60;
          const w = next - Date.now(); if (w > 1) await sleep(w - .5); else if (w < -200) next = Date.now();
          await sync();
          if (r.s.phase !== 'play') { if (r.s.phase === 'fall') throw new Error('Absturz'); break; }
        }
      } catch (e) {
        tries++; failed = true; console.log(`   L${lvl}/${sec} Wiederholung: ${e.message.slice(0, 80)}`);
        bits = [0, 0]; await p.evaluate(() => PF.Sim.requestReset(PF.G.s)); await sleep(1400);
      }
      bits = [0, 0]; await sync();
      if (r.s.phase === 'play' && !failed && sec === plans[lvl].length - 1) break;
      failed = false;
    }
    check(`Level ${lvl} lokal abgeschlossen`, r.s.phase === 'done' || r.s.phase === 'finale' || r.s.lvl !== lvl, `${((Date.now() - t) / 1000) | 0} s, Wiederholungen ${tries}`);
  }
  await b.close();
  const bad = results.filter(x => !x).length;
  console.log(`Ergebnis: ${results.length - bad} ok, ${bad} Fehler`);
  process.exit(bad ? 1 : 0);
})();
