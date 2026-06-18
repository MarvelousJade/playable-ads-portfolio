/*
 * Lucky Vegas Slots — Phaser 3 playable ad.
 *
 * A scripted "playable funnel": the player gets 2 free spins. Spin 1 lands a
 * teaser win to teach the match-3 mechanic; spin 2 is a guaranteed 777 jackpot
 * that triggers a big-win celebration and the install end-card. All symbol art
 * is generated procedurally at runtime (zero image files) to stay tiny.
 */
(function () {
  'use strict';

  // ── Layout (portrait base resolution; Scale.FIT letterboxes to any screen) ──
  var W = 720, H = 1280;
  var TILE = 180;                 // symbol cell size
  var COL_X = [180, 360, 540];    // reel centre x
  var REEL_W = 168;               // symbol draw width
  var WIN_TOP = 392;              // top edge of the 3-row reel window
  var WIN_H = 3 * TILE;           // window height (540)
  var WIN_LEFT = 86, WIN_RIGHT = 634;

  // ── Symbols (procedural art descriptors) ────────────────────────────────────
  // Fruit/object symbols use real Twemoji art (assets/*.png, CC-BY 4.0);
  // the jackpot 7 stays custom-drawn for a casino look.
  var SYMBOLS = [
    { id: 'cherry',  key: 'cherry', c1: '#33457f', c2: '#16213f' },
    { id: 'lemon',   key: 'lemon',  c1: '#33457f', c2: '#16213f' },
    { id: 'bell',    key: 'bell',   c1: '#6a3680', c2: '#2f1640' },
    { id: 'star',    key: 'star',   c1: '#6a3680', c2: '#2f1640' },
    { id: 'gem',     key: 'gem',    c1: '#1f6a70', c2: '#0c3033' },
    { id: 'seven',   draw: drawSeven, c1: '#8a242b', c2: '#3a0d11' }
  ];
  var BELL = 2, SEVEN = 5;

  // ── Scripted outcomes (the funnel) ──────────────────────────────────────────
  var SCRIPT = [
    { payline: [BELL, BELL, BELL], win: 800, label: 'NICE WIN!' },
    { payline: [SEVEN, SEVEN, SEVEN], win: 25000, jackpot: true, full: SEVEN, label: 'MEGA WIN!' }
  ];

  var balance = 1000;

  // ── Procedural texture helpers ──────────────────────────────────────────────
  function drawSeven(ctx, s) {
    ctx.save();
    ctx.font = 'bold ' + Math.floor(s * 0.7) + 'px Arial Black, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = s * 0.06;
    ctx.strokeStyle = '#fff0b0';
    var g = ctx.createLinearGradient(0, s * 0.2, 0, s * 0.85);
    g.addColorStop(0, '#ffe680');
    g.addColorStop(1, '#f4a300');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(255,180,0,0.9)';
    ctx.shadowBlur = s * 0.12;
    ctx.strokeText('7', s / 2, s / 2 + s * 0.03);
    ctx.fillText('7', s / 2, s / 2 + s * 0.03);
    ctx.restore();
  }

  function makeSymbolTexture(scene, sym, idx) {
    var s = 168;
    var cv = document.createElement('canvas');
    cv.width = s; cv.height = s;
    var ctx = cv.getContext('2d');
    // rounded tile background with vertical gradient
    var r = 22;
    var g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, sym.c1);
    g.addColorStop(1, sym.c2);
    roundRect(ctx, 6, 6, s - 12, s - 12, r);
    ctx.fillStyle = g;
    ctx.fill();
    // glossy top highlight
    ctx.save();
    roundRect(ctx, 6, 6, s - 12, s - 12, r);
    ctx.clip();
    var gl = ctx.createLinearGradient(0, 6, 0, s * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.18)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(6, 6, s - 12, s * 0.5);
    ctx.restore();
    // border
    roundRect(ctx, 6, 6, s - 12, s - 12, r);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();
    // symbol glyph
    if (sym.draw) {
      sym.draw(ctx, s);
    } else {
      var img = scene.textures.get(sym.key).getSourceImage();
      var d = s * 0.66, off = (s - d) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = s * 0.05; ctx.shadowOffsetY = s * 0.025;
      ctx.drawImage(img, off, off, d, d);
      ctx.restore();
    }
    scene.textures.addCanvas('sym' + idx, cv);
  }

  // coin art is loaded from assets/coin.png in preload()

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function randSym() { return Phaser.Math.Between(0, SYMBOLS.length - 1); }

  // ── Scene ───────────────────────────────────────────────────────────────────
  var GameScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function GameScene() { Phaser.Scene.call(this, { key: 'game' }); },

    preload: function () {
      ['cherry', 'lemon', 'bell', 'star', 'gem', 'coin'].forEach(function (k) {
        this.load.image(k, '../assets/' + k + '.png');
      }, this);
    },

    create: function () {
      var self = this;
      this.spinning = false;
      this.scriptIndex = 0;
      this.freeSpins = SCRIPT.length;
      this.reels = [];

      SYMBOLS.forEach(function (s, i) { makeSymbolTexture(self, s, i); });

      this.buildBackground();
      this.buildMachine();
      this.buildReels();
      this.buildHUD();
      this.buildCoinEmitter();
      this.buildSpinButton();
      this.buildAttract();

      // Unlock audio on first interaction.
      this.input.once('pointerdown', function () { SFX.unlock(); });

      document.getElementById('loader').classList.add('hide');
      PlayableAd.track('game_loaded');
    },

    // ── Background: gradient + radial glow + bokeh ────────────────────────────
    buildBackground: function () {
      var g = this.add.graphics();
      g.fillGradientStyle(0x241640, 0x241640, 0x0a0814, 0x0a0814, 1);
      g.fillRect(0, 0, W, H);
      // warm glow behind the machine
      var glow = this.add.graphics();
      for (var i = 12; i > 0; i--) {
        glow.fillStyle(0xff8a1f, 0.015 * i);
        glow.fillCircle(W / 2, H * 0.5, i * 30);
      }
      // bokeh
      for (var b = 0; b < 18; b++) {
        var c = this.add.circle(
          Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
          Phaser.Math.Between(3, 10), 0xffd86b, Phaser.Math.FloatBetween(0.05, 0.18));
        this.tweens.add({ targets: c, alpha: 0.02, duration: Phaser.Math.Between(1200, 2600),
          yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 1500) });
      }
    },

    // ── Machine frame + blinking marquee bulbs ────────────────────────────────
    buildMachine: function () {
      var g = this.add.graphics();
      // outer gold cabinet
      g.fillStyle(0xcaa23a, 1);
      g.fillRoundedRect(64, WIN_TOP - 96, W - 128, WIN_H + 200, 36);
      g.fillStyle(0x8a6a12, 1);
      g.fillRoundedRect(72, WIN_TOP - 88, W - 144, WIN_H + 184, 30);
      // inner window
      g.fillStyle(0x07060f, 1);
      g.fillRoundedRect(WIN_LEFT, WIN_TOP, WIN_RIGHT - WIN_LEFT, WIN_H, 16);

      // title plate
      var plate = this.add.graphics();
      plate.fillStyle(0x7a1f25, 1);
      plate.fillRoundedRect(160, WIN_TOP - 92, W - 320, 70, 18);
      plate.lineStyle(3, 0xffd86b, 1);
      plate.strokeRoundedRect(160, WIN_TOP - 92, W - 320, 70, 18);
      this.add.text(W / 2, WIN_TOP - 57, 'LUCKY VEGAS', {
        fontFamily: 'Arial Black, Arial', fontSize: '40px', color: '#ffe27a'
      }).setOrigin(0.5).setShadow(0, 2, '#5a1014', 4);

      // marquee bulbs around the cabinet
      this.bulbs = [];
      var pts = [];
      for (var x = 96; x <= W - 96; x += 44) { pts.push([x, WIN_TOP - 110]); pts.push([x, WIN_TOP + WIN_H + 78]); }
      for (var y = WIN_TOP - 70; y <= WIN_TOP + WIN_H + 50; y += 44) { pts.push([78, y]); pts.push([W - 78, y]); }
      for (var i = 0; i < pts.length; i++) {
        this.bulbs.push(this.add.circle(pts[i][0], pts[i][1], 6, 0xffe27a, 1));
      }
      var phase = 0;
      this.time.addEvent({ delay: 220, loop: true, callback: function () {
        phase++;
        for (var i = 0; i < this.bulbs.length; i++) {
          this.bulbs[i].setFillStyle((i + phase) % 2 ? 0xffe27a : 0xff5a3c, 1);
        }
      }, callbackScope: this });

      // payline indicator (hidden until a win)
      this.payline = this.add.graphics();
      this.payline.setAlpha(0);
    },

    // ── Reels ─────────────────────────────────────────────────────────────────
    buildReels: function () {
      // single geometry mask covering the window
      var maskG = this.make.graphics();
      maskG.fillRect(WIN_LEFT, WIN_TOP, WIN_RIGHT - WIN_LEFT, WIN_H);
      var mask = maskG.createGeometryMask();

      for (var r = 0; r < 3; r++) {
        var c = this.add.container(COL_X[r], 0);
        c.setMask(mask);
        this.reels.push({ container: c, rowSymbols: [] });
        this.fillReelIdle(this.reels[r]);
      }
    },

    // Populate a reel with a static random set (initial look).
    fillReelIdle: function (reel) {
      reel.container.removeAll(true);
      for (var i = 0; i < 4; i++) {
        var img = this.add.image(0, (WIN_TOP - TILE / 2) + i * TILE, 'sym' + randSym())
          .setDisplaySize(REEL_W, REEL_W);
        reel.container.add(img);
      }
      reel.container.y = 0;
    },

    // ── HUD: balance, coin icon, mute ─────────────────────────────────────────
    buildHUD: function () {
      this.add.image(150, 120, 'coin').setDisplaySize(56, 56);
      this.balanceText = this.add.text(186, 120, balance.toLocaleString(), {
        fontFamily: 'Arial Black, Arial', fontSize: '46px', color: '#ffe27a'
      }).setOrigin(0, 0.5).setShadow(0, 2, '#000', 4);
      this.add.text(186, 158, 'COINS', {
        fontFamily: 'Arial', fontSize: '20px', color: '#b9a96b'
      }).setOrigin(0, 0.5);

      // mute toggle
      var mute = this.add.text(W - 60, 110, '🔊', { fontSize: '40px' }).setOrigin(0.5).setInteractive();
      mute.on('pointerdown', function () {
        var m = SFX.toggleMuted();
        mute.setText(m ? '🔇' : '🔊');
      });
    },

    buildCoinEmitter: function () {
      this.coins = this.add.particles(0, -60, 'coin', {
        x: { min: WIN_LEFT, max: WIN_RIGHT },
        speedY: { min: 250, max: 520 }, speedX: { min: -140, max: 140 },
        accelerationY: 700, lifespan: 2200, scale: { min: 0.06, max: 0.12 },
        rotate: { min: 0, max: 360 }, quantity: 3, frequency: 45, emitting: false
      });
      this.coins.setDepth(50);
    },

    // ── Spin button ───────────────────────────────────────────────────────────
    buildSpinButton: function () {
      var bx = W / 2, by = 1130;
      var btn = this.add.container(bx, by);
      var g = this.add.graphics();
      g.fillStyle(0x1b8f3a, 1); g.fillRoundedRect(-150, -58, 300, 116, 30);
      g.fillStyle(0x27c451, 1); g.fillRoundedRect(-150, -58, 300, 100, 30);
      g.lineStyle(4, 0xffe27a, 1); g.strokeRoundedRect(-150, -58, 300, 116, 30);
      var label = this.add.text(0, -6, 'SPIN', {
        fontFamily: 'Arial Black, Arial', fontSize: '52px', color: '#ffffff'
      }).setOrigin(0.5).setShadow(0, 3, '#0a4a1c', 4);
      var sub = this.add.text(0, 34, '2 FREE SPINS', {
        fontFamily: 'Arial', fontSize: '20px', color: '#d6ffe0'
      }).setOrigin(0.5);
      btn.add([g, label, sub]);
      btn.setSize(300, 116);
      btn.setInteractive(new Phaser.Geom.Rectangle(-150, -58, 300, 116), Phaser.Geom.Rectangle.Contains);
      btn.on('pointerdown', this.onSpinPressed, this);

      // Robust fallback: tap anywhere on the machine (below the HUD) to spin.
      // Touch-friendly and avoids first-tap hit-test misses on the container.
      this.input.on('pointerdown', function (pointer) {
        if (pointer.y > 240) this.onSpinPressed();
      }, this);

      this.spinBtn = btn; this.spinSub = sub; this.spinLabel = label;
      // attract pulse
      this.btnPulse = this.tweens.add({ targets: btn, scale: 1.07, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    },

    buildAttract: function () {
      this.hint = this.add.text(W / 2, 1046, '👆 TAP TO SPIN', {
        fontFamily: 'Arial Black, Arial', fontSize: '30px', color: '#ffe27a'
      }).setOrigin(0.5);
      this.tweens.add({ targets: this.hint, y: 1060, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    },

    onSpinPressed: function () {
      if (this.spinning || this.freeSpins <= 0) return;
      SFX.unlock(); SFX.click();
      if (this.hint) { this.hint.destroy(); this.hint = null; }
      this.startSpin();
    },

    // ── Spin ──────────────────────────────────────────────────────────────────
    startSpin: function () {
      var self = this;
      this.spinning = true;
      this.freeSpins--;
      this.btnPulse.pause();
      this.spinBtn.setScale(1);
      this.spinBtn.setAlpha(0.55);
      this.spinSub.setText(this.freeSpins + ' FREE SPIN' + (this.freeSpins === 1 ? '' : 'S'));
      this.payline.setAlpha(0);
      SFX.spinStart();
      PlayableAd.track('spin', { n: this.scriptIndex + 1 });

      var outcome = SCRIPT[this.scriptIndex++];
      var stopped = 0;
      for (var r = 0; r < 3; r++) {
        (function (r) {
          self.spinReel(self.reels[r], r, outcome, function () {
            SFX.reelStop();
            stopped++;
            // anticipation flash on the last reel for a jackpot
            if (stopped === 3) self.onAllStopped(outcome);
          });
        })(r);
      }
    },

    spinReel: function (reel, r, outcome, onStop) {
      reel.container.removeAll(true);
      reel.rowSymbols = [];

      var SPIN_TILES = 16 + r * 5;          // later reels travel further → stop later
      var TOP = 1;                           // buffer row above for the bounce
      var len = SPIN_TILES + 6;
      var strip = [];
      for (var i = 0; i < len; i++) strip.push(randSym());
      var row0 = (outcome.full != null) ? outcome.full : randSym();
      var row2 = (outcome.full != null) ? outcome.full : randSym();
      strip[1] = row0;
      strip[2] = outcome.payline[r];         // payline = centre row
      strip[3] = row2;

      var yEnd = (WIN_TOP + TILE / 2 - TOP * TILE);
      var yStart = yEnd - SPIN_TILES * TILE;

      for (var k = 0; k < len; k++) {
        var img = this.add.image(0, k * TILE, 'sym' + strip[k]).setDisplaySize(REEL_W, REEL_W);
        reel.container.add(img);
        if (k >= 1 && k <= 3) reel.rowSymbols[k - 1] = img;
      }
      reel.container.y = yStart;

      this.tweens.add({
        targets: reel.container,
        y: yEnd,
        duration: 950 + r * 360,
        ease: 'Back.easeOut',
        easeParams: [1.4],
        onComplete: onStop
      });
    },

    onAllStopped: function (outcome) {
      SFX.spinStop();
      this.spinning = false;
      this.highlightWin();
      var self = this;

      if (outcome.jackpot) {
        this.bigWin(outcome);
      } else {
        SFX.win();
        this.addWinning(outcome.win);
        // prompt the next (jackpot) spin
        this.spinBtn.setAlpha(1);
        this.btnPulse.resume();
        this.spinSub.setText('SPIN AGAIN!');
        this.flashText('+' + outcome.win.toLocaleString(), '#ffe27a');
      }
    },

    // pulse the three centre-row symbols + glow the payline
    highlightWin: function () {
      var py = WIN_TOP + 1.5 * TILE;
      this.payline.clear();
      this.payline.lineStyle(6, 0xffe27a, 0.9);
      this.payline.strokeRoundedRect(WIN_LEFT + 6, py - TILE / 2, (WIN_RIGHT - WIN_LEFT) - 12, TILE, 14);
      this.payline.setAlpha(1);
      this.tweens.add({ targets: this.payline, alpha: 0.25, duration: 380, yoyo: true, repeat: -1 });
      for (var r = 0; r < 3; r++) {
        var img = this.reels[r].rowSymbols[1];
        if (img) this.tweens.add({ targets: img, scale: img.scale * 1.18, duration: 300, yoyo: true, repeat: 3, ease: 'Sine.inOut' });
      }
    },

    addWinning: function (amount) {
      var self = this;
      this.coins.explode(40, W / 2, WIN_TOP + WIN_H / 2);
      var from = balance;
      balance += amount;
      var o = { v: from };
      this.tweens.add({
        targets: o, v: balance, duration: 1100, ease: 'Cubic.out',
        onUpdate: function () { self.balanceText.setText(Math.floor(o.v).toLocaleString()); },
        onComplete: function () { self.balanceText.setText(balance.toLocaleString()); }
      });
      for (var i = 0; i < 6; i++) SFX.coin(i * 0.08);
    },

    flashText: function (str, color) {
      var t = this.add.text(W / 2, WIN_TOP + WIN_H / 2, str, {
        fontFamily: 'Arial Black, Arial', fontSize: '90px', color: color
      }).setOrigin(0.5).setShadow(0, 4, '#000', 6).setDepth(60).setScale(0.2);
      this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.out' });
      this.tweens.add({ targets: t, alpha: 0, y: t.y - 80, delay: 900, duration: 500,
        onComplete: function () { t.destroy(); } });
    },

    // ── Jackpot celebration → end card ────────────────────────────────────────
    bigWin: function (outcome) {
      var self = this;
      this.cameras.main.flash(500, 255, 240, 160);
      this.cameras.main.shake(500, 0.01);
      this.coins.start();
      SFX.bigWin();
      this.addWinning(outcome.win);

      var banner = this.megaBanner = this.add.text(W / 2, H * 0.34, outcome.label, {
        fontFamily: 'Arial Black, Arial', fontSize: '110px', color: '#ffd23c'
      }).setOrigin(0.5).setDepth(60).setShadow(0, 5, '#7a1010', 8).setScale(0.1);
      this.tweens.add({ targets: banner, scale: 1, duration: 600, ease: 'Elastic.out' });
      this.tweens.add({ targets: banner, angle: { from: -3, to: 3 }, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

      this.time.delayedCall(2400, function () { self.coins.stop(); self.showEndCard(); });
    },

    showEndCard: function () {
      var self = this;
      PlayableAd.track('endcard_shown');
      if (this.megaBanner) { this.megaBanner.destroy(); this.megaBanner = null; }
      var overlay = this.add.container(0, 0).setDepth(80);
      var dim = this.add.rectangle(0, 0, W, H, 0x05030c, 0.92).setOrigin(0).setInteractive();
      dim.on('pointerdown', function () { PlayableAd.install(); });
      overlay.add(dim);

      var title = this.add.text(W / 2, 360, 'LUCKY VEGAS', {
        fontFamily: 'Arial Black, Arial', fontSize: '76px', color: '#ffe27a'
      }).setOrigin(0.5).setShadow(0, 4, '#5a1014', 6);
      var sub = this.add.text(W / 2, 450, 'Your JACKPOT is waiting!', {
        fontFamily: 'Arial', fontSize: '34px', color: '#ffffff'
      }).setOrigin(0.5);
      overlay.add([title, sub]);

      // a big glowing 7
      var seven = this.add.image(W / 2, 660, 'sym5').setDisplaySize(220, 220);
      this.tweens.add({ targets: seven, scale: seven.scale * 1.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      overlay.add(seven);

      // CTA button
      var cta = this.add.container(W / 2, 940);
      var g = this.add.graphics();
      g.fillStyle(0x1b8f3a, 1); g.fillRoundedRect(-220, -62, 440, 124, 32);
      g.fillStyle(0x2bd659, 1); g.fillRoundedRect(-220, -62, 440, 106, 32);
      g.lineStyle(5, 0xffffff, 1); g.strokeRoundedRect(-220, -62, 440, 124, 32);
      var ct = this.add.text(0, -4, 'PLAY NOW', {
        fontFamily: 'Arial Black, Arial', fontSize: '58px', color: '#ffffff'
      }).setOrigin(0.5).setShadow(0, 3, '#0a4a1c', 4);
      var cs = this.add.text(0, 40, 'FREE TO INSTALL', { fontFamily: 'Arial', fontSize: '20px', color: '#d6ffe0' }).setOrigin(0.5);
      cta.add([g, ct, cs]);
      cta.setInteractive(new Phaser.Geom.Rectangle(-220, -62, 440, 124), Phaser.Geom.Rectangle.Contains);
      cta.on('pointerdown', function () { PlayableAd.install(); });
      overlay.add(cta);
      this.tweens.add({ targets: cta, scale: 1.06, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

      overlay.setAlpha(0);
      this.tweens.add({ targets: overlay, alpha: 1, duration: 450 });
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    new Phaser.Game({
      type: Phaser.AUTO,
      width: W, height: H,
      parent: 'game',
      backgroundColor: '#0a0814',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [GameScene]
    });
  }

  PlayableAd.onReady(boot);
})();
