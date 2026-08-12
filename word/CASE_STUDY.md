# Word Trails — playable conversion case study

## Brief

Demonstrate how a calm mobile word-game loop can become a short HTML5 playable:
retain the satisfying letter connection and board completion, provide visible
scene progression, and reach a focused install decision without misleading
currency or reward claims.

The concept uses an original name, visual identity and CSS-created landscape.
It is not an advertisement for, or copy of, an existing commercial title.

## Funnel

1. The crossword, letter wheel and objective are visible on the first frame.
2. The player swipes three words; every accepted word fills the board and grows
   another flower in the landscape.
3. The layout can change orientation mid-session without resetting found words.
4. Completing the board opens a title-specific end card whose CTA is the only
   install target in the overlay.

## Composition

This playable rearranges rather than letterboxes:

- **Portrait:** crossword above the letter wheel.
- **Landscape:** crossword and wheel become side-by-side columns.
- **Short portrait:** decorative copy is removed and both interaction surfaces
  are constrained by viewport height.
- Safe-area environment variables protect controls on notched devices.

Typography, board cells, wheel controls and spacing use independent responsive
rules. The gameplay model is DOM-independent, so resizing does not reset state.

## Producer-facing variation

[`creative.json`](creative.json) controls hooks, instructions, wheel letters,
board dimensions, word paths, end-card copy and timing. Variant B is available
with `?v=b`. [`creative.schema.json`](creative.schema.json) describes the handoff
format and the repository validator checks semantic word-grid rules that JSON
Schema alone cannot express.

## Implementation

- Semantic HTML controls and Pointer Events for mouse/touch input
- CSS Grid for the crossword and adaptive composition
- CSS animation for feedback, progression and end-card motion
- Shared WebAudio effects, CTA adapter and viewability lifecycle
- Pause-aware gameplay transitions
- Single-file build with embedded creative JSON and no external requests
- Playwright paths for portrait, landscape, touch, both variants and dist output

## Next campaign tests

- Two completed words versus three before the end card
- Progression-led hook versus relaxation-led hook
- Automatic first-letter hint timing
- Letter-wheel scale on short landscape inventory

These are proposed experiments, not claimed performance results.
