/*
 * Spin to Win — Pixi.js playable ad.
 *
 * A weighted prize wheel. Two scripted spins: the first lands a mid prize to
 * reward the tap, the second is a guaranteed JACKPOT that fires the install
 * end-card. Built on Pixi 7 to demonstrate a second engine. All art is drawn
 * procedurally (Canvas-generated textures + Pixi Graphics) — no image files.
 */
(function () {
  'use strict';

  var W = 720, H = 1280;
  var CX = 360, CY = 560, R = 300;          // wheel centre + radius

  // Wheel segments (clockwise from local angle 0 = 3 o'clock).
  var SEG = [
    { label: '250',     color: 0x7b3fb5 },
    { label: 'BONUS',   color: 0x15a88c },
    { label: '500',     color: 0xc0392b },
    { label: '100',     color: 0x2980d8 },
    { label: '1000',    color: 0x7b3fb5 },
    { label: '200',     color: 0x15a88c },
    { label: '50',      color: 0xc0392b },
    { label: 'JACKPOT', color: 0xf0a020, big: true }
  ];
  var N = SEG.length;
  var STEP = (Math.PI * 2) / N;

  // Scripted landings: index into SEG + coin reward.
  var SCRIPT = [
    { index: 2, win: 500, label: 'YOU WON 500!' },        // '500'
    { index: 7, win: 25000, jackpot: true, label: 'JACKPOT!' }
  ];

  var balance = 1000;
  var app, wheel, spinning = false, scriptIndex = 0;
  var balanceText, spinBtn, hintText, coinTex, coins = [];

  // ── Texture helpers ─────────────────────────────────────────────────────────
  function makeGradientTexture(w, h, top, bottom) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    return PIXI.Texture.from(cv);
  }

  function makeCoinTexture() {
    var s = 56, cv = document.createElement('canvas'); cv.width = s; cv.height = s;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(s * 0.38, s * 0.34, 4, s * 0.5, s * 0.5, s * 0.5);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffcc33'); g.addColorStop(1, '#c8860a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 3, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#a86a06';
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 3, 0, 7); ctx.stroke();
    ctx.fillStyle = '#b9760a'; ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', s / 2, s / 2 + 2);
    return PIXI.Texture.from(cv);
  }

  // ── Tiny ticker-driven tween (Pixi has no built-in tween) ───────────────────
  // NB: Pixi ticker callbacks receive deltaTime, not a timestamp — so drive the
  // tween off requestAnimationFrame + performance.now() to stay engine-agnostic.
  function animate(duration, ease, onUpdate, onComplete) {
    var start = performance.now();
    function step() {
      var t = Math.min(1, (performance.now() - start) / duration);
      onUpdate(ease(t), t);
      if (t < 1) requestAnimationFrame(step);
      else if (onComplete) onComplete();
    }
    requestAnimationFrame(step);
  }
  var easeOutQuart = function (t) { return 1 - Math.pow(1 - t, 4); };

  function txt(str, size, color, weight) {
    return new PIXI.Text(str, {
      fontFamily: 'Arial Black, Arial, sans-serif', fontSize: size, fill: color,
      fontWeight: weight || '900', stroke: 0x000000, strokeThickness: Math.max(2, size * 0.06),
      align: 'center'
    });
  }

  // ── Buttons ─────────────────────────────────────────────────────────────────
  function makeButton(label, sub, w, h, fill, onTap) {
    var c = new PIXI.Container();
    var g = new PIXI.Graphics();
    g.beginFill(0x12702c).drawRoundedRect(-w / 2, -h / 2, w, h, 28).endFill();
    g.beginFill(fill).drawRoundedRect(-w / 2, -h / 2, w, h - 12, 28).endFill();
    g.lineStyle(4, 0xffffff, 1).drawRoundedRect(-w / 2, -h / 2, w, h, 28);
    c.addChild(g);
    var l = txt(label, h * 0.42, 0xffffff); l.anchor.set(0.5); l.y = sub ? -8 : 0; c.addChild(l);
    if (sub) { var s = txt(sub, 20, 0xd6ffe0, '400'); s.anchor.set(0.5); s.y = h * 0.28; c.addChild(s); }
    c.eventMode = 'static'; c.cursor = 'pointer';
    c.on('pointerdown', onTap);
    return c;
  }

  // ── Build wheel ─────────────────────────────────────────────────────────────
  function buildWheel() {
    wheel = new PIXI.Container();
    wheel.x = CX; wheel.y = CY;

    var g = new PIXI.Graphics();
    for (var i = 0; i < N; i++) {
      var a0 = i * STEP, a1 = (i + 1) * STEP;
      g.beginFill(SEG[i].color);
      g.lineStyle(3, 0x2a1540, 1);
      g.moveTo(0, 0);
      g.arc(0, 0, R, a0, a1);
      g.lineTo(0, 0);
      g.endFill();
    }
    wheel.addChild(g);

    // labels (radial, centred in each wedge)
    for (var j = 0; j < N; j++) {
      var mid = j * STEP + STEP / 2;
      var label = txt(SEG[j].label, SEG[j].big ? 30 : 38, SEG[j].big ? 0x3a1d00 : 0xffffff, '900');
      label.anchor.set(0.5);
      label.x = Math.cos(mid) * R * 0.64;
      label.y = Math.sin(mid) * R * 0.64;
      label.rotation = mid + Math.PI / 2;   // text faces outward, upright at the rim
      wheel.addChild(label);
    }

    // rim + blinking bulbs
    var rim = new PIXI.Graphics();
    rim.lineStyle(14, 0xcaa23a, 1).drawCircle(0, 0, R + 6);
    wheel.addChild(rim);
    wheel.bulbs = [];
    for (var b = 0; b < 16; b++) {
      var ang = b * (Math.PI * 2 / 16);
      var bulb = new PIXI.Graphics();
      bulb.beginFill(0xffe27a).drawCircle(0, 0, 8).endFill();
      bulb.x = Math.cos(ang) * (R + 6); bulb.y = Math.sin(ang) * (R + 6);
      wheel.addChild(bulb); wheel.bulbs.push(bulb);
    }

    // hub
    var hub = new PIXI.Graphics();
    hub.beginFill(0xcaa23a).drawCircle(0, 0, 46).endFill();
    hub.beginFill(0x7a1f25).drawCircle(0, 0, 34).endFill();
    wheel.addChild(hub);

    app.stage.addChild(wheel);
    wheel.rotation = -Math.PI / 2;   // start with segment 0 at top-ish

    // blink bulbs
    var phase = 0;
    setInterval(function () {
      phase++;
      for (var i = 0; i < wheel.bulbs.length; i++) {
        wheel.bulbs[i].tint = (i + phase) % 2 ? 0xffe27a : 0xff5a3c;
      }
    }, 240);
  }

  function buildPointer() {
    var p = new PIXI.Graphics();
    p.beginFill(0xffffff);
    p.lineStyle(3, 0x7a1f25);
    p.moveTo(CX - 26, CY - R - 34);
    p.lineTo(CX + 26, CY - R - 34);
    p.lineTo(CX, CY - R + 16);
    p.closePath();
    p.endFill();
    app.stage.addChild(p);
  }

  function buildHUD() {
    var coin = new PIXI.Sprite(coinTex); coin.anchor.set(0.5); coin.x = 150; coin.y = 96; coin.scale.set(1.1);
    app.stage.addChild(coin);
    balanceText = txt(balance.toLocaleString(), 44, 0xffe27a, '900');
    balanceText.anchor.set(0, 0.5); balanceText.x = 186; balanceText.y = 96;
    app.stage.addChild(balanceText);

    var title = txt('SPIN TO WIN', 52, 0xffe27a, '900');
    title.anchor.set(0.5); title.x = CX; title.y = 210;
    app.stage.addChild(title);

    var mute = txt('🔊', 38, 0xffffff, '400');
    mute.anchor.set(0.5); mute.x = W - 60; mute.y = 96; mute.eventMode = 'static'; mute.cursor = 'pointer';
    mute.on('pointerdown', function () { mute.text = SFX.toggleMuted() ? '🔇' : '🔊'; });
    app.stage.addChild(mute);
  }

  function buildControls() {
    spinBtn = makeButton('SPIN', '2 FREE SPINS', 320, 120, 0x2bd659, onSpinPressed);
    spinBtn.x = CX; spinBtn.y = 1140;
    app.stage.addChild(spinBtn);
    pulse(spinBtn);

    hintText = txt('👆 TAP TO SPIN', 30, 0xffe27a, '900');
    hintText.anchor.set(0.5); hintText.x = CX; hintText.y = 1035;
    app.stage.addChild(hintText);
    pulse(hintText, 1.0, 0.5);

    // tapping the wheel also spins
    wheel.eventMode = 'static'; wheel.cursor = 'pointer';
    wheel.on('pointerdown', onSpinPressed);
  }

  function pulse(obj, base, toAlpha) {
    base = base || 1;
    var t0 = performance.now();
    app.ticker.add(function () {
      var p = (Math.sin((performance.now() - t0) / 320) + 1) / 2;
      obj.scale.set(base + p * 0.07 * base);
      if (toAlpha != null) obj.alpha = toAlpha + p * (1 - toAlpha);
    });
  }

  function onSpinPressed() {
    if (spinning || scriptIndex >= SCRIPT.length) return;
    SFX.unlock(); SFX.click();
    if (hintText) { hintText.visible = false; }
    spin();
  }

  // ── Spin ────────────────────────────────────────────────────────────────────
  function spin() {
    spinning = true;
    spinBtn.alpha = 0.5;
    var outcome = SCRIPT[scriptIndex++];
    PlayableAd.track('wheel_spin', { n: scriptIndex });

    // compute final rotation so segment center lands under the top pointer
    var pointer = -Math.PI / 2;
    var center = outcome.index * STEP + STEP / 2;
    var from = wheel.rotation;
    var base = ((pointer - center) % (Math.PI * 2));
    var fromMod = ((from % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    var delta = (((base - fromMod) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    var to = from + Math.PI * 2 * 5 + delta;   // 5 full turns + settle

    var lastSeg = -1;   // wheel uses per-segment ticks (below) — no continuous whir
    animate(4200, easeOutQuart,
      function (e) {
        wheel.rotation = from + (to - from) * e;
        // tick as each segment boundary crosses the pointer
        var localAtPointer = ((pointer - wheel.rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        var seg = Math.floor(localAtPointer / STEP);
        if (seg !== lastSeg) { lastSeg = seg; SFX.tick(); }
      },
      function () { onLand(outcome); }
    );
  }

  function onLand(outcome) {
    spinning = false;
    flashSegment(outcome.index);
    addWinning(outcome.win);
    if (outcome.jackpot) {
      bigWin(outcome);
    } else {
      SFX.win();
      popup(outcome.label, 0xffe27a);
      spinBtn.alpha = 1;
      spinBtn.getChildAt(2) && (spinBtn.getChildAt(2).text = 'SPIN AGAIN!');
    }
  }

  function flashSegment(index) {
    var mid = index * STEP + STEP / 2;
    var g = new PIXI.Graphics();
    g.beginFill(0xffffff, 0.85);
    g.moveTo(0, 0); g.arc(0, 0, R, index * STEP, (index + 1) * STEP); g.lineTo(0, 0); g.endFill();
    g.x = 0; g.y = 0; wheel.addChildAt(g, 1);
    var t0 = performance.now();
    var fade = function () {
      var a = 1 - Math.min(1, (performance.now() - t0) / 1400);
      g.alpha = a * 0.7 * (0.5 + 0.5 * Math.sin(performance.now() / 60));
      if (a <= 0) { app.ticker.remove(fade); g.destroy(); }
    };
    app.ticker.add(fade);
  }

  function addWinning(amount) {
    var from = balance; balance += amount;
    var o = { v: from };
    animate(1100, function (t) { return 1 - Math.pow(1 - t, 3); },
      function (e) { balanceText.text = Math.floor(from + (balance - from) * e).toLocaleString(); },
      function () { balanceText.text = balance.toLocaleString(); });
    for (var i = 0; i < 6; i++) SFX.coin(i * 0.08);
  }

  function popup(str, color) {
    var t = txt(str, 64, color, '900'); t.anchor.set(0.5); t.x = CX; t.y = CY; t.scale.set(0.2);
    app.stage.addChild(t);
    animate(450, function (x) { return 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2); },
      function (e) { t.scale.set(0.2 + e * 0.8); });
    setTimeout(function () {
      animate(500, function (x) { return x; }, function (e) { t.alpha = 1 - e; t.y = CY - e * 80; },
        function () { t.destroy(); });
    }, 900);
  }

  // ── Coin shower ─────────────────────────────────────────────────────────────
  function startCoins(duration) {
    var spawnUntil = performance.now() + duration;
    app.ticker.add(coinTick);
    var spawner = setInterval(function () {
      if (performance.now() > spawnUntil) { clearInterval(spawner); return; }
      for (var i = 0; i < 4; i++) {
        var c = new PIXI.Sprite(coinTex); c.anchor.set(0.5);
        c.x = Math.random() * W; c.y = -40;
        c.scale.set(0.5 + Math.random() * 0.5);
        c.vx = (Math.random() - 0.5) * 4; c.vy = 4 + Math.random() * 5; c.va = (Math.random() - 0.5) * 0.3;
        app.stage.addChild(c); coins.push(c);
      }
    }, 60);
  }
  function coinTick() {
    for (var i = coins.length - 1; i >= 0; i--) {
      var c = coins[i];
      c.vy += 0.25; c.x += c.vx; c.y += c.vy; c.rotation += c.va;
      if (c.y > H + 60) { c.destroy(); coins.splice(i, 1); }
    }
  }

  // ── Jackpot → end card ──────────────────────────────────────────────────────
  function bigWin(outcome) {
    // screen flash
    var flash = new PIXI.Graphics();
    flash.beginFill(0xfff0a0).drawRect(0, 0, W, H).endFill();
    app.stage.addChild(flash);
    animate(500, function (t) { return t; }, function (e) { flash.alpha = 1 - e; }, function () { flash.destroy(); });

    SFX.bigWin();
    startCoins(2500);
    popup(outcome.label, 0xffd23c);
    setTimeout(showEndCard, 2400);
  }

  function showEndCard() {
    PlayableAd.track('endcard_shown');
    var overlay = new PIXI.Container();
    var dim = new PIXI.Graphics();
    dim.beginFill(0x05030c, 0.84).drawRect(0, 0, W, H).endFill();
    dim.eventMode = 'static'; dim.cursor = 'pointer';
    dim.on('pointerdown', function () { PlayableAd.install(); });
    overlay.addChild(dim);

    var title = txt('SPIN TO WIN', 72, 0xffe27a, '900'); title.anchor.set(0.5); title.x = CX; title.y = 360;
    var sub = txt('Your JACKPOT is waiting!', 32, 0xffffff, '400'); sub.anchor.set(0.5); sub.x = CX; sub.y = 446;
    overlay.addChild(title); overlay.addChild(sub);

    var coin = new PIXI.Sprite(coinTex); coin.anchor.set(0.5); coin.x = CX; coin.y = 640; coin.scale.set(3.4);
    overlay.addChild(coin);

    var cta = makeButton('PLAY NOW', 'FREE TO INSTALL', 440, 124, 0x2bd659, function () { PlayableAd.install(); });
    cta.x = CX; cta.y = 940; overlay.addChild(cta);

    app.stage.addChild(overlay);
    pulse(cta);
    overlay.alpha = 0;
    animate(450, function (t) { return t; }, function (e) { overlay.alpha = e; });
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  function boot() {
    app = new PIXI.Application({ width: W, height: H, antialias: true, backgroundAlpha: 0 });
    document.getElementById('game').appendChild(app.view);

    var bg = new PIXI.Sprite(makeGradientTexture(W, H, '#2a1652', '#0a0814'));
    app.stage.addChild(bg);
    coinTex = makeCoinTexture();

    buildWheel();
    buildPointer();
    buildHUD();
    buildControls();

    fit();
    window.addEventListener('resize', fit);
    document.getElementById('loader').classList.add('hide');
    PlayableAd.track('game_loaded');
  }

  function fit() {
    var v = app.view;
    var scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    v.style.position = 'absolute';
    v.style.width = (W * scale) + 'px';
    v.style.height = (H * scale) + 'px';
    v.style.left = ((window.innerWidth - W * scale) / 2) + 'px';
    v.style.top = ((window.innerHeight - H * scale) / 2) + 'px';
  }

  PlayableAd.onReady(boot);
})();
