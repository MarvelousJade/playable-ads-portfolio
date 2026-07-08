/*
 * Headless smoke test: loads each playable, drives its core interaction,
 * fails on any console/page error, and saves screenshots so the rendered
 * output can be eyeballed. Includes a tiny static server (vendored libs +
 * relative paths need real http, not file://).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serve() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Move before clicking — input frameworks re-run hit-testing on pointer move,
// just like a real finger/mouse lands fresh on each tap.
const tap = async (page, x, y) => { await page.mouse.move(x, y - 50); await page.mouse.move(x, y); await page.mouse.click(x, y); };

async function main() {
  const server = serve();
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  console.log('server on', base);

  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist',
      '--enable-webgl', '--autoplay-policy=no-user-gesture-required']
  });
  const shots = path.join(ROOT, 'thumbnails');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots);

  let failures = 0;
  const results = [];

  async function run(name, urlPath, drive, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);   // fail fast instead of hanging
    const errors = [];
    const extraRequests = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('request', r => {
      const u = r.url();
      if (u !== base + urlPath && !u.startsWith('data:') && !u.includes('favicon')) extraRequests.push(u);
    });
    try {
      await page.goto(base + urlPath, { waitUntil: 'load' });
      await sleep(1600);
      await page.screenshot({ path: path.join(shots, name + '.png') });   // identity shot → landing thumb
      await drive(page);
      await page.screenshot({ path: path.join(shots, name + '-end.png') });
    } catch (e) {
      errors.push('THROW: ' + e.message);
    }
    // network-spec check: a single-file build must make zero extra requests
    if (opts.singleFile && extraRequests.length) {
      errors.push('NOT SELF-CONTAINED, requested: ' + extraRequests.join(', '));
    }
    const ok = errors.length === 0;
    if (!ok) failures++;
    results.push({ name, ok, errors });
    console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${name}`);
    errors.forEach(e => console.log('   · ' + e));
    await ctx.close();
  }

  const driveSlots = async (page) => {
    await tap(page, 360, 1130); await sleep(3000);   // spin 1
    await tap(page, 360, 1130); await sleep(4600);   // spin 2 → jackpot → end card
  };
  const driveWheel = async (page) => {
    await tap(page, 360, 1140); await sleep(5200);   // spin 1
    await tap(page, 360, 1140); await sleep(7400);   // spin 2 → jackpot → end card
  };
  const driveScratch = async (page) => {
    for (let y = 440; y <= 950; y += 55) {
      await page.mouse.move(120, y); await page.mouse.down();
      for (let x = 120; x <= 600; x += 18) await page.mouse.move(x, y);
      await page.mouse.up();
    }
    await sleep(2600);
  };

  // Source demos
  await run('slots', '/slots/', driveSlots);
  await run('wheel', '/wheel/', driveWheel);
  await run('scratch', '/scratch/', driveScratch);

  // A/B variant B (slots: 3-spin funnel with a near-miss)
  await run('slots-vb', '/slots/?v=b', async (page) => {
    await tap(page, 360, 1130); await sleep(3000);   // spin 1: teaser win
    await tap(page, 360, 1130); await sleep(3000);   // spin 2: near-miss
    await tap(page, 360, 1130); await sleep(4600);   // spin 3 → jackpot → end card
  });

  // Single-file network builds — must run AND make zero external requests
  await run('slots-dist', '/dist/slots.html', driveSlots, { singleFile: true });
  await run('wheel-dist', '/dist/wheel.html', driveWheel, { singleFile: true });
  await run('scratch-dist', '/dist/scratch.html', driveScratch, { singleFile: true });

  // Landing page
  await run('landing', '/', async () => {});

  await browser.close();
  server.close();

  console.log('\n========================');
  console.log(failures === 0 ? 'ALL PASSED ✓' : failures + ' demo(s) FAILED ✗');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
