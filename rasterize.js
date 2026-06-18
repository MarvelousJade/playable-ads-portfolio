/* Rasterize the downloaded Twemoji SVGs to high-res transparent PNGs.
   Loading plain PNGs at runtime is WebGL- and getImageData-safe and avoids
   any SVG-on-canvas quirks. Output: assets/<name>.png (512px). */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const dir = path.join(__dirname, 'assets');
  const svgDir = path.join(dir, 'svg');
  const names = fs.readdirSync(svgDir).filter(f => f.endsWith('.svg')).map(f => f.replace('.svg', ''));
  const SIZE = 256; // CSS px; deviceScaleFactor 2 → 512px PNG
  const b = await chromium.launch();
  for (const name of names) {
    const svg = fs.readFileSync(path.join(svgDir, name + '.svg'), 'utf8');
    const page = await b.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2 });
    await page.setContent(
      `<!doctype html><html><head><style>
       *{margin:0;padding:0} html,body{width:${SIZE}px;height:${SIZE}px;background:transparent}
       .w{width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center}
       .w svg{width:${Math.round(SIZE * 0.9)}px;height:${Math.round(SIZE * 0.9)}px;display:block}
       </style></head><body><div class="w">${svg}</div></body></html>`,
      { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(dir, name + '.png'), omitBackground: true });
    await page.close();
    console.log('rasterized', name);
  }
  await b.close();
})();
