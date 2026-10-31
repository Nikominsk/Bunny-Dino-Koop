// Pfeilhagel mit zwei getrennten Chrome-Sitzungen über den echten Server, dazu lokal per file://.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const { Sim } = require('./lib');
const PORT = 3144, SHOTS = process.env.SHOTS || '.';
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
    await A.selectOption('#lobLevel', String(Sim.RUN.ARROW));
    await B.waitForFunction(l => PF.Net.level === l, Sim.RUN.ARROW);
    await A.click('#btnReady'); await B.click('#btnReady');
    await Promise.all([A, B].map(p => p.waitForFunction(() => PF.G.s && PF.G.s.run === 2)));
    check('Pfeilhagel startet online auf beiden Clients', true);
    const charA = await A.evaluate(() => PF.G.me), D = charA === 1 ? A : B, H = charA === 1 ? B : A;
    await sleep(500);

    /* Späherin: nur der Hase sieht die Warnung, ihre Markierung sieht der Dino */
    await H.evaluate(() => { PF.G.virtAim = null; });
    await Promise.all([A, B].map(p => p.waitForFunction(() => PF.G.auth.vol.st === 'warn', null, { timeout: 12000 })));
    await sleep(120);
    const txt = await Promise.all([H, D].map(p => p.textContent('#hudCp')));
    check('Nur der Hase sieht die Warnung', /Pfeile von/.test(txt[0]) && !/Pfeile von/.test(txt[1]), txt.join(' | '));
    const hs = await H.evaluate(() => PF.G.dinoScreen);
    await H.mouse.move(hs.x + 200, hs.y - 200);
    await sleep(60);
    await H.mouse.click(hs.x + 200, hs.y - 200);
    await D.waitForFunction(() => PF.G.auth.mark >= 0, null, { timeout: 2000 });
    const mark = await D.evaluate(() => PF.G.auth.mark);
    check('Mausklick des Hasen setzt die Markierung, Dino sieht sie', mark >= 54 && mark <= 58, mark);
    await D.screenshot({ path: path.join(SHOTS, 'arrow_mark.png') });
    await D.waitForFunction(() => PF.G.auth.mark === -1, null, { timeout: 5000 });
    check('Markierung verschwindet, sobald die Pfeile da sind', true);
    await H.mouse.click(hs.x + 200, hs.y - 100, { button: 'right' });
    await D.waitForFunction(() => PF.G.auth.car.length > 0, null, { timeout: 1500 });
    check('Rechtsklick wirft eine Möhre, beide sehen sie', true);
    await sleep(2500);

    /* Maus steuert das Schild, und der Partner sieht es */
    const box = await D.evaluate(() => { const s = PF.G.dinoScreen; return { x: s.x, y: s.y }; });
    await D.mouse.move(box.x - 200, box.y - 200); await sleep(250);
    const a1 = await H.evaluate(() => PF.G.auth.p[1].aim);
    await D.mouse.move(box.x + 200, box.y); await sleep(250);
    const a2 = await H.evaluate(() => PF.G.auth.p[1].aim);
    check('Maus nach links oben richtet das Schild dorthin', a1 >= 38 && a1 <= 42, a1);
    check('Maus nach rechts dreht es für beide sichtbar', a2 === 0 || a2 === 63 || a2 === 1, a2);

    /* Dino stellt sich vor den Hasen und blockt */
    for (let i = 0; i < 1400; i++) {
      const st = await D.evaluate(() => {
        const s = PF.G.s, v = s.vol, d = s.p[1], h = s.p[0], tx = h.x - v.side * 14;
        PF.G.virtAim = Math.round((Math.atan2(-Math.sin(v.ang), -v.side * Math.cos(v.ang)) + Math.PI * 2) / (Math.PI * 2) * 64) & 63;
        PF.setInput(1, Math.abs(d.x - tx) > 6 ? (d.x < tx ? 2 : 1) : 0);
        return { blocked: PF.G.auth.blocked, phase: s.phase };
      });
      if (st.blocked >= 3 || st.phase !== 'play') break;
      await sleep(16);
    }
    await D.screenshot({ path: path.join(SHOTS, 'arrow_block.png') });
    const bl = await Promise.all([A, B].map(p => p.evaluate(() => PF.G.auth.blocked)));
    check('Schild blockt Pfeile, Stand ist auf beiden Clients gleich', bl[0] >= 1 && Math.abs(bl[0] - bl[1]) <= 1, bl.join(' / '));

    /* Fuchs erscheint online; echter Mausklick schlägt zu */
    await D.evaluate(() => { PF.setInput(1, 0); });
    await Promise.all([A, B].map(p => p.waitForFunction(() => PF.G.auth.fox, null, { timeout: 40000 })));
    check('Fuchs erscheint auf beiden Clients', true);
    let foxHp = 3;
    for (let i = 0; i < 1500 && foxHp === 3; i++) {
      const st = await D.evaluate(() => {
        const s = PF.G.s, f = s.fox, d = s.p[1];
        if (!f) return { hp: 0 };
        PF.G.virtAim = Math.round((Math.atan2(f.y + 17 - (d.y + 28), f.x + 23 - (d.x + 18)) + Math.PI * 2) / (Math.PI * 2) * 64) & 63;
        PF.setInput(1, Math.abs(f.x - d.x) > 70 ? (f.x > d.x ? 2 : 1) : 0);
        return { hp: PF.G.auth.fox ? PF.G.auth.fox.hp : 0, near: Math.hypot(f.x - d.x, f.y - d.y) < 95 };
      });
      foxHp = st.hp;
      if (st.near) await D.mouse.click(500, 300);
      await sleep(16);
    }
    await sleep(150);
    const fh = await Promise.all([A, B].map(p => p.evaluate(() => (PF.G.auth.fox ? PF.G.auth.fox.hp : 0))));
    check('Mausklick trifft den Fuchs, Stand auf beiden Clients gleich', fh[0] < 3 && fh[0] === fh[1], fh.join(' / '));
    await D.screenshot({ path: path.join(SHOTS, 'arrow_fox.png') });

    /* Dino geht weg: der Hase wird getroffen */
    await D.evaluate(() => { PF.setInput(1, 2); });
    await Promise.all([A, B].map(p => p.waitForSelector('#scrOver.on', { timeout: 60000 })));
    check('Treffer führen zum Game over auf beiden Clients', true, (await A.textContent('#overT')) + ' / ' + (await A.textContent('#overS')));
    await sleep(300);
    await H.screenshot({ path: path.join(SHOTS, 'arrow_over.png') });
    const seed = await A.evaluate(() => PF.G.s.seed);
    await A.click('#btnOverAgain');
    await Promise.all([A, B].map(p => p.waitForFunction(s => PF.G.s && PF.G.s.run === 2 && PF.G.s.phase === 'play' && PF.G.s.seed !== s, seed, { timeout: 6000 })));
    check('Nochmal startet einen neuen Lauf im selben Modus', true);
    await A.context().close(); await B.context().close();

    /* Lokal */
    const L = await mk('file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/'));
    await L.click('#btnLocal');
    await L.selectOption('#locLevel', String(Sim.RUN.ARROW));
    await L.click('#btnLocalGo');
    await L.waitForFunction(() => PF.G.s && PF.G.s.run === 2 && PF.G.dinoScreen);
    const d = await L.evaluate(() => PF.G.dinoScreen);
    await L.mouse.move(d.x, d.y - 200); await sleep(200);
    const al = await L.evaluate(() => PF.G.s.p[1].aim);
    check('Lokal folgt das Schild ebenfalls der Maus', al >= 46 && al <= 50, al);
    await L.evaluate(() => { PF.G.s.hp[0] = 10; PF.G.virtAim = 16; });
    await L.waitForSelector('#scrOver.on', { timeout: 60000 });
    check('Lokales Game over erscheint', true, await L.textContent('#overD'));
    await L.click('#btnOverAgain');
    await sleep(300);
    check('Lokal neu starten', await L.evaluate(() => PF.G.s.phase === 'play' && PF.G.s.run === 2));
  } catch (e) { check('Testlauf', false, e.message); }
  await b.close(); srv.kill();
  const bad = results.filter(x => !x).length;
  console.log(`Ergebnis: ${results.length - bad} ok, ${bad} Fehler`);
  process.exit(bad ? 1 : 0);
})();
