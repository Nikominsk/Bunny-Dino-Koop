// Misst online, wie gleichmäßig die eigene Figur und der Rabe pro Bild gezeichnet werden.
// Zählt Bilder, in denen die Figur beim Rechtslaufen stehen bleibt oder zurückspringt.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const { Sim } = require('./lib');
const PORT = 3133, sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise(r => srv.stdout.once('data', r));
  const b = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED });
  const mk = async () => { const c = await b.newContext({ viewport: { width: 960, height: 540 } }); const p = await c.newPage(); await p.goto(`http://localhost:${PORT}/`); return p; };
  const A = await mk(), B = await mk();
  await A.click('#btnCreate');
  await A.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('lobCode').textContent));
  await B.fill('#inCode', await A.textContent('#lobCode')); await B.click('#btnJoin');
  await B.waitForSelector('#scrLobby.on');
  const LV = process.env.LV ? +process.env.LV : Sim.RUN.LVL;
  await A.selectOption('#lobLevel', String(LV));
  await B.waitForFunction(l => PF.Net.level === l, LV);
  await A.click('#btnReady'); await B.click('#btnReady');
  await A.waitForFunction(() => PF.G.s && PF.G.auth);
  const res = await A.evaluate(() => new Promise(done => {
    const xs = [], rs = [], ts = [], os = [];
    PF.setInput(PF.G.me, 2);
    const f = t => { xs.push(PF.G.dbgX); rs.push(PF.G.dbgR || 0); ts.push(t); const o = PF.G.off.p[PF.G.me]; os.push(Math.hypot(o.x, o.y)); if (ts.length < 110 && PF.G.s.phase === 'play' && PF.G.s.p[PF.G.me].x < 1250) requestAnimationFrame(f); else done({ xs, rs, ts, os }); };
    requestAnimationFrame(f);
  }));
  const stat = a => {
    const d = a.slice(20).map((v, i, l) => (i ? v - l[i - 1] : 0)).slice(1);
    const m = d.reduce((x, y) => x + y, 0) / d.length, sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / d.length);
    return { bilder: d.length, schrittMittel: +m.toFixed(2), streuung: +sd.toFixed(2), rueckwaerts: d.filter(v => v < -0.01).length, stehend: d.filter(v => Math.abs(v) <= 0.01).length };
  };
  const dt = res.ts.slice(1).map((t, i) => t - res.ts[i]);
  console.log('Bildabstand ms: mittel', (dt.reduce((a, c) => a + c, 0) / dt.length).toFixed(1), 'max', Math.max(...dt).toFixed(1), 'groesste', dt.map((v, i) => [Math.round(v), i]).sort((p, q) => q[0] - p[0]).slice(0, 5).join(' '));
  console.log('Figur', JSON.stringify(stat(res.xs)));
  console.log('Korrektur px: mittel', (res.os.reduce((a, c) => a + c, 0) / res.os.length).toFixed(2), 'max', Math.max(...res.os).toFixed(2));
  console.log('Rabe ', JSON.stringify(stat(res.rs)));
  await b.close(); srv.kill();
})();
