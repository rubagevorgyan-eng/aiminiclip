# $20 Anime Battle — standing rules

Read `PROJECT_PLAN.md` first (architecture, rules, methods, test results). `DATABASE_PROGRESS.md` is generated.

## Eligibility and power scaling
- Canonical anime, manga and manhwa characters and forms are eligible (latest released forms by default). No fan-made,
  hypothetical, leaked or non-canonical content; never merge continuities or mix abilities across forms.
- **Anime + Manga + Manhwa** is the default; **Anime only** must stay spoiler-free (only `shown` / `anime-only`
  versions; no manga-derived stats, notes or sources shown during play).
- VS Battles Wiki is the primary reference (profile **key** = version); official material when it is missing or
  ambiguous. Keep VS assessments (`stats`), canon citations (`canon`) and game scores (`game`) separate.
- Never fabricate statistics, profiles, URLs or verification results. Unknown = `null`, never 0. Ambiguous tiers go to
  `needs-review`; only `verified` entries are playable by default.
- Stars/score come only from `data/config.js` + `data/engine.js`; never tune strength for balance, popularity or how
  often a character appears. Appearance probability lives only in `config.draw` + `data/draw.js`.

## Architecture rules
- Auction rules only in `data/auction.js`; setup/modes in `data/setup.js` (new mode = a `MODES` entry); saves, undo,
  timer and hidden-info rules in `data/session.js`; results in `data/results.js`. The page only renders and dispatches.
- Anything shown during Blind/Mystery goes through `VIS()` in `index.html`.
- Matches keep their own score snapshot; results and match history are rendered from stored summaries.
- `data/characters/<series>.js` is generated: `node tools/build-data.mjs --series <ids>` (series registry in
  `config.series`; reviewer-checked versions in `tools/spec/verified.mjs`).

## Don't change without being asked
Classic rules ($20, 5 per team, 3 skips each, 5 master skips, unlimited gifts, highest total power wins with the
existing tiebreak), green gift / red skip buttons, the Underground Arena design tokens and rarity colours.

## Before committing
Run `node tools/check.mjs`, `node tools/test-auction.mjs`, `node tools/test-setup.mjs`, `node tools/test-session.mjs`,
`node tools/test-results.mjs`, `node tools/simulate.mjs` (all must pass) and `node tools/report.mjs`; check the page
in the preview at 390, 768, 1024, 1280×720 and 1440 widths. Keep the homepage section and the single `GAMES.push` line
conflict-free with other branches.
