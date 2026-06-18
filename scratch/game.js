/*
 * Lucky Scratch — vanilla Canvas playable ad (no framework).
 *
 * The player scratches a foil panel to reveal a 3x3 prize grid. The grid is
 * scripted to contain three matching diamonds, so the scratch always lands a
 * jackpot, which triggers the install end-card. Written in plain Canvas 2D to
 * show how small/fast a playable can be when every byte counts.
 */
(function () {
  'use strict';

  var W = 720, H = 1280;
  var stage = document.getElementById('stage');
  var ctx = stage.getContext('2d');

  var CARD = { x: 80, y: 392, w: 560, h: 600 };
  var GRID = ['🍒', '💎', '🔔', '⭐', '🍒', '💎', '🎰', '🍋', '💎'];   // three 💎 = win
  var WIN_SYMBOL = '💎', WIN_AMOUNT = 25000;
  var WIN_CELLS = [];                                  // filled during build
  GRID.forEach(function (s, i) { if (s === WIN_SYMBOL) WIN_CELLS.push(i); });

  var balance = 1000;
  var state = 'scratch';          // scratch | revealing | win | endcard
  var foilAlpha = 1;
  var scratchPct = 0;
  var muted = false;
  var hitRegions = [];            // canvas-drawn buttons: {x,y,w,h,fn}
  var particles = [];
  var hintT = 0;

  // offscreen layers
  var prize = document.createElement('canvas'); prize.width = CARD.w; prize.height = CARD.h;
  var foil = document.createElement('canvas'); foil.width = CARD.w; foil.height = CARD.h;
  var bg = document.createElement('canvas'); bg.width = W; bg.height = H;

  // ── Drawing helpers ─────────────────────────────────────────────────────────
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function cellRect(i) {
    var cols = 3, size = 150, gap = 22;
    var gw = cols * size + (cols - 1) * gap;
    var ox = (CARD.w - gw) / 2;
    var oy = 120;                       // leave room for the header
    var col = i % 3, row = Math.floor(i / 3);
    return { x: ox + col * (size + gap), y: oy + row * (size + gap), s: size };
  }

  function buildPrize() {
    var c = prize.getContext('2d');
    // card face
    var g = c.createLinearGradient(0, 0, 0, CARD.h);
    g.addColorStop(0, '#fffef5'); g.addColorStop(1, '#ffe9c2');
    roundRect(c, 0, 0, CARD.w, CARD.h, 28); c.fillStyle = g; c.fill();
    roundRect(c, 0, 0, CARD.w, CARD.h, 28); c.lineWidth = 8; c.strokeStyle = '#caa23a'; c.stroke();

    c.fillStyle = '#7a1f25';
    c.font = '900 38px Arial Black, Arial';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('MATCH 3 TO WIN', CARD.w / 2, 50);
    c.font = '900 26px Arial';
    c.fillStyle = '#b07a12';
    c.fillText('★ scratch the panel below ★', CARD.w / 2, 88);

    // grid cells
    for (var i = 0; i < GRID.length; i++) {
      var r = cellRect(i);
      var cg = c.createLinearGradient(0, r.y, 0, r.y + r.s);
      cg.addColorStop(0, '#fbe6b0'); cg.addColorStop(1, '#f3d488');
      roundRect(c, r.x, r.y, r.s, r.s, 16); c.fillStyle = cg; c.fill();
      roundRect(c, r.x, r.y, r.s, r.s, 16); c.lineWidth = 3; c.strokeStyle = '#caa23a'; c.stroke();
      c.font = '92px "Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c.fillText(GRID[i], r.x + r.s / 2, r.y + r.s / 2 + 4);
    }
  }

  function buildFoil() {
    var c = foil.getContext('2d');
    var g = c.createLinearGradient(0, 0, CARD.w, CARD.h);
    g.addColorStop(0, '#c9ced6'); g.addColorStop(0.5, '#9aa1ad'); g.addColorStop(1, '#bcc3cd');
    roundRect(c, 0, 0, CARD.w, CARD.h, 28); c.fillStyle = g; c.fill();
    // diagonal sheen stripes
    c.save(); roundRect(c, 0, 0, CARD.w, CARD.h, 28); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 26;
    for (var x = -CARD.h; x < CARD.w; x += 70) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + CARD.h, CARD.h); c.stroke(); }
    c.restore();
    c.fillStyle = '#5d636e';
    c.font = '900 44px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('SCRATCH HERE', CARD.w / 2, CARD.h / 2 - 20);
    c.font = '64px "Segoe UI Emoji",sans-serif';
    c.fillText('👆', CARD.w / 2, CARD.h / 2 + 60);
  }

  function buildBg() {
    var c = bg.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c2a52'); g.addColorStop(1, '#0a0e1f');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (var i = 0; i < 26; i++) {
      c.beginPath();
      c.fillStyle = 'rgba(255,216,107,' + (0.04 + Math.random() * 0.12).toFixed(3) + ')';
      c.arc(Math.random() * W, Math.random() * H, 2 + Math.random() * 7, 0, 7); c.fill();
    }
  }

  // ── Coordinate mapping (canvas is CSS-scaled to fit) ────────────────────────
  function toCanvas(e) {
    var r = stage.getBoundingClientRect();
    var p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - r.left) / r.width * W, y: (p.clientY - r.top) / r.height * H };
  }

  // ── Scratch interaction ─────────────────────────────────────────────────────
  var scratching = false, last = null, sfxThrottle = 0;

  function scratchAt(x, y) {
    var fx = x - CARD.x, fy = y - CARD.y;
    if (fx < 0 || fy < 0 || fx > CARD.w || fy > CARD.h) return;
    var c = foil.getContext('2d');
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 64; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    if (last) { c.moveTo(last.x, last.y); c.lineTo(fx, fy); } else { c.moveTo(fx, fy); c.lineTo(fx + 0.1, fy + 0.1); }
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    last = { x: fx, y: fy };
    var now = performance.now();
    if (now - sfxThrottle > 60) { SFX.scratch(); sfxThrottle = now; }
  }

  function measureScratch() {
    var c = foil.getContext('2d');
    var step = 16, total = 0, clear = 0;
    var img = c.getImageData(0, 0, CARD.w, CARD.h).data;
    for (var y = 0; y < CARD.h; y += step) {
      for (var x = 0; x < CARD.w; x += step) {
        total++;
        if (img[(y * CARD.w + x) * 4 + 3] < 40) clear++;
      }
    }
    return clear / total;
  }

  function onDown(e) {
    e.preventDefault();
    SFX.unlock();
    var p = toCanvas(e);
    // button hit-test first
    for (var i = 0; i < hitRegions.length; i++) {
      var r = hitRegions[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { r.fn(); return; }
    }
    if (state === 'endcard') { PlayableAd.install(); return; }
    if (state === 'scratch') { scratching = true; last = null; scratchAt(p.x, p.y); }
  }
  function onMove(e) {
    if (!scratching || state !== 'scratch') return;
    e.preventDefault();
    var p = toCanvas(e);
    scratchAt(p.x, p.y);
  }
  function onUp() {
    scratching = false; last = null;
    if (state !== 'scratch') return;
    scratchPct = measureScratch();
    if (scratchPct > 0.5) reveal();
  }

  // ── Reveal → win → end card ─────────────────────────────────────────────────
  function reveal() {
    if (state !== 'scratch') return;
    state = 'revealing';
    PlayableAd.track('scratch_revealed');
    var t0 = performance.now();
    (function fade() {
      foilAlpha = Math.max(0, 1 - (performance.now() - t0) / 350);
      if (foilAlpha > 0) requestAnimationFrame(fade);
      else { foilAlpha = 0; win(); }
    })();
  }

  function win() {
    state = 'win';
    SFX.bigWin();
    burstCoins(60);
    addWinning(WIN_AMOUNT);
    setTimeout(function () { state = 'endcard'; PlayableAd.track('endcard_shown'); }, 1900);
  }

  function addWinning(amount) {
    var from = balance, to = balance + amount, t0 = performance.now();
    (function up() {
      var e = Math.min(1, (performance.now() - t0) / 1100);
      balance = Math.floor(from + (to - from) * (1 - Math.pow(1 - e, 3)));
      if (e < 1) requestAnimationFrame(up); else balance = to;
    })();
    for (var i = 0; i < 6; i++) SFX.coin(i * 0.08);
  }

  // ── Particles ───────────────────────────────────────────────────────────────
  function burstCoins(n) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: W / 2, y: CARD.y + CARD.h / 2,
        vx: (Math.random() - 0.5) * 16, vy: -8 - Math.random() * 12,
        r: 10 + Math.random() * 10, rot: Math.random() * 7, vr: (Math.random() - 0.5) * 0.3, life: 1
      });
    }
  }
  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += 0.6; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > H + 40) particles.splice(i, 1);
    }
  }
  function drawCoin(c, x, y, r, rot) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(Math.cos(rot) * 0.5 + 0.6, 1);
    var g = c.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffcc33'); g.addColorStop(1, '#c8860a');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    c.lineWidth = 2; c.strokeStyle = '#a86a06'; c.stroke();
    c.restore();
  }

  // ── HUD + buttons + end card ────────────────────────────────────────────────
  function drawButton(x, y, w, h, fill, label, sub) {
    roundRect(ctx, x, y - 12, w, h, 28); ctx.fillStyle = '#12702c'; ctx.fill();
    roundRect(ctx, x, y, w, h - 12, 28); ctx.fillStyle = fill; ctx.fill();
    roundRect(ctx, x, y, w, h, 28); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.floor(h * 0.4) + 'px Arial Black, Arial';
    ctx.fillText(label, x + w / 2, y + h / 2 - (sub ? 8 : 2));
    if (sub) { ctx.font = '400 20px Arial'; ctx.fillStyle = '#d6ffe0'; ctx.fillText(sub, x + w / 2, y + h - 22); }
  }

  function drawHUD() {
    drawCoin(ctx, 130, 96, 24, 0.2);
    ctx.fillStyle = '#ffe27a'; ctx.font = '900 44px Arial Black, Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(balance.toLocaleString(), 168, 96);
    ctx.textAlign = 'center';
    if (state !== 'endcard') {
      ctx.fillStyle = '#ffe27a'; ctx.font = '900 50px Arial Black, Arial';
      ctx.fillText('LUCKY SCRATCH', W / 2, 250);
    }
    // mute
    ctx.font = '38px "Segoe UI Emoji",sans-serif';
    ctx.fillText(muted ? '🔇' : '🔊', W - 60, 96);
  }

  function drawWinHighlight() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,210,60,' + (0.5 + 0.5 * Math.sin(performance.now() / 150)) + ')';
    ctx.lineWidth = 7;
    for (var k = 0; k < WIN_CELLS.length; k++) {
      var r = cellRect(WIN_CELLS[k]);
      roundRect(ctx, CARD.x + r.x - 4, CARD.y + r.y - 4, r.s + 8, r.s + 8, 18); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEndCard() {
    ctx.fillStyle = 'rgba(5,3,12,0.93)'; ctx.fillRect(0, 0, W, H);
    // solid panel so nothing bleeds through
    roundRect(ctx, 64, 300, W - 128, 760, 30);
    var pg = ctx.createLinearGradient(0, 300, 0, 1060);
    pg.addColorStop(0, '#1d1438'); pg.addColorStop(1, '#0d0a1c');
    ctx.fillStyle = pg; ctx.fill();
    roundRect(ctx, 64, 300, W - 128, 760, 30); ctx.lineWidth = 4; ctx.strokeStyle = '#caa23a'; ctx.stroke();

    ctx.fillStyle = '#ffe27a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 70px Arial Black, Arial';
    ctx.fillText('LUCKY SCRATCH', W / 2, 392);
    ctx.fillStyle = '#fff'; ctx.font = '400 34px Arial';
    ctx.fillText('You won ' + WIN_AMOUNT.toLocaleString() + ' coins!', W / 2, 470);
    ctx.font = '160px "Segoe UI Emoji",sans-serif';
    ctx.fillText('💎', W / 2, 678);
    drawButton(W / 2 - 220, 905, 440, 124, '#2bd659', 'PLAY NOW', 'FREE TO INSTALL');
  }

  // ── Main loop ───────────────────────────────────────────────────────────────
  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);

    ctx.drawImage(prize, CARD.x, CARD.y);
    if (foilAlpha > 0) { ctx.globalAlpha = foilAlpha; ctx.drawImage(foil, CARD.x, CARD.y); ctx.globalAlpha = 1; }

    if (state === 'win' || state === 'endcard') drawWinHighlight();

    updateParticles();
    for (var i = 0; i < particles.length; i++) drawCoin(ctx, particles[i].x, particles[i].y, particles[i].r, particles[i].rot);

    drawHUD();

    if (state === 'scratch') {
      hintT += 0.06;
      ctx.fillStyle = '#ffe27a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 30px Arial Black, Arial';
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(hintT);
      ctx.fillText('Scratch to reveal your prize!', W / 2, 1080);
      ctx.globalAlpha = 1;
    }

    hitRegions = [];
    if (state === 'endcard') {
      drawEndCard();
      hitRegions.push({ x: 0, y: 0, w: W, h: H, fn: function () { PlayableAd.install(); } });
    }
    // mute is always tappable
    hitRegions.push({ x: W - 92, y: 64, w: 64, h: 64, fn: function () { muted = SFX.toggleMuted(); } });

    requestAnimationFrame(frame);
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  function boot() {
    buildBg(); buildPrize(); buildFoil();
    fit(); window.addEventListener('resize', fit);

    stage.addEventListener('mousedown', onDown);
    stage.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    stage.addEventListener('touchstart', onDown, { passive: false });
    stage.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    document.getElementById('loader').classList.add('hide');
    PlayableAd.track('game_loaded');
    requestAnimationFrame(frame);
  }

  function fit() {
    var scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.width = (W * scale) + 'px';
    stage.style.height = (H * scale) + 'px';
    stage.style.left = ((window.innerWidth - W * scale) / 2) + 'px';
    stage.style.top = ((window.innerHeight - H * scale) / 2) + 'px';
  }

  PlayableAd.onReady(boot);
})();
