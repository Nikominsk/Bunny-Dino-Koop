// Kuss und Endlos-Lauf in zwei getrennten Chrome-Sitzungen über den echten Server, dazu lokal per file://.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const { Sim } = require('./lib');
const { solve, dodge } = require('./runbot');
const PORT = 3122, SHOTS = process.env.SHOTS || '.';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(ok ? 'OK    ' : 'FEHLER', n, info); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise(r => srv.stdout.once('data', r));
  const b = await chromium.launch({ channel: 'chrome' });
  const mk = async url => { const c = await b.newContext({ viewport: { width: 1100, height: 640 } }); const p = await c.newPage(); p.on('pageerror', e => check('Seitenfehler: ' + e.message, false)); await p.goto(url); return p; };
  const url = `http://localhost:${PORT}/`;
  try {
    const A = await mk(url), B = await mk(url);
    await A.click('#btnCreate');
    await A.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('lobCode').textContent));
    await B.fill('#inCode', await A.textContent('#lobCode')); await B.click('#btnJoin');
    await B.waitForSelector('#scrLobby.on');
    await A.selectOption('#lobLevel', String(Sim.RUN.LVL));
    await B.waitForFunction(l => PF.Net.level === l, Sim.RUN.LVL);
    await A.click('#btnReady'); await B.click('#btnReady');
    await Promise.all([A, B].map(p => p.waitForFunction(() => PF.G.s && PF.G.s.run === 1)));
    check('Endlos-Lauf startet online auf beiden Clients', true);
    const seed = await Promise.all([A, B].map(p => p.evaluate(() => PF.G.s.seed)));
    check('Beide haben denselben Lauf', seed[0] === seed[1], seed[0]);

    /* Kuss: Figuren stehen 70 px auseinander, nah genug */
    await sleep(300);
    const charA = await A.evaluate(() => PF.G.me);
    await A.keyboard.down(charA === 0 ? 'd' : 'a');
    await A.waitForFunction(() => Math.abs(PF.G.s.p[0].x - PF.G.s.p[1].x) < 60, null, { timeout: 2000 }).catch(() => {});
    await A.keyboard.up(charA === 0 ? 'd' : 'a');
    await sleep(350);
    await A.keyboard.press('q');
    await Promise.all([A, B].map(p => p.waitForFunction(() => PF.G.auth && PF.G.auth.kiss > 0, null, { timeout: 1500 })));
    check('Q startet den Kuss auf beiden Clients', true);
    const x0 = await B.evaluate(() => PF.G.auth.p.map(q => Math.round(q.x)));
    await A.keyboard.down('d'); await B.keyboard.down('a');
    await sleep(600);
    await A.screenshot({ path: path.join(SHOTS, 'kiss.png') });
    const x1 = await B.evaluate(() => PF.G.auth.p.map(q => Math.round(q.x)));
    check('Während des Kusses bewegt sich keine Figur', x0.join() === x1.join(), x0.join() + ' / ' + x1.join());
    await A.keyboard.up('d'); await B.keyboard.up('a');

    /* Laufen bis zum Raben */
    await sleep(1200);
    await A.screenshot({ path: path.join(SHOTS, 'run_a.png') });
    const shot = await Promise.all([A, B].map(p => p.evaluate(() => [document.getElementById('hudLevel').textContent, document.getElementById('hudStars').textContent, document.getElementById('hudCp').textContent].join(' | '))));
    check('Anzeige zeigt Strecke und Rabenabstand', /Punkte: \d+/.test(shot[0]) && /Rabe: \d+ m/.test(shot[0]), shot[0]);
    await Promise.all([A, B].map(p => p.waitForSelector('#scrOver.on', { timeout: 30000 })));
    check('Rabe trifft: Game over auf beiden Clients', true, await A.textContent('#overS'));
    await sleep(300);
    await A.screenshot({ path: path.join(SHOTS, 'run_over.png') });
    await A.click('#btnOverAgain');
    await Promise.all([A, B].map(p => p.waitForFunction(() => PF.G.s && PF.G.s.phase === 'play' && document.getElementById('hud').classList.contains('on') && !document.getElementById('scrOver').classList.contains('on'), null, { timeout: 6000 })));
    const seed2 = await A.evaluate(() => PF.G.s.seed);
    check('Nochmal laufen startet einen neuen Lauf für beide', seed2 !== seed[0]);

    /* Bots spielen online über mehrere Abschnitte, das Lauf-Fenster rückt dabei weiter */
    const charB = 1 - charA, r = { s: null, w: null };
    let bits = [0, 0];
    const sync = async () => {
      const step = (p, i, v) => p.evaluate(([i, v]) => { PF.setInput(i, v); return JSON.stringify(PF.G.s); }, [i, v]);
      const [ja, jb] = await Promise.all([step(A, charA, bits[charA]), step(B, charB, bits[charB])]);
      const sa = JSON.parse(ja), sb = JSON.parse(jb);
      if (sa.base === sb.base) sa.p[charB] = sb.p[charB];
      r.s = sa; r.w = Sim.worldOf(sa);
    };
    let c = 1, next = Date.now(), shot2 = false;
    for (let round = 0; round < 6; round++) {
    await sync();
    c = 1; next = Date.now();
    try {
    outer: for (; c <= 12; c++) {
      for (const v of solve(r, c)) {
        bits = dodge(r, v); next += 1000 / 60;
        if (!shot2 && r.s.raven.st === 'aim' && r.s.raven.t < 40) { shot2 = true; A.screenshot({ path: path.join(SHOTS, 'run_aim.png') }).catch(() => {}); }
        const w = next - Date.now(); if (w > 1) await sleep(w - .5); else if (w < -200) next = Date.now();
        await sync();
        if (r.s.phase === 'over') { console.log('over bei', c, r.s.tick, JSON.stringify(r.s.raven), r.s.p.map(q => [q.x | 0, q.y | 0, q.bits])); break outer; }
      }
    }
    } catch (x) { console.log('   Bot blieb hängen:', x.message.slice(0, 80)); }
    bits = [0, 0]; await sync();
    if (r.s.base >= 2) break;
    if (r.s.phase === 'over') { await A.waitForSelector('#scrOver.on'); await A.click('#btnOverAgain'); await A.waitForFunction(() => PF.G.s && PF.G.s.phase === 'play' && !document.getElementById('scrOver').classList.contains('on')); await sleep(400); }
    }
    await sleep(200);
    const st = await Promise.all([A, B].map(p => p.evaluate(() => ({ base: PF.G.auth.base, ok: PF.G.s.boxes.length === PF.G.w.boxes.length && PF.G.s.movers.length === PF.G.w.movers.length }))));
    check('Lauf rückt online über mehrere Abschnitte weiter, Listen passen', st[0].base >= 2 && st[0].base === st[1].base && st[0].ok && st[1].ok, `Abschnitt ${c}, ${JSON.stringify(st)}`);
    await A.context().close(); await B.context().close();

    /* Lokal */
    const L = await mk('file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/'));
    await L.click('#btnLocal');
    await L.selectOption('#locLevel', String(Sim.RUN.LVL));
    await L.click('#btnLocalGo');
    await L.waitForFunction(() => PF.G.s && PF.G.s.run === 1);
    check('Endlos-Lauf startet lokal ohne Server', true);
    await L.keyboard.down('d'); await sleep(350); await L.keyboard.up('d'); await sleep(300);
    await L.evaluate(() => { const s = PF.G.s; s.p[1].x = s.p[0].x + 50; });
    await sleep(250);
    await L.screenshot({ path: path.join(SHOTS, 'run_local.png') });
    await L.keyboard.press('q');
    await sleep(150);
    check('Q küsst lokal', await L.evaluate(() => PF.G.s.kiss > 0));
    await L.waitForSelector('#scrOver.on', { timeout: 30000 });
    check('Lokales Game over erscheint', true, await L.textContent('#overS'));
    await L.click('#btnOverAgain');
    await sleep(300);
    check('Lokal neu starten', await L.evaluate(() => PF.G.s.phase === 'play' && PF.G.s.run === 1));
  } catch (e) { check('Testlauf', false, e.message); }
  await b.close(); srv.kill();
  const bad = results.filter(x => !x).length;
  console.log(`Ergebnis: ${results.length - bad} ok, ${bad} Fehler`);
  process.exit(bad ? 1 : 0);
})();
