/*
 * sfx.js — Procedural WebAudio sound engine for playable ads.
 *
 * Why procedural? Playable ads live under tight size budgets (2–5 MB) and must
 * be self-contained. Synthesising SFX at runtime means zero audio files, zero
 * extra bytes, and no decode latency — while still giving the spins, wins and
 * coin showers the "juice" that drives engagement.
 *
 * Exposes a single global: window.SFX
 */
(function (global) {
  'use strict';

  var AC = global.AudioContext || global.webkitAudioContext;
  var ctx = null;
  var master = null;
  var muted = false;
  var suspended = false;   // ad not viewable / page hidden — no sound may play
  var spinNodes = null;

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
    }
    // Browsers start the context suspended until a user gesture — resume on demand.
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  // A single enveloped oscillator "blip".
  function tone(o) {
    if (muted || suspended) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (o.delay || 0);
    var dur = o.dur || 0.15;
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqTo) osc.frequency.exponentialRampToValueAtTime(o.freqTo, t0 + dur);
    var vol = o.vol == null ? 0.3 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // Short burst of filtered noise — used for coins / scratching.
  function noise(o) {
    if (muted || suspended) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (o.delay || 0);
    var dur = o.dur || 0.2;
    var frames = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, frames, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    var src = c.createBufferSource();
    src.buffer = buf;
    var bp = c.createBiquadFilter();
    bp.type = o.filter || 'bandpass';
    bp.frequency.value = o.freq || 1800;
    bp.Q.value = o.q || 1;
    var g = c.createGain();
    g.gain.value = o.vol == null ? 0.25 : o.vol;
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  function arpeggio(freqs, step, type, vol) {
    freqs.forEach(function (f, i) {
      tone({ freq: f, freqTo: f * 1.001, type: type || 'triangle', dur: 0.18, vol: vol || 0.28, delay: i * (step || 0.09) });
    });
  }

  var SFX = {
    // Call once from a user gesture to satisfy autoplay policies.
    unlock: function () { ensure(); },
    setMuted: function (m) { muted = !!m; if (muted) this.spinStop(); },
    toggleMuted: function () { this.setMuted(!muted); return muted; },
    isMuted: function () { return muted; },

    // Hard-silence while the ad is off-screen (MRAID viewability / page hidden).
    // Suspending the context also halts any already-scheduled nodes (spin whir).
    suspend: function () {
      suspended = true;
      if (ctx && ctx.suspend) ctx.suspend();
    },
    resume: function () {
      suspended = false;
      if (ctx && ctx.resume && ctx.state === 'suspended') ctx.resume();
    },

    click: function () { tone({ type: 'square', freq: 660, freqTo: 320, dur: 0.07, vol: 0.18 }); },
    tick: function () { tone({ type: 'square', freq: 1000, freqTo: 520, dur: 0.035, vol: 0.13 }); },
    reelStop: function () { tone({ type: 'sine', freq: 420, freqTo: 150, dur: 0.13, vol: 0.3 }); },
    whoosh: function () { noise({ filter: 'bandpass', freq: 1200, q: 0.7, dur: 0.35, vol: 0.18 }); },

    // Looping reel whir — start when reels spin, stop when they land.
    spinStart: function () {
      if (muted || suspended) return;
      var c = ensure();
      if (!c || spinNodes) return;
      var osc = c.createOscillator();
      var lfo = c.createOscillator();
      var lfoGain = c.createGain();
      var lp = c.createBiquadFilter();
      var g = c.createGain();
      osc.type = 'triangle';            // softer than sawtooth — less "white noise"
      osc.frequency.value = 115;
      lfo.frequency.value = 24;         // gentle mechanical flutter
      lfoGain.gain.value = 12;
      lp.type = 'lowpass'; lp.frequency.value = 850;   // tame the harshness
      g.gain.value = 0.0001;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(lp); lp.connect(g);
      g.connect(master);
      g.gain.exponentialRampToValueAtTime(0.08, c.currentTime + 0.08);
      osc.start();
      lfo.start();
      spinNodes = { osc: osc, lfo: lfo, g: g };
    },
    spinStop: function () {
      if (!spinNodes || !ctx) return;
      var n = spinNodes;
      spinNodes = null;
      var t = ctx.currentTime;
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setValueAtTime(n.g.gain.value, t);
      n.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      n.osc.stop(t + 0.14);
      n.lfo.stop(t + 0.14);
    },

    coin: function (delay) { tone({ type: 'square', freq: 1320, freqTo: 1980, dur: 0.09, vol: 0.16, delay: delay || 0 }); tone({ type: 'square', freq: 1760, dur: 0.05, vol: 0.12, delay: (delay || 0) + 0.04 }); },
    win: function () { arpeggio([523, 659, 784, 1047], 0.085, 'triangle', 0.3); },
    bigWin: function () {
      arpeggio([523, 659, 784, 1047, 1319, 1568], 0.075, 'triangle', 0.32);
      // sparkle tail
      for (var i = 0; i < 6; i++) tone({ type: 'sine', freq: 1568 + i * 220, dur: 0.12, vol: 0.12, delay: 0.5 + i * 0.05 });
    },
    lose: function () { tone({ type: 'sawtooth', freq: 300, freqTo: 110, dur: 0.4, vol: 0.22 }); },
    // gritty, granular "scrrtch" that sweeps down with resonance — reads as a
    // coin dragging across foil rather than a thin hiss. Randomised per stroke.
    scratch: function () {
      if (muted || suspended) return;
      var c = ensure();
      if (!c) return;
      var t0 = c.currentTime, dur = 0.12;
      var frames = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, frames, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < frames; i++) {
        var env = 1 - i / frames;
        var grain = 0.55 + 0.45 * Math.sin(i * 0.7);   // granular drag texture
        d[i] = (Math.random() * 2 - 1) * env * grain;
      }
      var src = c.createBufferSource(); src.buffer = buf;
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4.5;
      bp.frequency.setValueAtTime(2300 + Math.random() * 700, t0);
      bp.frequency.exponentialRampToValueAtTime(950, t0 + dur);
      var g = c.createGain(); g.gain.value = 0.15;
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + dur);
    }
  };

  global.SFX = SFX;
})(window);
