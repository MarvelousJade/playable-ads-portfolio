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
  var CONFIG = {
    iosUrl: 'https://apps.apple.com/app/id000000000',
    androidUrl: 'https://play.google.com/store/apps/details?id=com.example.socialcasino'
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
        global.open(url, '_blank');                                // preview / web fallback
      }
    } catch (e) {
      global.open(url, '_blank');
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
  var pauseCbs = [];

  function setPaused(p) {
    p = !!p;
    if (p === paused) return;
    paused = p;
    track(p ? 'paused' : 'resumed');
    for (var i = 0; i < pauseCbs.length; i++) {
      try { pauseCbs[i](p); } catch (e) { /* one bad cb must not break the rest */ }
    }
  }

  function onPauseChange(cb) { pauseCbs.push(cb); }
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
    isIOS: isIOS,
    storeUrl: storeUrl
  };
})(window);
