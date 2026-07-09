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
    const logs = [];
    page.on('console', m => {
      logs.push(m.text());
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('request', r => {
      const u = r.url();
      if (u !== base + urlPath && !u.startsWith('data:') && !u.includes('favicon')) extraRequests.push(u);
    });
    // wait until the game logs a given analytics event (robust vs cold-start slowness)
    const waitLog = async (needle, ms = 15000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (logs.some(l => l.includes(needle))) return;
        await sleep(150);
      }
      throw new Error(`timeout waiting for "${needle}"`);
    };
    try {
      await page.goto(base + urlPath, { waitUntil: 'load' });
      await sleep(1600);
      await page.screenshot({ path: path.join(shots, name + '.png') });   // identity shot → landing thumb
      await drive(page, waitLog);
      await page.screenshot({ path: path.join(shots, name + '-end.png') });
    } catch (e) {
      errors.push('THROW: ' + e.message);
    }
    // network-spec check: a single-file build must make zero extra requests
    if (opts.singleFile && extraRequests.length) {
      errors.push('NOT SELF-CONTAINED, requested: ' + extraRequests.join(', '));
    }
    // funnel check: the drive must actually reach the install end card —
    // a run that stalls mid-funnel is a failure even with a clean console
    if (opts.expectEndcard && !logs.some(l => l.includes('endcard_shown'))) {
      errors.push('FUNNEL INCOMPLETE: end card never shown');
    }
    const ok = errors.length === 0;
    if (!ok) failures++;
    results.push({ name, ok, errors });
    console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${name}`);
    errors.forEach(e => console.log('   · ' + e));
    await ctx.close();
  }

  // hold-to-charge press (wheel): press, let the power meter oscillate, release
  const holdRelease = async (page, x, y, ms) => {
    await page.mouse.move(x, y - 50); await page.mouse.move(x, y);
    await page.mouse.down(); await sleep(ms); await page.mouse.up();
  };
  const scratchPass = async (page) => {
    for (let y = 440; y <= 950; y += 55) {
      await page.mouse.move(120, y); await page.mouse.down();
      for (let x = 120; x <= 600; x += 18) await page.mouse.move(x, y);
      await page.mouse.up();
    }
  };

  const driveSlots = async (page, waitLog) => {
    await tap(page, 360, 1130);                       // spin 1 → teaser win
    await waitLog('bonus_offered'); await sleep(500); // chest overlay up
    await tap(page, 360, 655);                        // pick middle chest
    await waitLog('bonus_pick'); await sleep(1600);   // bonus paid, spin re-enabled
    await tap(page, 360, 1130);                       // spin 2 → jackpot
    await waitLog('endcard_shown'); await sleep(900); // end card faded in
  };
  const driveWheel = async (page) => {
    await holdRelease(page, 360, 1140, 600); await sleep(6000);   // charge+spin 1
    await holdRelease(page, 360, 1140, 600); await sleep(8200);   // charge+spin 2 → jackpot → end card
  };
  const driveScratch = async (page) => {
    await scratchPass(page); await sleep(4400);      // reveal → win → bonus card unlock
    await scratchPass(page); await sleep(2600);      // bonus reveal → win → end card
  };

  // Source demos
  const funnel = { expectEndcard: true };
  await run('slots', '/slots/', driveSlots, funnel);
  await run('wheel', '/wheel/', driveWheel, funnel);
  await run('scratch', '/scratch/', driveScratch, funnel);

  // A/B variant B (slots: 3-spin funnel with a near-miss)
  await run('slots-vb', '/slots/?v=b', async (page, waitLog) => {
    await tap(page, 360, 1130);                       // spin 1: teaser win
    await waitLog('bonus_offered'); await sleep(500);
    await tap(page, 360, 655);                        // pick middle chest
    await waitLog('bonus_pick'); await sleep(1600);
    await tap(page, 360, 1130); await sleep(3800);    // spin 2: near-miss
    await tap(page, 360, 1130);                       // spin 3 → jackpot
    await waitLog('endcard_shown'); await sleep(900);
  }, funnel);

  // Single-file network builds — must run AND make zero external requests
  const dist = { singleFile: true, expectEndcard: true };
  await run('slots-dist', '/dist/slots.html', driveSlots, dist);
  await run('wheel-dist', '/dist/wheel.html', driveWheel, dist);
  await run('scratch-dist', '/dist/scratch.html', driveScratch, dist);

  // Landing page
  await run('landing', '/', async () => {});

  await browser.close();
  server.close();

  console.log('\n========================');
  console.log(failures === 0 ? 'ALL PASSED ✓' : failures + ' demo(s) FAILED ✗');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
