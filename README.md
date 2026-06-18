# Social Casino Playable Ads — Portfolio

Three lightweight, **network-ready HTML5 playable ads** built end-to-end for the
social-casino genre. Each demo uses a different rendering approach, and all of
them share a single play → win → install funnel — the structure real
user-acquisition playables follow.

| # | Demo | Engine | Mechanic | Folder |
|---|------|--------|----------|--------|
| 1 | **Lucky Vegas Slots** | Phaser 3 | 3×3 reels, anticipation, payline win, 777 jackpot | [`/slots`](slots/index.html) |
| 2 | **Spin to Win** | Pixi.js 7 | Weighted prize wheel, eased spin, jackpot landing | [`/wheel`](wheel/index.html) |
| 3 | **Lucky Scratch** | Vanilla Canvas 2D | Touch scratch-off reveal, match-3 win | [`/scratch`](scratch/index.html) |

Open [`index.html`](index.html) for the portfolio landing page that links all three.

---

## Why these three

The role is social-casino focused, so every demo is on-genre (slots, wheel,
scratch) but each one proves a **different competency**:

- **Phaser 3** — full game-framework proficiency (the posting's first-named engine).
- **Pixi.js** — a second framework, lower-level rendering + a hand-written tween/easing loop.
- **Vanilla Canvas 2D** — the smallest possible build, demonstrating raw
  performance-optimization skill with no framework overhead.

Together they cover the full "playable funnel": an attract loop to grab the tap,
a scripted teaser win to teach the mechanic, a guaranteed jackpot celebration,
and a forced install end-card with a universal CTA.

## How it maps to the job spec

| Requirement | Where it shows up |
|---|---|
| HTML5 / CSS3 / JavaScript | All three demos, no build tooling required to run |
| Phaser.js **or** Pixi.js | Demo 1 uses Phaser 3, Demo 2 uses Pixi 7 |
| Replicate Vegas-style slot & casino mechanics | Slots, wheel and scratch are all classic casino formats |
| Performance / fast load / smooth animation | Local-vendored libs, procedural art (zero image files), synthesised audio, vanilla build for the lightest case |
| Ad-network SDK integration (Unity Ads, AdMob, ironSource…) | [`shared/playable.js`](shared/playable.js) — one CTA API, network-specific click protocols |
| A/B testing through variations | Outcomes are data-driven `SCRIPT` arrays — swap the funnel, payouts or symbols without touching logic |
| 2D animation | Reel spin, wheel easing, scratch reveal, coin showers, payline pulses |

## Architecture

```
playable-ads-portfolio/
├── index.html          ← portfolio landing page
├── slots/              ← Demo 1 (Phaser 3)
├── wheel/              ← Demo 2 (Pixi.js)
├── scratch/            ← Demo 3 (vanilla Canvas)
├── shared/
│   ├── sfx.js          ← procedural WebAudio SFX engine (no audio files)
│   └── playable.js     ← universal MRAID / ad-network CTA + lifecycle layer
├── vendor/             ← phaser.min.js, pixi.min.js (vendored, offline-safe)
└── thumbnails/         ← landing-page screenshots
```

### Procedural assets — by design
There are **no image or audio files** in this repo. Symbol tiles, coins, the
wheel and the foil are drawn at runtime to off-screen `<canvas>` elements;
all SFX (spin whir, reel stops, coin clinks, win fanfare) are synthesised with
the **WebAudio API**. This keeps every build tiny and instantly loadable — the
single biggest factor in playable performance. Swapping in commissioned or
open-source (CC0) art is a drop-in replacement at the texture-build step.

### Universal CTA layer (`shared/playable.js`)
A playable usually ships to several networks from one build. `PlayableAd.install()`
detects the host environment and fires the correct redirect:

- **MRAID** (`mraid.open`) — IAB / ironSource / AppLovin / Vungle / Mintegral
- **Google AdMob** (`ExitApi.exit`)
- **Meta / Facebook** (`FbPlayableAd.onCTAClick`)
- **Unity Ads** (`install_url` macro)
- **AppLovin DAPI** (`dapi.openStoreUrl`)
- **`window.open` fallback** for preview / web

It also exposes `onReady()` (waits for DOM + MRAID `ready`), `onViewableChange()`
(pause/resume on viewability) and a `track()` analytics hook.

## A/B testing

Each game's outcome is a plain data array, e.g. the slot funnel:

```js
var SCRIPT = [
  { payline: [BELL, BELL, BELL], win: 800 },              // teaser win
  { payline: [SEVEN, SEVEN, SEVEN], win: 25000, jackpot: true } // mega win → CTA
];
```

Producing variants (different win cadence, symbols, payouts, number of spins) is
a data change, not a code change — ideal for performance-driven iteration.

## Running locally

The demos use relative paths and vendored libraries, so any static server works:

```bash
# from this folder
npx serve            # → http://localhost:3000
# or
python -m http.server 8000
```

Then open the landing page and click into each demo. (Opening the files over
`file://` mostly works too, but a static server avoids browser security quirks.)

## Production / network packaging notes

For a live campaign each demo is bundled to a **single self-contained `index.html`**
(library + JS + generated assets inlined) to satisfy network requirements:

- **Single-file HTML**, typically **< 2 MB** zipped (well within the common 2–5 MB caps).
- **MRAID** `mraid.js` is injected by the network at serve time — the code already
  guards for its presence.
- Per-network specs (Unity ZIP, AdMob single-file, ironSource/AppLovin MRAID,
  Meta `FbPlayableAd`) are handled by the shared CTA layer; only the packaging
  wrapper differs.

## Tech

`HTML5` · `CSS3` · `JavaScript (ES5-safe)` · `Phaser 3.80` · `Pixi.js 7.4` ·
`Canvas 2D` · `WebAudio` · `MRAID`
