# Adaptive HTML5 Playable Ads — Portfolio

Four lightweight playable ads built end-to-end: interaction design, animation,
creative configuration, lifecycle handling, single-file packaging and automated
QA. The featured project focuses on the word/puzzle loop; supporting work shows
breadth across Phaser, Pixi.js and raw Canvas.

**Live portfolio:** https://marvelousjade.github.io/playable-ads-portfolio/

| Demo | Implementation | Production focus | Build (gzip) |
|---|---|---|---:|
| **[Word Trails](word/index.html)** | Semantic HTML, CSS Grid/animation, JavaScript | Adaptive word-connect flagship, touch/mouse input, producer-authored level data | **13 KB** |
| **[Lucky Vegas Slots](slots/index.html)** | Phaser 3 | Reel animation, particles, bonus interaction | **407 KB** |
| **[Spin to Win](wheel/index.html)** | Pixi.js 7 | Procedural rendering, custom easing and animation clock | **144 KB** |
| **[Lucky Scratch](scratch/index.html)** | Vanilla Canvas 2D | Touch compositing and ultra-light delivery | **100 KB** |

Every project includes a complete interaction → feedback → end-card funnel and two
live creative variants (`?v=b`).

## Featured case study: Word Trails

Word Trails demonstrates how a calm mobile word loop can become a concise,
network-ready playable without copying a commercial title or promising a fake
reward. The player swipes letters, fills a crossword and grows a CSS-created
landscape before reaching a title-specific CTA.

Its composition **rearranges instead of letterboxing**:

- portrait: crossword above the letter wheel;
- landscape: crossword and wheel in side-by-side columns;
- short portrait: nonessential copy is removed and interaction surfaces become
  height-constrained;
- orientation can change mid-funnel without resetting completed words.

The same code handles mouse and touch through Pointer Events. Safe-area insets,
responsive typography and reduced-motion preferences are included. See the
[conversion case study](word/CASE_STUDY.md).

## How the portfolio maps to playable-ad production

| Responsibility | Evidence |
|---|---|
| Own playables end-to-end | Four concepts implemented, tested, packaged and deployed from one repository |
| JavaScript, HTML5 and CSS | DOM/CSS, Canvas 2D, Phaser and Pixi projects |
| Adaptive and cross-platform composition | Word Trails portrait/landscape/short-screen layouts plus automated resize and touch paths |
| JS/CSS animation | Crossword feedback, letter-wheel gesture, landscape progression, reels, wheel easing, scratch reveal and particles |
| Build scalable processes and tooling | Validated creative config, shared lifecycle/audio/CTA modules and a four-target single-file packager |
| Use AI in the development workflow | Structured candidate generation with deterministic validation and documented review boundaries in [`AI_WORKFLOW.md`](AI_WORKFLOW.md) |
| Performance optimization | 13–407 KB gzipped builds, local assets, procedural visuals/audio and no requests from dist output |
| Work with creative producers and artists | Hooks, levels, timings and end-card copy separated into a schema-backed creative file |
| Git and QA | Versioned source, reproducible npm commands, Playwright funnel tests and CI |

## Producer-facing creative configuration

Word Trails keeps campaign variation in [`word/creative.json`](word/creative.json),
not in interaction code. It controls:

- hook and instructional copy;
- letter wheel and valid words;
- crossword dimensions and cell paths;
- end-card copy;
- hint and transition timing;
- A/B variants.

[`word/creative.schema.json`](word/creative.schema.json) documents the format.
`tools/validate-creatives.js` also verifies rules that a basic schema cannot:
every word must be constructible from the wheel, coordinates must be in bounds,
and crossing cells cannot contain conflicting letters. The validator runs before
every production build.

This makes AI-authored or producer-authored candidates **untrusted inputs** until
they pass deterministic checks and visual/play review.

## AI-assisted workflow

AI is used during authoring for bounded tasks such as hook exploration, structured
level candidates, edge-case generation, refactoring and documentation. There are
no model calls, keys or AI dependencies in a shipped playable. Accepted decisions
are stored as versioned code/config rather than depending on chat history.

The complete workflow, representative structured request, validation boundary and
measurement policy are documented in [`AI_WORKFLOW.md`](AI_WORKFLOW.md). No
productivity percentage is claimed without a measured baseline.

## Shared production infrastructure

### Lifecycle and CTA layer — `shared/playable.js`

`PlayableAd.install()` provides guarded integration paths for common hosts:

- MRAID (`mraid.open`)
- Google/AdMob (`ExitApi.exit`)
- Meta (`FbPlayableAd.onCTAClick`)
- AppLovin DAPI (`dapi.openStoreUrl`)
- Unity install URL injection
- Mintegral URL handler
- browser preview fallback

Actual campaign URLs are intentionally configuration values and must be replaced
for delivery. Host integrations still require final validation in each network's
preview/certification environment.

The module also combines MRAID viewability and Page Visibility into one pause bus.
A shared pause-aware clock freezes gameplay transitions while hidden, preventing
a preloaded ad from advancing to a reward or end card off-screen. Rendering loops
and WebAudio subscribe to the same lifecycle.

### Procedural audio — `shared/sfx.js`

WebAudio synthesizes interaction, reel, wheel, scratch, coin and win feedback at
runtime. This avoids audio-file weight and decode requests while keeping mute and
viewability behavior centralized.

## Single-file packaging

Ad networks commonly require one self-contained artifact. `npm run build`:

1. validates creative data;
2. embeds JSON configuration;
3. inlines engine/shared/game scripts;
4. converts required PNGs to data URIs;
5. reports raw and gzip size against configured 5 MB / 2 MB caps;
6. writes each artifact to `dist/`.

Current output:

| Artifact | Raw | Gzipped |
|---|---:|---:|
| `dist/word.html` | 42 KB | **13 KB** |
| `dist/slots.html` | 1,318 KB | **407 KB** |
| `dist/wheel.html` | 481 KB | **144 KB** |
| `dist/scratch.html` | 156 KB | **100 KB** |

## Automated QA

`test.js` runs 13 browser scenarios:

- all four source playables;
- variant B for every playable;
- all four self-contained dist builds;
- the portfolio landing page.

The suite drives complete funnels, fails on page/console errors, captures initial
and end-card screenshots, exercises a touch PointerEvent path, changes Word Trails
from portrait to landscape mid-game, and rejects any external request made by a
dist artifact.

## Run locally

```bash
npm install
npm run serve       # http://localhost:8080
npm run validate    # creative/level checks
npm run build       # dist/*.html
npm test            # build + complete Playwright suite
```

## Architecture

```text
playable-ads-portfolio/
├── index.html
├── word/
│   ├── index.html
│   ├── game.js
│   ├── creative.json
│   ├── creative.schema.json
│   └── CASE_STUDY.md
├── slots/                 # Phaser 3
├── wheel/                 # Pixi.js
├── scratch/               # Canvas 2D
├── shared/
│   ├── playable.js        # CTA, lifecycle, pause-aware clock
│   └── sfx.js             # procedural WebAudio
├── tools/
│   └── validate-creatives.js
├── build.js
├── test.js
├── AI_WORKFLOW.md
├── dist/
└── thumbnails/
```

## Art and licensing

Word Trails uses project-authored CSS/procedural scenery and standard emoji glyphs.
Casino symbol art is Twemoji (CC-BY 4.0), rasterized from source SVGs and attributed
in [`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md). Phaser and Pixi.js are vendored
under their MIT licenses. All other framing, UI, animation and synthesized audio
were authored for this project.
