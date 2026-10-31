// Rabenlabyrinth mit zwei getrennten Chrome-Sitzungen über den echten Server, dazu lokal per file://.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const { Sim } = require('./lib');
const PORT = 3155, SHOTS = process.env.SHOTS || '.';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(ok ? 'OK    ' : 'FEHLER', n, info); };
/* läuft im Browser: geht den kürzesten Weg zum Ausgang und schaut in Laufrichtung */
const botCode = i => `(() => {
  if (window.__bot) clearInterval(window.__bot);
  window.__bot = setInterval(() => {
    const G = PF.G, S = PF.Sim, s = G.s;
    if (!s || !s.mz) return;
    const m = S.mazeOf(s.seed), p = s.p[${i}], d = S.mazeDist(m, m.W - 1, m.ey, false), cx = Math.floor(p.x), cy = Math.floor(p.y);
    let bx = cx, by = cy, bd = d[m.at(cx, cy)];
    for (const [x, y] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) if (m.open(x, y) && d[m.at(x, y)] >= 0 && d[m.at(x, y)] < bd) { bd = d[m.at(x, y)]; bx = x; by = y; }
    G.look[${i}] = Math.atan2(by + .5 - p.y, bx + .5 - p.x);
    PF.setInput(${i}, 4);
  }, 16);
})()`;

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
    await A.selectOption('#lobLevel', String(Sim.RUN.MAZE));
    await B.waitForFunction(l => PF.Net.level === l, Sim.RUN.MAZE);
    await A.click('#btnReady'); await B.click('#btnReady');
    await Promise.all([A, B].map(p => p.waitForFunction(() => PF.G.s && PF.G.s.mz)));
    check('Labyrinth startet online auf beiden Clients', true);
    const seeds = await Promise.all([A, B].map(p => p.evaluate(() => PF.G.s.seed)));
    check('Beide haben dasselbe Labyrinth', seeds[0] === seeds[1], seeds[0]);
    await sleep(400);
    const me = await A.evaluate(() => PF.G.me), other = 1 - me;
    const x0 = await B.evaluate(i => PF.G.auth.p[i].x, me);
    await A.keyboard.down('w'); await sleep(500); await A.keyboard.up('w'); await sleep(200);
    const x1 = await B.evaluate(i => PF.G.auth.p[i].x, me);
    check('W bewegt die Figur auch bei B', x1 > x0 + .3, `${x0.toFixed(2)} -> ${x1.toFixed(2)}`);
    await A.screenshot({ path: path.join(SHOTS, 'maze_online.png') });

    let won = false, over = 0, rounds = 0;
    for (; rounds < 8 && !won; rounds++) {
      await A.evaluate(botCode(me)); await B.evaluate(botCode(other));
      await Promise.all([A, B].map(p => p.waitForSelector('#scrOver.on', { timeout: 60000 })));
      const t = await Promise.all([A, B].map(p => p.textContent('#overT')));
      if (t[0] !== t[1]) check('Ergebnis auf beiden gleich', false, t.join(' / '));
      won = /entkommen/.test(t[0]);
      if (!won) over++;
      console.log('   Runde', rounds + 1, t[0], await A.textContent('#overS'));
      await A.screenshot({ path: path.join(SHOTS, won ? 'maze_won.png' : 'maze_over.png') });
      if (!won) {
        const seed = await A.evaluate(() => PF.G.s.seed);
        await A.click('#btnOverAgain');
        await Promise.all([A, B].map(p => p.waitForFunction(s => PF.G.s && PF.G.s.mz && PF.G.s.phase === 'play' && PF.G.s.seed !== s, seed, { timeout: 6000 })));
      }
    }
    check('Beide erreichen online den Ausgang: gewonnen', won, `${rounds} Runden, ${over}× erwischt`);
    await A.context().close(); await B.context().close();

    const L = await mk('file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/'));
    await L.click('#btnLocal');
    await L.selectOption('#locLevel', String(Sim.RUN.MAZE));
    await L.click('#btnLocalGo');
    await L.waitForFunction(() => PF.G.s && PF.G.s.mz);
    await sleep(300);
    const a0 = await L.evaluate(() => PF.G.s.p.map(p => [p.x, p.y, p.a]));
    await L.keyboard.down('w'); await L.keyboard.down('ArrowUp'); await sleep(400); await L.keyboard.up('w'); await L.keyboard.up('ArrowUp');
    await L.keyboard.down('d'); await sleep(300); await L.keyboard.up('d');
    const a1 = await L.evaluate(() => PF.G.s.p.map(p => [p.x, p.y, p.a]));
    check('Lokal laufen beide gleichzeitig', a1[0][0] > a0[0][0] + .2 && a1[1][0] > a0[1][0] + .2);
    check('D dreht nur den Blick des Hasen', a1[0][2] !== a0[0][2] && a1[1][2] === a0[1][2]);
    await L.screenshot({ path: path.join(SHOTS, 'maze_local.png') });
  } catch (e) { check('Testlauf', false, e.message); }
  await b.close(); srv.kill();
  const bad = results.filter(x => !x).length;
  console.log(`Ergebnis: ${results.length - bad} ok, ${bad} Fehler`);
  process.exit(bad ? 1 : 0);
})();
