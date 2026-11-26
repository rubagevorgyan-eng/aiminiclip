# Progress

## Stage 1: project setup (done)
- Vite 5 + React 18 + TypeScript 5 project in `deepcut/`, minimal deps.
- Central config (`src/config/game.ts`): 7 rounds, 25s, six rarity tiers (10 to 100 pts), six depth zones with titles.
- Base styling: palette tokens, Chakra Petch (display) + Inter (body), reset, focus and reduced-motion rules.
- Shell screen with logo, tagline and mineral tiers. Typecheck, build and dev server verified.

## Stage 2: core gameplay engine (done)
- Pure reducer state machine with timestamp deadlines (countdown 3s, question 25s, result 1s), auto-advance, 7 rounds, score capped at 700 (1 pt = 1 m).
- Typed answers, Enter submits, wrong answers retry, first correct answer locks the round, skip/timeout = 0. Late or duplicate submits and out-of-phase events are ignored.
- Exact alias matching with case/punctuation/accent normalization (fuzzy matching deferred).
- 7 temporary test questions; basic functional UI.
- 8 engine tests pass (`npm test`); full 7-round loop played in the browser (correct, wrong-then-retry, duplicate Enter, skip, timeout, alias answers): 305/700 as expected.

## Stage 3: question bank + answer validation (done)
- 50 curated questions (5 in each of 10 categories) in `src/data/questions/*.json`, 1,136 answers. Bounded lists are complete (e.g. all 151 Gen I Pokémon, all 14 one-letter elements, all F1 champions to 2025). Time-sensitive questions say "up to 2025".
- Uncertain answers were dropped (e.g. GTA VI, Toy Story 5, The Odyssey, Acura/Scion under "founded in Japan" reworded).
- Validator: normalization, aliases/abbreviations, plurals, conservative typo tolerance, per-question ignore/reject lists. Temporary test questions removed; game draws 7 random bank questions.
- 13 tests pass (bank integrity, every alias, accepted variants and typos, rejected near-misses, cross-question sweep with 0 false accepts). Build passes; spot-checked in the browser.

## Stage 4: visual foundation (done)
- Design tokens and reusable UI kit (buttons, input, panel, tags, feedback, eyebrow labels), Unbounded + Inter.
- DEEPCUT wordmark with a pixel-cut diamond; pixel gem icon tinted per mineral; stone-grain background, amber lamp glow, drifting dust specks, pixel rock strata.
- Restyled home, countdown, question, round result ("EMERALD DISCOVERED / LEGENDARY ANSWER / +85m"), and final screens. Round pips show each round's mineral; amber timer bar turns red in the last 5s; wrong answers shake the input.
- Responsive to 375px with no horizontal scroll; reduced-motion respected. No gameplay changes; tests and build pass.

## Stage 5: animated mine (done)
- Canvas mine beside the question (above it on phones): six procedurally generated zones with jittered boundaries (dirt/roots/coal, copper, slate/silver, gold veins, emerald crystal shards, obsidian with glowing diamonds), headframe and night sky at the surface, timbered shaft, seeded so the mine is always the same.
- Pixel miner (yellow helmet, headlamp, pickaxe): idle bob, pickaxe swing on correct answers, rock and mineral particles, flash/shake for gold+, eased descent (longer for bigger finds), animated depth counter and zone label, darkness deepening with depth plus headlamp glow.
- Effects scale with rarity (measured 13 particles for coal vs 88 for diamond). Reduced motion: no particles/shake/twinkle, short move. Runs on its own clock; gameplay never waits on it.
- 16 tests pass, build passes; checked on desktop and 375px.

## Stage 6: gameplay screen polish (done)
- Desktop: compact centered layout, trivia left, mine right. Header: wordmark, "Round n/7" + 7 history gems, settings menu (reduce motion, abandon dig). Mine overlay shows minerals found, zone, animated depth.
- Result card: mineral discovered, canonical answer, rarity, +meters. Effects grow by tier: copper/silver border, silver+ sheen, gold+ glow, emerald/diamond pulsing gem + sparkles.
- Wrong answers: instant shake + message, text stays selected for retyping, timer untouched. Rounds fade in.
- Phone: mine band above trivia, layout fits the visible viewport (no page scroll at 375x812 or 375x460), mine shrinks when the keyboard is open, 52px touch targets.
- No sound toggle yet: there is no audio until the audio stage. Tests and build pass.

## Stage 7: home screen + game modes (done)
- Home: wordmark, tagline, best depth, daily streak, Daily Dig (primary) / Unlimited Dig, How to Play modal, Statistics and Collection pages, sound toggle, ambient mine tour.
- Daily Dig: 7 questions seeded by UTC date + bank version, one recorded completion per day, countdown to the next one, view today's result again. In-progress daily saved after every change: refresh resumes the same question and deadline; reopening after a deadline times that round out and continues; an unfinished earlier day is closed out and recorded. Ending a daily early counts as the attempt.
- Unlimited: 7 random, no duplicates, avoids the last 21 played.
- Versioned LocalStorage with in-memory fallback; corrupt data resets to defaults.
- Minimal synthesized sound effects so the sound toggle is real (audio polish is still its own stage).
- 26 tests pass, build passes. Browser-tested: daily start, refresh resume, reopen after deadline, end early, view result, stale day, two unlimited games, stats, collection, modal, sound toggle, corrupt storage, desktop + 375px.

## Stage 8: results, stats, collection, sharing (done)
- Results: count-up depth, achievement title + deepest zone, score /700, correct /7, rarest answer, minerals discovered, new personal best badge, 7-round breakdown (question, canonical answer + what you typed if different, rarity, meters, 3 other accepted answers), Share / Play again / Return home; daily shows the next-dig countdown.
- Share text: mode, daily number + date, depth, rank, seven squares (🟫🟧⬜🟨🟩🟦, ⬛ miss), tagline. Tested to contain no answers or questions; manual-copy modal if the clipboard is blocked.
- Six distinct pixel mineral icons; undiscovered = dark silhouette. Stats: games, best, average, current/longest streak, total correct, per-rarity counts.
- Each game id is counted once (refresh-safe). 31 tests pass, build passes; browser-tested desktop + 375px.

## Stage 9: game feel (done)
- Sound set (synthesized): button tap, correct chime, wrong buzz, pickaxe impact + rock break, discovery arpeggio scaled by rarity, distinct emerald (shimmering bell chord) and diamond (glissando, sparkle pings, bright chord), rising last-5-seconds ticks, timeout, completion fanfare scaled by zone. Persistent mute; no audio before the first interaction.
- Animation: smooth timer bar, softer button press, smoother wrong-answer shake, "+Nm" float in the mine, points count-up, discovery ring reveal, sparks and panel glow for rare finds, sub-pixel mine scrolling. Reduced motion respected.
- Verified by instrumenting Web Audio (sounds per event: wrong 2, coal 5+2 noise, diamond 23+2 noise, mute 0, ticks + miss 7, fanfare), timer animation, floats, bursts, celebration, reduced-motion fallbacks. Balance not checked by ear (no audio output in the test browser). 31 tests pass, build passes.

## Stage 10: final QA (done)
- Passed: 34 unit tests (engine, matching, bank integrity, selection, progress/streaks, saved daily, results/sharing, terrain); typecheck + production build; full QA on the production build in the browser (daily, refresh mid-question, expired timer, end-of-daily recording, refresh on results, unlimited, stats, collection, sharing, keyboard, desktop + 375px, no console errors). Bank reviewed for factual errors: none critical found.
- Fixed: text contrast below WCAG AA (Coal tag, faint text); settings popover used menu roles for checkboxes; sound button label changed with state; home had no h1; removed dead `SHARE_LEGEND`, the dev-only `window.__mine` hook and a stray lint comment.
- Added: tests for saved-daily resume/corruption and per-tier scoring; favicon, title, description, Open Graph/Twitter metadata, social image; relative `base` for any static host; `vercel.json`; README.
- Known limitations: see README.

## Stage 11: full-screen mine layout + autocorrect (done)
- The mine is now a full-screen animated background behind every screen (touring on menus, following the dig in play, dimmed behind results). Questions and results float over it in a card; HUD on top (round, minerals found), depth/zone readout, answer dock at the bottom with the countdown. Inspired by the layout of a reference recording; all art and styling are DEEPCUT's own.
- "Did you mean…?" autocorrect for near-miss answers; Enter or tap to accept. Tested so it prefers a 1-letter slip over a longer title, rejects ambiguous and known-wrong answers.
- 35 tests pass; production build checked on desktop, 375x812 and a keyboard-height 375x460 viewport; no console errors.

## Stage 12: leaving restarts (done)
- Reloading the page or leaving to the Recess homepage now always returns to DEEPCUT's home screen; in-progress digs are no longer saved or resumed. Only finished digs are recorded; an unfinished Daily Dig can be restarted. "Abandon dig" returns home for both modes.
- Removed the saved-game module (`activeGame.ts`) and the engine's LOAD / FORFEIT / catchUp with their tests; the legacy save key is cleared on load. 30 tests pass.

## Stage 13: site header (done)
- Transparent header on every screen: animated Recess logo (back to the site), sound, settings and an "Exit game" button to the Recess homepage. Round, home and results layouts sit below it; phone layout still fits without scrolling. 30 tests pass.

## Stage 14: volume control (done)
- The sound button opens a volume bar on hover/focus (first tap on touchscreens); dragging or arrow keys set the volume with a preview tick, clicking the speaker mutes/unmutes, the icon shows muted/low/high. Volume persists; audio uses a perceptual curve. Phone header stays within the screen. 30 tests pass.
