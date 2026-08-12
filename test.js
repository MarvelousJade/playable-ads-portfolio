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
  const captureAll = !process.env.CI; // full visual refresh locally; failures only in CI
  if (!fs.existsSync(shots)) fs.mkdirSync(shots);

  let failures = 0;
  const results = [];

  async function run(name, urlPath, drive, opts = {}) {
    if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER)) return;
    // CI adds an explicit test flag so particle-heavy framework demos can lower
    // visual load under SwiftShader without changing production behavior.
    const runPath = process.env.CI ? urlPath + (urlPath.includes('?') ? '&' : '?') + 'test=1' : urlPath;
    const ctx = await browser.newContext({
      viewport: opts.viewport || { width: 720, height: 1280 },
      deviceScaleFactor: 1,
      hasTouch: !!opts.hasTouch,
      isMobile: !!opts.hasTouch
    });
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
      if (u !== base + runPath && !u.startsWith('data:') && !u.includes('favicon')) extraRequests.push(u);
    });
    // wait until the game logs a given analytics event (robust vs cold-start slowness)
    const waitLog = async (needle, ms = 15000, minimum = 1) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (logs.filter(l => l.includes(needle)).length >= minimum) return;
        await sleep(150);
      }
      throw new Error(`timeout waiting for "${needle}" (${minimum} occurrence${minimum === 1 ? '' : 's'})`);
    };
    try {
      await page.goto(base + runPath, { waitUntil: 'load' });
      // Cold software-rendered CI runners can need several seconds to parse an
      // embedded engine. Never send the first interaction before the game says
      // it is ready.
      if (opts.expectEndcard) await waitLog('game_loaded', 30000);
      else await sleep(500);
      await sleep(350);
      if (captureAll) await page.screenshot({ path: path.join(shots, name + '.png') });
      await drive(page, waitLog);
      if (captureAll) await page.screenshot({ path: path.join(shots, name + '-end.png') });
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
    if (!ok) {
      failures++;
      if (!captureAll) {
        try { await page.screenshot({ path: path.join(shots, name + '-end.png') }); }
        catch (_) { /* the page may already have closed after a fatal error */ }
      }
    }
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
  const swipeWord = async (page, word, touch = false) => {
    const points = await page.locator('.letter').evaluateAll((buttons, wanted) => wanted.split('').map(letter => {
      const button = buttons.find(b => b.textContent.trim() === letter);
      if (!button) throw new Error('missing wheel letter ' + letter);
      const r = button.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }), word);
    if (touch) {
      await page.evaluate(({ points }) => {
        const event = (type, point) => new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
          clientX: point.x, clientY: point.y, buttons: type === 'pointerup' ? 0 : 1
        });
        document.elementFromPoint(points[0].x, points[0].y).dispatchEvent(event('pointerdown', points[0]));
        points.slice(1).forEach(point => window.dispatchEvent(event('pointermove', point)));
        window.dispatchEvent(event('pointerup', points[points.length - 1]));
      }, { points });
    } else {
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 4 });
      await page.mouse.up();
    }
    await sleep(750);
  };

  const driveWord = async (page, waitLog) => {
    await page.locator('#hint').click();
    if (!((await page.locator('#candidate').textContent()) || '').includes('START WITH P')) throw new Error('first hint did not show P');
    await page.locator('#hint').click();
    if (!((await page.locator('#candidate').textContent()) || '').includes('NEXT: L')) throw new Error('second hint did not advance to L');
    await swipeWord(page, 'PLAN');
    // Exercise the short-screen composition before rotating the same session.
    await page.setViewportSize({ width: 320, height: 480 });
    await sleep(250);
    const clipped = await page.evaluate(() => [document.querySelector('.board'), document.querySelector('.wheel'), ...document.querySelectorAll('.letter')].some(el => {
      const r = el.getBoundingClientRect();
      return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
    }));
    if (clipped) throw new Error('short-screen composition clipped an interaction surface');
    // Prove an orientation change does not reset the completed word or funnel.
    await page.setViewportSize({ width: 1280, height: 720 });
    await sleep(350);
    await swipeWord(page, 'ANT');
    await swipeWord(page, 'PLANT');
    await waitLog('endcard_shown');
    await sleep(500);
  };
  const driveWordBTouch = async (page, waitLog) => {
    await swipeWord(page, 'TONE', true);
    await swipeWord(page, 'ONE', true);
    await swipeWord(page, 'STONE', true);
    await waitLog('endcard_shown');
    await sleep(500);
  };

  // Software-rendered CI can occasionally drop the first pointer transition on
  // a newly-created Phaser canvas. Confirm the analytics event and retry the
  // gesture instead of waiting for a funnel event that can never arrive.
  const pressSlotSpin = async (page, waitLog, spinNumber) => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      await tap(page, 360, 1130);
      try {
        await waitLog('[playable] spin', 3500, spinNumber);
        return;
      } catch (error) { lastError = error; }
    }
    throw lastError;
  };
  const driveSlots = async (page, waitLog) => {
    await pressSlotSpin(page, waitLog, 1);             // spin 1 → teaser win
    await waitLog('bonus_offered', 30000); await sleep(500);
    await tap(page, 360, 655);                         // pick middle chest
    await waitLog('bonus_pick'); await sleep(1600);    // bonus paid, spin re-enabled
    await pressSlotSpin(page, waitLog, 2);             // spin 2 → jackpot
    await waitLog('endcard_shown', 30000); await sleep(900);
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
  await run('word', '/word/', driveWord, funnel);
  await run('slots', '/slots/', driveSlots, funnel);
  await run('wheel', '/wheel/', driveWheel, funnel);
  await run('scratch', '/scratch/', driveScratch, funnel);

  // Every B variant is exercised; Word B uses touch PointerEvents in landscape.
  await run('word-vb', '/word/?v=b', driveWordBTouch, {
    expectEndcard: true, viewport: { width: 844, height: 390 }, hasTouch: true
  });
  await run('slots-vb', '/slots/?v=b', async (page, waitLog) => {
    await pressSlotSpin(page, waitLog, 1);             // spin 1: teaser win
    await waitLog('bonus_offered', 30000); await sleep(500);
    await tap(page, 360, 655);                         // pick middle chest
    await waitLog('bonus_pick'); await sleep(1600);
    await pressSlotSpin(page, waitLog, 2); await sleep(3800); // near-miss
    await pressSlotSpin(page, waitLog, 3);             // spin 3 → jackpot
    await waitLog('endcard_shown', 30000); await sleep(900);
  }, funnel);
  await run('wheel-vb', '/wheel/?v=b', async (page) => {
    await holdRelease(page, 360, 1140, 600); await sleep(7200);
  }, funnel);
  await run('scratch-vb', '/scratch/?v=b', driveScratch, funnel);

  // Single-file network builds — must run AND make zero external requests
  const dist = { singleFile: true, expectEndcard: true };
  await run('word-dist', '/dist/word.html', async (page, waitLog) => {
    await swipeWord(page, 'PLAN'); await swipeWord(page, 'ANT'); await swipeWord(page, 'PLANT');
    await waitLog('endcard_shown'); await sleep(500);
  }, dist);
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
