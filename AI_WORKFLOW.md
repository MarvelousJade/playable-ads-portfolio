# AI-assisted playable production workflow

This portfolio uses AI as a development accelerator, not as a substitute for
creative ownership or QA. AI assistance is kept in the **authoring workflow**;
the shipped playables contain no model calls, API keys or runtime dependency on
an AI service.

## Workflow used for Word Trails

1. **Constrain the brief first**
   - One-finger word-connect interaction
   - First interaction available immediately
   - Three successful words before the end card
   - Original identity and procedural/CSS artwork
   - Portrait and landscape composition without resetting play
   - One self-contained network file under the configured size cap
2. **Ask AI for structured candidates**
   - Candidate hooks, letter wheels and intersecting word grids are requested as
     JSON matching [`word/creative.schema.json`](word/creative.schema.json).
   - Code suggestions are requested in small, reviewable units rather than as an
     unbounded game rewrite.
3. **Reject invalid output deterministically**
   - [`tools/validate-creatives.js`](tools/validate-creatives.js) verifies that
     every word can be made from the wheel, cell counts match word lengths,
     coordinates stay inside the board, and crossing letters agree.
   - `npm run validate` is part of `npm run build`; an invalid candidate cannot
     be packaged accidentally.
4. **Review in context**
   - Candidate copy is checked for clarity and truthful framing.
   - Portrait, landscape and touch paths are exercised in Playwright.
   - The final interaction, timing, visual hierarchy and source remain the
     developer's responsibility.
5. **Preserve a reproducible artifact**
   - Accepted creative decisions live in versioned JSON rather than in a chat.
   - Builds, screenshots and test results can be reproduced from the repository.

## Representative structured request

```text
Create two word-connect creative variants as JSON.
Constraints:
- exactly five unique wheel letters;
- three common English words per variant;
- every word must be traceable without reusing a wheel position;
- words must share valid crossword cells in a 6x5 grid;
- copy must not promise real-world rewards;
- return data only, matching creative.schema.json.
```

The model output is treated as an **untrusted candidate**. For example, a model
may propose a repeated letter that is not available on the wheel or place two
different letters in one crossing cell. The validator catches those errors;
visual and gameplay review catches issues that schema validation cannot.

## Where AI is useful

- Exploring hooks and short funnel structures
- Drafting level/copy variants in a strict schema
- Generating edge cases for input and orientation testing
- Refactoring repetitive production code
- Reviewing screenshot matrices for clipped copy or weak hierarchy
- Drafting documentation and handoff checklists

## Where deterministic systems stay in control

- Store redirects and network SDK behavior
- Size limits and external-request checks
- Level validity
- Touch hit testing
- Lifecycle pause/resume behavior
- Final claims, licensing, accessibility and creative approval

## Measurement policy

No productivity percentage is claimed without a recorded baseline. For a real
campaign, the production log should capture brief receipt, first playable,
first review and approved export times so AI-assisted throughput can be compared
honestly across multiple creatives.
