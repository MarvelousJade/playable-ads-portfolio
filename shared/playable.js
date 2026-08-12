/*
 * playable.js — Universal playable-ad lifecycle + CTA/redirect handler.
 *
 * A single build often has to ship across many ad networks, each with its own
 * "open the store" protocol and readiness signals. This module abstracts that
 * so the game code just calls PlayableAd.install() and PlayableAd.onReady().
 *
 * Supported click protocols: MRAID (IAB / ironSource / AppLovin / Vungle /
 * Mintegral), Google AdMob (ExitApi), Meta/Facebook (FbPlayableAd), Unity Ads
 * (install_url macro), AppLovin DAPI, plus a window.open() fallback for preview.
 *
 * Exposes a single global: window.PlayableAd
 */
(function (global) {
  'use strict';

  // ── Store destinations (swap per campaign) ───────────────────────────────
  // Delivery wrappers inject window.PLAYABLE_CONFIG with real campaign URLs.
  // The repository defaults return browser-preview clicks to the portfolio and
  // deliberately avoid pretending that these original concepts are store apps.
  var CONFIG = global.PLAYABLE_CONFIG || {
    iosUrl: 'https://apps.apple.com/us/genre/ios-games/id6014',
    androidUrl: 'https://play.google.com/store/games',
    previewUrl: '../'
  };

  // ── A/B variant selection ─────────────────────────────────────────────────
  // Networks pass variant via query string (?v=b) or an injected global
  // (window.AB_VARIANT, set by the packaging step). Defaults to 'a'.
  function variant() {
    try {
      var m = /[?&]v=([\w-]+)/.exec(global.location.search);
      return (m && m[1]) || global.AB_VARIANT || 'a';
    } catch (e) { return 'a'; }
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function storeUrl() {
    return isIOS() ? CONFIG.iosUrl : CONFIG.androidUrl;
  }

  var clickGuard = false;

  function install() {
    if (clickGuard) return;           // debounce rapid double-taps
    clickGuard = true;
    setTimeout(function () { clickGuard = false; }, 700);

    var url = storeUrl();
    track('cta_click');
    try {
      if (typeof mraid !== 'undefined' && mraid.open) {            // MRAID family
        mraid.open(url);
      } else if (typeof FbPlayableAd !== 'undefined') {            // Meta / Facebook
        FbPlayableAd.onCTAClick();
      } else if (global.ExitApi && global.ExitApi.exit) {          // Google AdMob / Ads
        global.ExitApi.exit();
      } else if (global.dapi && global.dapi.openStoreUrl) {        // AppLovin DAPI
        global.dapi.openStoreUrl(url);
      } else if (typeof global.install_url !== 'undefined') {      // Unity Ads macro
        global.open(global.install_url, '_blank');
      } else if (global.mintegral && global.mintegral.openUrl) {   // Mintegral
        global.mintegral.openUrl(url);
      } else {
        global.open(CONFIG.previewUrl || url, '_blank');           // portfolio preview
      }
    } catch (e) {
      global.open(CONFIG.previewUrl || url, '_blank');
    }
  }

  // ── Readiness ─────────────────────────────────────────────────────────────
  // Fire cb once the DOM is parsed AND (if present) MRAID reports ready.
  function onReady(cb) {
    function domReady(fn) {
      if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn, 0);
      else document.addEventListener('DOMContentLoaded', fn);
    }
    domReady(function () {
      if (typeof mraid === 'undefined') { wirePauseSources(); cb(); return; }
      if (mraid.getState && mraid.getState() === 'loading') {
        mraid.addEventListener('ready', function () { wirePauseSources(); cb(); });
      } else {
        wirePauseSources();
        cb();
      }
    });
  }

  // Pause/resume the game when the ad scrolls out of / into view (MRAID viewability).
  function onViewableChange(cb) {
    if (typeof mraid === 'undefined' || !mraid.addEventListener) return;
    mraid.addEventListener('viewableChange', cb);
  }

  // ── Unified pause bus ──────────────────────────────────────────────────────
  // Ad networks preload playables off-screen and swipe them in/out of view;
  // a compliant playable must not run or make sound while hidden. This folds
  // MRAID viewability and the Page Visibility API into one signal.
  var paused = false;
  var pausedAt = 0;
  var totalPaused = 0;
  var pauseCbs = [];

  // Shared gameplay clock + timers. Native setTimeout/setInterval continue while
  // an ad is preloaded off-screen, which can skip an interaction or reveal an
  // end card before the player sees the game. These helpers freeze with the
  // same lifecycle signal used by rendering and audio.
  var timerId = 0;
  var timers = [];
  function realNow() { return global.performance && performance.now ? performance.now() : Date.now(); }
  function now() {
    var n = realNow();
    return n - totalPaused - (paused ? n - pausedAt : 0);
  }
  function schedule(fn, ms, repeat) {
    var task = { id: ++timerId, at: now() + ms, ms: ms, repeat: !!repeat, fn: fn };
    timers.push(task);
    return task.id;
  }
  function delay(fn, ms) { return schedule(fn, ms, false); }
  function every(fn, ms) { return schedule(fn, ms, true); }
  function cancelTimer(id) {
    for (var i = timers.length - 1; i >= 0; i--) if (timers[i].id === id) timers.splice(i, 1);
  }
  (function timerFrame() {
    if (!paused) {
      var n = now();
      for (var i = timers.length - 1; i >= 0; i--) {
        var task = timers[i];
        if (n < task.at) continue;
        if (task.repeat) task.at = n + task.ms;
        else timers.splice(i, 1);
        try { task.fn(); } catch (e) { if (global.console && console.error) console.error(e); }
      }
    }
    global.requestAnimationFrame(timerFrame);
  })();

  function setPaused(p) {
    p = !!p;
    if (p === paused) return;
    if (p) pausedAt = realNow();
    else { totalPaused += realNow() - pausedAt; pausedAt = 0; }
    paused = p;
    track(p ? 'paused' : 'resumed');
    for (var i = 0; i < pauseCbs.length; i++) {
      try { pauseCbs[i](p); } catch (e) { /* one bad cb must not break the rest */ }
    }
  }

  function onPauseChange(cb) {
    pauseCbs.push(cb);
    // Late subscribers (games created after MRAID ready) must inherit an
    // initial not-viewable state instead of waiting for the next transition.
    if (paused) {
      try { cb(true); } catch (e) { if (global.console && console.error) console.error(e); }
    }
  }
  function isPaused() { return paused; }

  function wirePauseSources() {
    document.addEventListener('visibilitychange', function () {
      setPaused(document.hidden);
    });
    if (typeof mraid !== 'undefined' && mraid.addEventListener) {
      mraid.addEventListener('viewableChange', function (viewable) {
        setPaused(!viewable);
      });
      // some SDKs report not-viewable at start (ad preloaded off-screen)
      if (mraid.isViewable && !mraid.isViewable()) setPaused(true);
    }
  }

  // Lightweight analytics hook — wire to the network's event API in production.
  function track(event, data) {
    try {
      if (global.console && console.log) console.log('[playable] ' + event, data || '');
      // e.g. ironSource: if (global.ssa) ssa.trackEvent(event);
    } catch (e) { /* no-op */ }
  }

  global.PlayableAd = {
    config: CONFIG,
    install: install,
    onReady: onReady,
    onViewableChange: onViewableChange,
    onPauseChange: onPauseChange,
    isPaused: isPaused,
    variant: variant,
    track: track,
    now: now,
    delay: delay,
    every: every,
    cancelTimer: cancelTimer,
    isIOS: isIOS,
    storeUrl: storeUrl
  };
})(window);
