// Nachbau des Deployments auf einem Rechner:
//   https://localhost:8080  statische Seite wie auf Vercel (aus scripts/vercel-build.js, kein WebSocket)
//   wss://localhost:8443    TLS-Endpunkt wie beim Hoster, mit künstlicher Latenz, leitet an server.js weiter
//   server.js               mit ALLOWED_ORIGINS
// Danach läuft tests/e2e.js gegen diese Adressen. Echte Hoster werden dabei NICHT benutzt.
const https = require('https');
const tls = require('tls');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const WebSocket = require('ws');

const ONE_WAY_MS = +(process.argv.find(a => a.startsWith('--latency=')) || '--latency=45').split('=')[1];
const JITTER_MS = 15;
const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-deploy-'));
const key = path.join(dir, 'k.pem'), crt = path.join(dir, 'c.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
const opts = { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };

execFileSync(process.execPath, ['scripts/vercel-build.js'], { cwd: ROOT, env: { ...process.env, PLUESCH_WS_URL: 'wss://localhost:8443' }, stdio: 'inherit' });
const page = fs.readFileSync(path.join(ROOT, 'public', 'index.html'));
const site = https.createServer(opts, (q, s) => { s.writeHead(q.url.split('?')[0] === '/' ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }); s.end(page); }).listen(8080);

/* Latenz in beide Richtungen, Reihenfolge bleibt erhalten */
const delayed = (from, to) => {
  let last = 0;
  from.on('data', d => { const at = Math.max(last, Date.now() + ONE_WAY_MS + Math.random() * JITTER_MS); last = at; setTimeout(() => { if (!to.destroyed) to.write(d); }, at - Date.now()); });
  from.on('close', () => setTimeout(() => to.destroy(), ONE_WAY_MS));
  from.on('error', () => {});
};
const proxy = tls.createServer(opts, c => { const u = net.connect(3200, '127.0.0.1'); c.setNoDelay(true); u.setNoDelay(true); delayed(c, u); delayed(u, c); }).listen(8443);

const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3200', ALLOWED_ORIGINS: 'https://localhost:8080' }, stdio: 'pipe' });
const stop = code => { srv.kill(); site.close(); proxy.close(); process.exit(code); };

srv.stdout.once('data', async () => {
  const tryOrigin = origin => new Promise(res => {
    const ws = new WebSocket('wss://localhost:8443/ws', { origin, rejectUnauthorized: false });
    ws.on('open', () => { ws.close(); res(true); }); ws.on('error', () => res(false));
  });
  const good = await tryOrigin('https://localhost:8080'), evil = await tryOrigin('https://boese.example');
  console.log(good ? 'OK    ' : 'FEHLER', 'erlaubte Origin verbindet über wss');
  console.log(!evil ? 'OK    ' : 'FEHLER', 'fremde Origin wird abgelehnt');
  const args = ['tests/e2e.js', '--site=https://localhost:8080/', '--no-server', '--insecure', '--levels=' + (process.env.LEVELS || '0')];
  if (process.env.SHOTS) args.push('--shots=' + process.env.SHOTS);
  const e = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  e.on('exit', c => stop(good && !evil ? c : 1));
});
