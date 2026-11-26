# DEEPCUT

Browser trivia game: rare correct answers mine deeper underground. Tagline: "The deeper your knowledge, the deeper you go."
Lives in `deepcut/` inside the Recess static site repo. Stack: Vite + React + TypeScript + plain CSS + LocalStorage. No backend.

## Rules (permanent)
- Minimize token consumption. Read only files relevant to the current task.
- Reuse existing components and functions. Never rewrite working features unnecessarily.
- Avoid unnecessary dependencies and overengineering.
- Keep explanations and progress reports brief.
- No paid APIs or external AI services (including for answer validation).
- Fix errors introduced by your changes.
- Work only on the requested development stage. Do not start the next stage without instruction.
- Keep game logic separate from UI. Centralize configuration.
- Maintain responsive desktop and mobile support.
- Update PROGRESS.md (concisely) after each stage.

## Layout
- `src/config/game.ts`: all gameplay constants, rarity tiers (points = meters), depth zones, brand strings.
- `src/styles/base.css`: design tokens (palette, fonts), reset, reduced-motion.
- `src/engine/`: pure game logic, no React. `machine.ts` (reducer state machine: HOME -> COUNTDOWN -> QUESTION -> ROUND_RESULT -> FINAL_RESULTS; timestamps passed in on events; invalid events return the same state), `match.ts` (answer validation, see below), `types.ts` (Question/Answer).
- `src/hooks/useGame.ts`: React glue; a single interval runs only while a phase has a deadline.
- `src/data/questions/*.json`: question bank, one file per category. `src/data/questions.ts` imports them, exports `QUESTIONS`, `checkBank()` (integrity) and `randomQuestions()`.
  Question: `id`, `text`, `category`, `difficulty`, `answers[{name, aliases?, rarity}]`, optional `ignore` (words dropped when matching, plural too) and `reject` (wrong answers never accepted).
  Rarity is curated (no player statistics). Add questions by editing JSON; a new category = new JSON file + one import.
- Answer validation (`match.ts`): normalize (case, accents, punctuation, `&`, St/Mt, roman numerals to digits, leading "the"), exact match on names/aliases (also space-free and simple plurals), then typo tolerance only if guess and answer are both 7+ letters (1 edit, 2 from 11+), same first letter, same numbers, single closest answer. Uncertain = reject.
  Tests enforce: every alias matches, no alias collisions, and no answer from another question is accepted as a typo.
- `src/components/Game.tsx`: picks a screen per engine phase (no logic). Screens in `components/screens/` (+ `screens.css`).
- UI system: `src/styles/base.css` (tokens: palette, type scale, 4px spacing, radius 2px, stone grain + lamp glow), `src/styles/ui.css` (btn primary/secondary/ghost, field, panel, tag, eyebrow, feedback, wordmark, gem, backdrop). Components in `components/ui/`: `Wordmark`, `Gem` (pixel SVG tinted by rarity color), `Button`, `RarityTag`, `Backdrop` (dust specks + pixel strata).
- Fonts: Unbounded (display, numbers) + Inter (UI text). Rarity colors only come from `config/game.ts`.
- Tests: `src/**/*.test.ts`, Node's built-in test runner with type stripping (no test deps). Engine files import with `.ts` extensions so Node can run them directly.
- `src/mine/`: the mine scene. `terrain.ts` (pure: scale constants, zone looks, seeded noise, zone lookup; tested), `world.ts` (builds the whole mine once into a cached 96px-wide offscreen canvas), `sprites.ts` (miner pixel grid, pickaxe poses), `renderer.ts` (`MineRenderer`: own rAF loop, `dig(depth, tier)` = swing, particles scaled by tier, eased descent; `reset(depth)`; lighting; reduced motion = no particles, quick move). `components/MineScene.tsx` wraps it; depth counter and zone name are DOM overlays updated from the loop.
- `src/storage/settings.ts`: persisted player settings (`reduceMotion`), `useSettings()`; sets `html[data-motion]` which base.css honors like the system preference. `components/ui/SettingsMenu.tsx` in the round header (reduce motion, abandon dig).
- `src/hooks/useKeyboardInset.ts`: sets `--vvh` (visible height) and reports an open on-screen keyboard; the phone round layout fits `--vvh` and shrinks the mine while typing.
- Global CSS is imported in `main.tsx` before `App` so component CSS can override it.
- Modes (`components/Game.tsx` routes screens, owns persistence): Daily Dig = `dailyQuestions(utcDateKey)` from `data/selection.ts` (seeded by `BANK_VERSION` + UTC date; bump `BANK_VERSION` when the bank changes); Unlimited = `unlimitedQuestions(recent)` avoiding the last 21 played.
- Storage (`src/storage/`, all via `storage.ts` safe KV with in-memory fallback; corrupt/unknown data = defaults): `progress.ts` (`deepcut.progress.v1`: lifetime stats, tier counts, daily results + streak recomputed from results, recent ids), `activeGame.ts` (`deepcut.activeDaily.v1`: in-progress daily snapshot with deadlines; resumed on load via engine `LOAD` + `catchUp`; an unfinished earlier day is closed with `FORFEIT` and recorded), `settings.ts` (`reduceMotion`, `sound`).
- Abandoning a Daily Dig forfeits it (counts as the day's attempt); abandoning Unlimited just returns home.
- `src/engine/results.ts` (pure, tested): `achievement(depth)` (title + zone from `ZONES`), `rarestRecord`, `otherAnswers` (rarest/middle/common examples), `shareText` (mode, daily # + date, depth, rank, 7 squares; never answers). Clipboard via `utils/clipboard.ts` with a manual-copy modal fallback.
- `components/ui/MineralIcon.tsx`: six distinct 12x12 pixel minerals (coal lump, copper ore, silver ingot, gold nugget, emerald crystal, diamond), colored from rarity config; `locked` = dark silhouette. Used everywhere a mineral is shown; `Gem` is only the wordmark's diamond.
- Progress `recorded` (last 60 game ids; `daily:<date>` or a UUID per unlimited game) makes counting idempotent.
- `src/audio/sfx.ts`: Web Audio synthesis through one master gain + compressor. `playClick` (Button does it unless `silent`), `playWrong`, `playMiss`, `playTick(secs)` (rising), `playFind(tier)` (confirm chime, pickaxe impact + rock-break noise at the renderer's strike time `STRIKE`=0.26s, arpeggio that grows with tier, own signatures for emerald and diamond), `playComplete(zone)`. Never plays before the first user gesture (`navigator.userActivation`) or when `settings.sound` is off.
- Feel: the timer bar is one CSS `drain` animation started at the stored deadline offset (reduced motion: follows the tick via `--left`). Mine camera is sub-pixel (buffer has a spare row). `MineScene` floats "+Nm" at the strike. Result card counts points up, opens a ring (second ring for gold+), sparks for gold/emerald/diamond, panel glow for emerald/diamond.
- Screens: Home (ambient `MineScene`), HowToPlay modal (`ui/Modal` = native dialog), Stats, Collection, Countdown, Round, Final (also used to view a past daily).

## Commands (run in `deepcut/`)
- `npm install`, `npm run dev` (port 5174), `npm test`, `npm run build` (typecheck + build to `dist/`), `npm run preview` (port 4174). See README for deploy and adding questions.

## Deployment
Vite `base` is `./` (relative), so `dist/` runs at any path. `vercel.json` (Root Directory `deepcut`) or any static host. `public/` holds `favicon.svg` and `og-image.jpg`.
