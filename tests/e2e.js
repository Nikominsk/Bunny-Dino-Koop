// Ende-zu-Ende-Test mit zwei getrennten Browser-Sitzungen (Chrome) gegen einen echten Server.
// Aufruf: node tests/e2e.js [--levels=0,1,2,3,4] [--site=URL] [--no-server] [--shots=DIR] [--insecure]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const lib = require('./lib');
const plans = require('./walkthroughs');
const { Sim } = lib;

const arg = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n)); if (!a) return d; const v = a.split('=')[1]; return v === undefined ? true : v; };
const PORT = 3111;
const SITE = arg('site', `http://localhost:${PORT}/`);
const LEVELS = String(arg('levels', '0')).split(',').filter(x => x !== '').map(Number);
const SHOTS = arg('shots', null);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); log(ok ? 'OK    ' : 'FEHLER', name, info); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, ms = 8000, name = '') {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return true; await sleep(30); }
  throw new Error('Zeitüberschreitung: ' + name);
}

async function runLevels(A, B, charA, levels) {
  const read = page => page.evaluate(() => { const G = PF.G; return G.s ? JSON.stringify({ s: G.s, a: G.auth && { got: G.auth.got, cp: G.auth.cp, lvl: G.auth.lvl, phase: G.auth.phase, stars: G.auth.stars.map(x => x.g), gates: G.auth.gates.map(g => g.l) } }) : null; });
  const stepPage = (page, idx, bits) => page.evaluate(([i, b]) => { PF.setInput(i, b); const G = PF.G; return G.s ? JSON.stringify(G.s) : null; }, [idx, bits]);
  const r = { s: null, w: null, input: [0, 0] };
  let bits = [0, 0], tick = 0, retries = 0;
  const charB = 1 - charA;
  async function sync() {
    const [ja, jb] = await Promise.all([stepPage(A, charA, bits[charA]), stepPage(B, charB, bits[charB])]);
    if (!ja || !jb) return false;
    const sa = JSON.parse(ja), sb = JSON.parse(jb);
    sa.p[charB] = sb.p[charB];
    r.s = sa; r.w = Sim.world(sa.lvl);
    return true;
  }
  for (const lvl of levels) {
    await waitFor(async () => { await sync(); return r.s && r.s.lvl === lvl && r.s.phase === 'play'; }, 15000, 'Level ' + lvl);
    const t0 = Date.now();
    let sec = r.s.cp, guard = 0;
    while (r.s.phase === 'play' && guard++ < 12) {
      sec = r.s.cp;
      const gen = plans[lvl][Math.min(sec, plans[lvl].length - 1)](r)(r);
      let failed = false, next = Date.now();
      const iter = gen[Symbol.iterator]();
      try {
        for (;;) {
          const n = iter.next();
          if (n.done) break;
          bits = n.value; tick++;
          next += 1000 / 60;
          const wait = next - Date.now();
          if (wait > 1) await sleep(wait - 0.5); else if (wait < -200) next = Date.now();
          await sync();
          if (tick % 1200 === 0) log('  Speicher (MB):', await A.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6)), 'Tick', tick);
          if (r.s.phase === 'fall') throw new Error('Absturz');
          if (r.s.lvl !== lvl) break;
        }
      } catch (e) { failed = true; retries++; log(`  L${lvl} Abschnitt ${sec}: Wiederholung (${e.message.slice(0, 90)})`); }
      bits = [0, 0]; await sync();
      if (failed) {
        await A.evaluate(() => PF.Net.send({ t: 'reset' }));
        await sleep(1500); await sync();
      } else if (r.s.phase === 'play' && r.s.lvl === lvl && sec + 1 < plans[lvl].length) { await sleep(120); await sync(); }
      if (r.s.lvl !== lvl || r.s.phase === 'done' || r.s.phase === 'finale') break;
      if (!failed && sec >= plans[lvl].length - 1) break;
    }
    await waitFor(async () => { await sync(); return r.s.phase === 'done' || r.s.phase === 'finale' || r.s.lvl !== lvl; }, 20000, 'Abschluss L' + lvl);
    check(`Level ${lvl} online abgeschlossen`, true, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const [ja, jb] = await Promise.all([read(A), read(B)]);
    const a = JSON.parse(ja), b = JSON.parse(jb);
    check(`Level ${lvl}: Sternestand identisch`, a.a.got === b.a.got && a.a.got === Sim.world(lvl).starCount, `${a.a.got}/${b.a.got}`);
    if (SHOTS) await A.screenshot({ path: path.join(SHOTS, `e2e_L${lvl}_done.png`) });
    if (lvl + 1 < LEVELS.length + 100 && lvl + 1 < Sim.levelCount()) await waitFor(async () => { await sync(); return r.s.lvl === lvl + 1; }, 12000, 'Levelwechsel');
  }
  log(`Bot-Wiederholungen insgesamt: ${retries}, Ticks ${tick}`);
  return retries;
}

(async () => {
  let srv = null;
  if (!arg('no-server', false)) {
    srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
    await new Promise(r => srv.stdout.once('data', r));
  }
  const browser = await chromium.launch({ channel: 'chrome', args: arg('insecure', false) ? ['--ignore-certificate-errors'] : [] });
  const mk = async () => { const c = await browser.newContext({ viewport: { width: 1100, height: 640 }, ignoreHTTPSErrors: true }); const p = await c.newPage(); p.on('pageerror', e => { log('SEITENFEHLER', e.message); results.push({ name: 'keine Seitenfehler: ' + e.message, ok: false }); }); await p.goto(SITE); return p; };
  try {
    const A = await mk(), B = await mk();

    /* Raum erstellen / beitreten */
    await A.click('#btnCreate');
    await A.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('lobCode').textContent), null, { timeout: 12000 });
    const code = await A.textContent('#lobCode');
    check('Raum erstellt, Code erhalten', true, code);
    await B.fill('#inCode', 'ZZZZ'); await B.click('#btnJoin');
    await B.waitForFunction(() => document.getElementById('menuStatus').textContent.includes('gibt es nicht'));
    check('Falscher Code wird verständlich abgelehnt', true);
    await B.fill('#inCode', code.toLowerCase()); await B.click('#btnJoin');
    await B.waitForSelector('#scrLobby.on');
    check('Zweite Person tritt per Code bei', true);
    const C3 = await mk();
    await C3.fill('#inCode', code); await C3.click('#btnJoin');
    await C3.waitForFunction(() => document.getElementById('menuStatus').textContent.includes('voll'));
    check('Dritte Person wird abgewiesen (max. 2)', true);
    await C3.context().close();

    /* Figuren */
    const charA = await A.evaluate(() => PF.Net.players[PF.G.slot].c);
    await B.waitForFunction(() => PF.Net.players[PF.G.slot] && PF.Net.players[PF.G.slot].c !== null);
    let charB = await B.evaluate(() => PF.Net.players[PF.G.slot].c);
    check('Beide haben unterschiedliche Figuren', charA !== charB, `A=${charA} B=${charB}`);
    const taken = await B.$$eval('#lobPick .pickcard', (els, c) => els[c].disabled, charA);
    check('Vergebene Figur ist gesperrt', taken === true);
    /* Tausch: A wählt um geht nicht, B-Figur gesperrt; Startlevel für den Test wählen */
    if (LEVELS[0]) { await A.selectOption('#lobLevel', String(LEVELS[0])); await B.waitForFunction(l => PF.Net.level === l, LEVELS[0]); }
    await A.click('#btnReady');
    await A.waitForFunction(() => document.getElementById('lobStatus').textContent.includes('bereit'));
    if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'e2e_lobby.png') });
    await B.click('#btnReady');
    await Promise.all([A, B].map(p => p.waitForFunction(() => PF.G.s && document.getElementById('hud').classList.contains('on'))));
    check('Bestätigte Bereitschaft startet das Spiel auf beiden Clients', true);

    /* Echte Tastatur, Synchronisierung */
    await sleep(500);
    const x0 = await B.evaluate(c => PF.G.auth.p[c].x, charA);
    await A.keyboard.down('d'); await sleep(700); await A.keyboard.up('d'); await sleep(400);
    const x1 = await B.evaluate(c => PF.G.auth.p[c].x, charA);
    check('Tastendruck bei A bewegt Figur auch bei B', x1 > x0 + 60, `${x0 | 0} -> ${x1 | 0}`);
    await A.keyboard.press('Space'); await sleep(250);
    const yAir = await B.evaluate(c => PF.G.auth.p[c].g, charA);
    check('Sprung kommt bei B an', yAir === -1);
    await sleep(900);
    const same = await Promise.all([A, B].map(p => p.evaluate(() => JSON.stringify({ t: PF.G.s.p.map(q => [Math.round(q.x), Math.round(q.y)]), b: PF.G.s.boxes.map(q => Math.round(q.x)) }))));
    check('Ruhende Zustände auf beiden Clients gleich', same[0] === same[1], same[0]);

    /* Verbindungsabbruch einer Seite */
    await B.evaluate(() => PF.Net.ws.close());
    await A.waitForFunction(() => document.getElementById('scrLost').classList.contains('on') && document.getElementById('lostT').textContent.includes('Partner'), null, { timeout: 6000 });
    check('Abbruch bei B: A zeigt „Partner getrennt“ und pausiert', true);
    await B.waitForFunction(() => document.getElementById('scrLost').classList.contains('on') || PF.G.netPaused === false, null, { timeout: 4000 });
    if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'e2e_partner_lost.png') });
    await Promise.all([A, B].map(p => p.waitForFunction(() => !PF.G.netPaused && !document.getElementById('scrLost').classList.contains('on'), null, { timeout: 12000 })));
    check('Automatisches Wiederverbinden setzt für beide fort', true);
    /* Neuladen der Seite */
    await B.reload();
    await B.waitForFunction(() => window.PF && PF.G.mode === 'online' && PF.G.s, null, { timeout: 12000 });
    await Promise.all([A, B].map(p => p.waitForFunction(() => !PF.G.netPaused, null, { timeout: 12000 })));
    await sleep(600);
    const sameLvl = await Promise.all([A, B].map(p => p.evaluate(() => PF.G.auth.got + '/' + PF.G.auth.lvl)));
    check('Seite neu geladen: Spiel läuft mit gleichem Stand weiter', sameLvl[0] === sameLvl[1], sameLvl[0]);
    if (SHOTS) { await A.screenshot({ path: path.join(SHOTS, 'e2e_game_a.png') }); await B.screenshot({ path: path.join(SHOTS, 'e2e_game_b.png') }); }

    /* Vor dem Durchspielen in den Ausgangszustand: Reset */
    await A.evaluate(() => PF.Net.send({ t: 'reset' }));
    await sleep(1300);

    /* Alle gewünschten Level durchspielen */
    const retries = await runLevels(A, B, charA, LEVELS);
    check('Durchspielen abgeschlossen', true, `Wiederholungen: ${retries}`);

    if (LEVELS.includes(Sim.levelCount() - 1)) {
      await Promise.all([A, B].map(p => p.waitForSelector('#finale.on', { timeout: 15000 })));
      check('Abschluss „Zusammen geschafft!“ auf beiden Clients', true);
      await sleep(1500);
      if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'e2e_finale.png') });
      await A.click('#btnAgain');
      await Promise.all([A, B].map(p => p.waitForFunction(() => PF.G.s && PF.G.s.lvl === 0 && PF.G.s.phase === 'play', null, { timeout: 8000 })));
      check('Nochmal spielen startet das Tutorial für beide', true);
    }

    /* Server fällt aus */
    if (srv) {
      srv.kill(); srv = null;
      await Promise.all([A, B].map(p => p.waitForFunction(() => document.getElementById('scrLost').classList.contains('on') && document.getElementById('lostT').textContent.includes('Verbindung verloren'), null, { timeout: 12000 })));
      check('Serverausfall: beide sehen „Verbindung verloren“ mit Optionen', true);
      if (SHOTS) await B.screenshot({ path: path.join(SHOTS, 'e2e_server_lost.png') });
    }
  } catch (e) {
    check('Testlauf', false, e.message);
  }
  await browser.close();
  if (srv) srv.kill();
  const bad = results.filter(r => !r.ok).length;
  log(`Ergebnis: ${results.length - bad} ok, ${bad} Fehler`);
  process.exit(bad ? 1 : 0);
})();
