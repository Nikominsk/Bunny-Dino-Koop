// Vercel-Build: kopiert die index.html nach public/ und trägt die WebSocket-Adresse des Spielservers ein.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const url = (process.env.PLUESCH_WS_URL || '').trim();
if (url && !/^wss?:\/\//.test(url)) {
  console.error('PLUESCH_WS_URL muss mit wss:// (oder lokal ws://) beginnen.');
  process.exit(1);
}
if (!url) console.warn('Warnung: PLUESCH_WS_URL ist leer. Online-Räume funktionieren so nicht, lokaler Koop schon.');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const marker = '<meta name="pf-ws-url" content="">';
if (!html.includes(marker)) throw new Error('Platzhalter pf-ws-url fehlt in index.html');
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'index.html'), html.replace(marker, `<meta name="pf-ws-url" content="${url.replace(/"/g, '')}">`));
console.log('public/index.html erstellt, Spielserver:', url || '(keiner)');
