# Social Casino Playable Ads — Portfolio

Three lightweight, **network-ready HTML5 playable ads** built end-to-end for the
social-casino genre. Each demo uses a different rendering approach, and all of
them share a single play → win → install funnel — the structure real
user-acquisition playables follow.

| # | Demo | Engine | Mechanic | Folder |
|---|------|--------|----------|--------|
| 1 | **Lucky Vegas Slots** | Phaser 3 | 3×3 reels, anticipation, payline win, pick-a-chest bonus, 777 jackpot | [`/slots`](slots/index.html) |
| 2 | **Spin to Win** | Pixi.js 7 | Hold-to-charge power meter, weighted wheel, eased spin, jackpot landing | [`/wheel`](wheel/index.html) |
| 3 | **Lucky Scratch** | Vanilla Canvas 2D | Touch scratch-off reveal, match-3 win, unlockable bonus card | [`/scratch`](scratch/index.html) |

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
a scripted teaser win to teach the mechanic, a mid-funnel interaction beat
(pick-a-chest / hold-to-charge / bonus card) for real player agency, a guaranteed
jackpot celebration, and a claim-framed install end-card. Each demo also carries
the patterns of top-performing playables: a **persistent install CTA** and a
**social-proof winners ticker** visible throughout play.

## How it maps to the job spec

| Requirement | Where it shows up |
|---|---|
| HTML5 / CSS3 / JavaScript | All three demos, no build tooling required to run |
| Phaser.js **or** Pixi.js | Demo 1 uses Phaser 3, Demo 2 uses Pixi 7 |
| Replicate Vegas-style slot & casino mechanics | Slots, wheel and scratch are all classic casino formats |
| Performance / fast load / smooth animation | Local-vendored libs, tiny art (~90 KB), procedural framing, synthesised audio, vanilla build for the lightest case |
| Ad-network SDK integration (Unity Ads, AdMob, ironSource…) | [`shared/playable.js`](shared/playable.js) — one CTA API, network-specific click protocols, MRAID viewability → pause/resume |
| Network technical specs | [`build.js`](build.js) packages each demo into a **single self-contained HTML file** with a size report vs network caps; tests assert zero external requests |
| A/B testing through variations | Every game ships **two live variants** (`?v=b`) selected from data-driven `SCRIPT` arrays — funnel, payouts and symbols swap without touching logic |
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
│   └── playable.js     ← universal MRAID / ad-network CTA + lifecycle + pause bus
├── vendor/             ← phaser.min.js, pixi.min.js (vendored, offline-safe)
├── build.js            ← single-file network packager → dist/
├── dist/               ← self-contained per-network builds (committed as proof)
├── test.js             ← headless Playwright suite (demos + variants + dist)
└── thumbnails/         ← landing-page screenshots
```

### Art & audio
Symbol art (cherry, lemon, bell, star, gem, coin) is **Twemoji** — open-licensed
vector art (**CC-BY 4.0**) rasterised to crisp 512 px PNGs via `rasterize.js` and
composited onto procedurally-drawn casino tiles. Everything else is generated at
runtime: the cabinet / wheel / foil framing, the jackpot **7**, and **all audio**
(spin whir, reel stops, coin clinks, win fanfare) synthesised with the **WebAudio
API** — no audio files at all. Total art weight is ~90 KB, so builds stay tiny and
instantly loadable — the single biggest factor in playable performance. Rebuild
the PNGs from the source SVGs any time with `node rasterize.js`.

### Universal CTA layer (`shared/playable.js`)
A playable usually ships to several networks from one build. `PlayableAd.install()`
detects the host environment and fires the correct redirect:

- **MRAID** (`mraid.open`) — IAB / ironSource / AppLovin / Vungle / Mintegral
- **Google AdMob** (`ExitApi.exit`)
- **Meta / Facebook** (`FbPlayableAd.onCTAClick`)
- **Unity Ads** (`install_url` macro)
- **AppLovin DAPI** (`dapi.openStoreUrl`)
- **`window.open` fallback** for preview / web

It also exposes `onReady()` (waits for DOM + MRAID `ready`), a **unified pause
bus** (`onPauseChange()` / `isPaused()`, fed by MRAID `viewableChange` *and* the
Page Visibility API), `variant()` for A/B selection, and a `track()` analytics hook.

**Viewability compliance:** networks preload playables off-screen and swipe them
in and out of view — a compliant playable must not run or make sound while hidden.
All three demos subscribe to the pause bus: the Phaser loop sleeps, the Pixi ticker
stops (with a pause-aware animation clock so tweens resume without jumping), the
vanilla rAF loop holds its frame, and the WebAudio context suspends.

## A/B testing

Each game ships **two live funnel variants**, selected by query string (`?v=b`) or
an injected `window.AB_VARIANT` global — the mechanism a network's creative-testing
pipeline would use:

| Demo | Variant A | Variant B |
|---|---|---|
| Slots | 2-spin funnel | [3-spin funnel with a near-miss](slots/index.html?v=b) — does tension lift CTR? |
| Wheel | 2-spin funnel | [1 spin, faster](wheel/index.html?v=b) — shorter time-to-CTA |
| Scratch | Gem prize, 25 000 | [Star prize, 50 000](scratch/index.html?v=b) — prize framing |

Outcomes are plain data arrays, e.g. the slot funnel:

```js
var VARIANTS = {
  a: [ { payline: [BELL, BELL, BELL], win: 800 },                        // teaser win
       { payline: [SEVEN, SEVEN, SEVEN], win: 25000, jackpot: true } ],  // mega win → CTA
  b: [ /* …adds a near-miss spin… */ ]
};
var SCRIPT = VARIANTS[PlayableAd.variant()] || VARIANTS.a;
```

Producing a new variant (win cadence, symbols, payouts, number of spins) is a data
change, not a code change — ideal for performance-driven iteration.

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

## Network packaging — single-file builds

Ad networks require a playable to be **one self-contained file with zero external
requests**. `node build.js` packages each demo that way — engine, shared modules,
game code inlined; PNG art embedded as base64 data URIs — and prints a size
report against the common caps (≤5 MB raw, ≤2 MB zipped):

| Build | Raw | Gzipped |
|---|---|---|
| [`dist/slots.html`](dist/slots.html) (Phaser 3) | 1.3 MB | **405 KB** |
| [`dist/wheel.html`](dist/wheel.html) (Pixi.js) | 476 KB | **143 KB** |
| [`dist/scratch.html`](dist/scratch.html) (vanilla) | 151 KB | **99 KB** |

The test suite loads every dist build headlessly and **fails if it makes a single
network request** — proving self-containment, not just claiming it.

- **MRAID** `mraid.js` is injected by the network at serve time — the code already
  guards for its presence.
- Per-network click protocols (Unity, AdMob, ironSource/AppLovin MRAID, Meta
  `FbPlayableAd`) are handled by the shared CTA layer; only the delivery wrapper
  (e.g. Unity's ZIP) differs per network.

## Testing

```bash
npm install          # playwright (dev-only; the playables have zero dependencies)
node build.js        # produce dist/ single-file builds
node test.js         # headless suite
```

The suite drives every demo end-to-end (spin/spin/scratch → end card), captures
screenshots, fails on any console error, covers **variant B** funnels, and asserts
the dist builds are fully self-contained.

## Tech

`HTML5` · `CSS3` · `JavaScript (ES5-safe)` · `Phaser 3.80` · `Pixi.js 7.4` ·
`Canvas 2D` · `WebAudio` · `MRAID`

## Credits & licenses

- **Symbol art** — [Twemoji](https://github.com/twitter/twemoji) © Twitter, Inc. and other contributors, licensed **CC-BY 4.0**. Source SVGs in `assets/svg/`, rasterised PNGs in `assets/`. See `assets/ATTRIBUTION.md`.
- **Phaser 3** (MIT) and **Pixi.js** (MIT) — vendored in `vendor/`.
- The jackpot 7, all framing/UI, animation and audio were authored for this project.
