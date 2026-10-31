// Misst die Zeichenzeit pro Bild (ms) in Chrome bei Full-HD und doppelter Pixeldichte.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const c = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await c.newPage();
  await p.goto('file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/'));
  const measure = (setup, label) => p.evaluate(([setup, label]) => {
    new Function(setup)();
    const G = PF.G, canvas = document.getElementById('game');
    G.paused = true;
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) { PF.render(canvas.width, canvas.height, .5); canvas.getContext('2d').getImageData(0, 0, 1, 1); }
    return label + ': ' + ((performance.now() - t0) / 40).toFixed(2) + ' ms pro Bild';
  }, [setup, label]);
  await p.waitForFunction(() => window.PF);
  const s = await Promise.resolve();
  console.log(await measure("PF.startLocal(1);", 'Level 1'));
  console.log(await measure("PF.startLocal(5); const g=PF.G.s; g.raven.st='off'; g.raven.x=g.p[0].x+2000;", 'Lauf, Rabe fern'));
  console.log(await measure("PF.startLocal(5); const g=PF.G.s; g.raven.st='aim'; g.raven.t=40; g.raven.x=g.p[0].x-100; g.raven.lx=g.p[0].x; g.raven.ly=600;", 'Lauf, Rabe nah (rote Warnung)'));
  await b.close();
})();
