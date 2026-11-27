# CIPHER — Progress & Decisions

**Current status (2026-11-27):** all stages 0–12 complete and tested locally. Not deployed. Blockers: Cloudflare deployment (account and approval), 0/68 original portraits, and manual playtesting. See Stage 12.

Requirements: `CIPHER_SPEC.md`. Keep this file short and update it after each stage.

## Stage 0 — Inspection & plan (done, 2026-11-27)

### What exists
- **Site:** static site branded *Recess* (`index.html`, `assets/*.css|js`), hosted on **Netlify** (`netlify.toml`: publish `.`, no build command). No backend, no serverless functions, no database.
- **Games:** each one lives in `games/<slug>/` as self-contained static files (`five-letters`, `needle-drop`, `best-anime-character`). Most are single-file vanilla JS.
- **Deep Cut:** single-player trivia game. Source is a **Vite + React 18 + TypeScript + plain CSS** app in `deepcut/`. `npm run publish:site` builds it into `games/deep-cut/` for Netlify. Tests use Node's built-in runner. **It is committed only on the local, unpushed branch `krill`**, so it is not on `main` or `cipher`. On `wordle` it was untracked and now sits in `stash@{0}`.
- **Reusable from Deep Cut:** `SiteHeader`, `RecessLogo`, `Button`, `Modal`, `SoundToggle`, `SettingsMenu`, `audio/sfx.ts`, `storage/storage.ts` (safe KV), `utils/clipboard.ts`, `hooks/useKeyboardInset.ts`, and the `base.css` / `ui.css` token pattern.
- **Multiplayer precedent:** Five Letters VS Mode uses **PeerJS** (WebRTC, public PeerJS broker, loaded from unpkg). The host's browser runs the lobby. That code is inline in its HTML and can't be reused as a module.

### Architecture decision (proposed, awaiting approval)
- **Client:** new `cipher/` Vite + React + TS app that mirrors Deep Cut's layout (`config/`, `engine/`, `components/`, `styles/`). `publish:site` builds it to `games/cipher/`. Netlify hosting stays unchanged.
- **Real-time:** an authoritative **room server on Cloudflare Workers + Durable Objects** (one object per room, WebSockets with hibernation) in `cipher/server/`. The server holds the full board and sends each client a **role-filtered view**, which is what Rule 5 needs. It is free-tier capable, and `wrangler dev` runs it locally with no account.
- **Rejected:** PeerJS host-authority. The host's browser would hold every card identity (breaks Rule 5), the room dies when the host leaves, and there's no TURN server, so some networks can't connect. Also rejected: Netlify Functions (no WebSockets) and Firebase/Supabase (hiding the key needs server functions, often on a paid tier).
- **Shared engine:** pure TS rules (board generation, turns, reveal, win/loss, view projection) imported by both server and client, and tested with `node --test`.
- **Independent from Deep Cut (decided 2026-11-27):** Cipher stays on `cipher` (from `main`) and does not depend on `krill` or `deepcut/`. Its UI primitives are its own, styled for the Cipher theme and reused across Cipher. Site-level pieces come from the shared `assets/` (e.g. a React port of `assets/logo.js`, as Deep Cut did). Deep Cut code may be used as a pattern reference, never imported.

### Open questions / blockers
1. ~~Brand~~ — resolved 2026-11-27: CIPHER is a Recess game (sibling of Deep Cut), served at `/games/cipher/`.
2. ~~Base branch~~ — resolved: stay independent (see above).
3. **Infrastructure:** a free Cloudflare account is needed only at deploy time. Free-tier limits must be checked then. Nothing is purchased.
4. **Vocabulary:** 10,000 *board-suitable* words is a large curation job. The sources need clear open licences (word frequency plus concreteness lists). Expect a build script with filters, tests and manual review passes.
5. **Portraits:** "original illustrated" art with no paid AI. The proposal is a procedural SVG portrait kit (faces, hats, coats, glasses, palettes), seeded per card. Alternative: owner-supplied artwork.
6. **Naming:** "Duet" is also an official Codenames product name. Consider an original mode name.

## Stage 2 — Foundation (done, 2026-11-27)

**Built:** an isolated `cipher/` app (Vite 5 + React 18 + TS 5.6, the same pinned versions as Deep Cut, no new dependencies). It is published to `games/cipher/`, which is the route at `/games/cipher/`. Rooms live on the same page at `?room=CODE`, so invite links work on Netlify without rewrites.

**Layout (`cipher/src/`):**
- `shared/`: code both the client and the room server use. `types.ts` holds every data model (players and guest sessions, rooms and settings, teams and roles, match ids, board dimensions, cards, secret and revealed identities, clues, guess history, turn state, suggestions, chat, results, host/reconnect). `config.ts` holds the brand, board sizes, card-layout formula, Duet key, timers (unlimited by default), limits and storage keys. Plus `random.ts`, `ids.ts`, `board.ts` and `text.ts`.
- `engine/`: `phases.ts` (lobby → awaiting_clue → guessing → sudden_death / paused → completed), `modes/` (one `ModeDefinition` interface; Classic and Custom share `competitiveMode`, Duet has its own) and `projection.ts`.
- `server/room.ts`: server-only room and guest-session creation. Never imported by the client.
- `net/`: `protocol.ts` (versioned client and server message types), `connection.ts` (the `RoomConnection` interface plus the `VITE_CIPHER_SERVER` URL), `links.ts` (invite links).
- `vocab/`: vocabulary types and `drawWords`. `art/portrait.ts`: portrait types.
- `client/`: `App`, `route.ts`, components `Button`, `Dossier` and `Wordmark`, screens `HomeScreen` (mode files, join by code) and `RoomScreen` (placeholder). `styles/base.css` and `ui.css` hold the tokens and primitives, all scoped to the Cipher page.

**Decisions:**
- **Public vs private:** `PrivateMatchState` and `ServerRoom` stay on the server. Clients only get a `ClientView` from `projectView`, which copies fields one by one. Seeds, keys, portrait seeds and tokens are never included. Handlers get the competitive key; each Duet player gets only their own side. The whole key is "declassified" only when the match is completed. Suggestions are visible to the suggesting team and to spectators. Portraits travel only inside a revealed card. Tests assert all of this.
- **Terms:** handler / operative / spectator; Crimson and Cobalt bureaus; agent / civilian / mole; Duet stations North and South.
- **Card layout:** competitive boards use our own formula (5×5 → 9/8/7 civilians/1 mole; 10×10 → 34/33/30/3). Duet: 8 agents per side, 3 shared, 2 moles per side, 9 turns. All of it is in config.
- **Site header:** reuses the shared `/assets/logo.js` and `recess.js`, with no copy of the logo. In dev, `vite.config.ts` serves `../assets` at `/assets`.
- **Recess integration:** the first "Locked" tile on the homepage is now the Cipher tile (`index.html`), and Cipher is added to the game list in `assets/recess.js` (on its own line). Nothing else on the site changed.

**Changed outside `cipher/`:** `index.html` (one tile), `assets/recess.js` (one entry), and the new `games/cipher/` (build output).

**Checks:** `npm run typecheck` ✔, `npm test` 14/14 ✔, `npm run build` ✔ (expected warnings for the two classic site scripts). The page, the join route and the homepage tile were checked in a browser on desktop and mobile. Other games have no test suites.

**Remaining dependencies:** the room server runtime (Cloudflare Workers + `wrangler` dev dependency, multiplayer stage); the vocabulary bank; portrait art; the terminal animations. `.claude/launch.json` was restored from the wordle stash only for local preview.

## Stage 3 — Visual design system (done, 2026-11-27)

**Built:** the full Cipher design system and gameplay layout, documented in `CIPHER_DESIGN.md` (palette, type, components, breakpoints, focus/zoom). No new dependencies, no live multiplayer, no portraits.

**Changed/added (all in `cipher/` except the published build):**
- **Styles:** rewrote `styles/base.css` (new palette, fonts, grain) and `styles/ui.css` (primitives); added `styles/game.css`. Fonts in `index.html` are now Cinzel, Barlow Condensed, IBM Plex Mono and Inter.
- **Components:** added `CipherLogo`, `Icons`, `Stamp`, `Segmented`, `Modal`, `Toasts`, `WordCard`, `RevealedCard`, `Board`, `ScoreCounter`, `TeamPanel`, `PlayerList`, `ClueDisplay`, `ClueComposer`, `GuessControls`, `RoomControls`, `ChatPanel`, `HistoryLog`, `SidePanel` and `MissionReport`. Updated `Button` and `Dossier`; removed `Wordmark`.
- **Helpers and screens:** `client/game/identity.ts` and `derive.ts`; `screens/GameScreen.tsx`. `HomeScreen` uses the new logo. `App` adds `ToastProvider` and the dev-only lab.
- **Dev fixtures:** `client/dev/fixtures.ts`, `DesignLab.tsx`, `lab.css` and `fixtures.test.ts`.
- **Outside `cipher/`:** `games/cipher/` (republished build) and `.claude/launch.json` (added `cipher-dev`).

**Decisions:**
- Green is no longer in the permanent UI. Primary actions and selection are brass. `--term` stays reserved for the animation stage.
- Fixtures go through the real `projectView`, so the lab's operative view is exactly what a real operative receives. Tests cover every board size.
- Large boards (8×8 and up) move the team panels above the board on wide screens. Phones scroll large boards inside the frame, with zoom and focus mode.
- `GameScreen` only renders and sends `ClientMessage`s; all rules stay with the server.

**Checks:** typecheck ✔, tests 16/16 ✔, build ✔. The production bundle contains no fixture code, fixture words or lab CSS (grep), and `?lab` is ignored in production. The browser checks were desktop 1280 and 1440, phone 375, Classic, Duet and Custom 10×10, all perspectives and phases, focus and zoom, side panel dock/drawer/sheet, and the report modal, with no console errors.

**Remaining dependencies:** portrait art (the portrait window is a placeholder), terminal animations (`--term`), live room wiring for `GameScreen`, and the lobby screens.

## Stage 4 — Main menu & lobby (done, 2026-11-27)

**Built:** the main menu and the full lobby flow for Classic, Duet and Custom, against a defined service interface. Real-time play is still not live: production says so honestly, and dev builds use a clearly labeled in-tab fixture service.

**Main menu (`HomeScreen`, `screens/menu/`):**
- Logo, the new tagline ("Trust your team. Question every word."), and three selectable mode files.
- Create Room (code name + mode), Join Room (code name + access code), How to Play (original briefing), and Settings (code name, reduce motion; device-only).

**Room flow (`RoomScreen`):**
- `?room=CODE` invitation links go through a name gate (if no name is saved), then connecting, then the lobby or game.
- Explicit states: invalid code (with re-entry), not found, expired, full, spectators off, removed, connection failed (Retry), update needed, and unavailable (no room server yet).

**Lobby (`LobbyScreen`):**
- An access-credential code card with copy code / copy invite link.
- Classic and Custom: Crimson and Cobalt panels with a Handler slot (exactly 1) and an Operatives slot (1 or more).
- Duet: Partner A and Partner B (at least 1 each).
- An Observers area, and mission parameters: game type, board, word packs, difficulty, moles, clue/guess timers, first turn and spectators. Only the host can edit; everyone else sees them read-only.
- Start is disabled with every reason listed. Host controls: shuffle teams, remove player (confirm), make host, change settings, spectator permission, start. Leave room (confirm) and room chat.

**Service layer:**
- `net/service.ts` (`RoomService`, `RoomErrorCode`, `RoomError`). `RoomConnection` gained `onFailure`.
- `client/services.ts` loads the service: in production none exists until Step 7; dev builds lazy-load `client/dev/devRoomService.ts`.
- `client/storage.ts` holds the code name, device settings and guest sessions (server-issued player id + token per room, 24h TTL, pruned, removed on leave).

**Shared rules:**
- `engine/lobbyRules.ts` (`startBlockers`, `settingsProblems`) is used by the UI and the server.
- `server/lobby.ts` (`applyLobby`: rename, seat, settings, shuffle, kick, transfer host, leave with host hand-off, chat, start) is pure, validates everything, and is run by the dev service. Step 7's server will reuse it.

**Model and config changes:**
- `RoomSettings` gained `wordPacks`, `difficulty` and `moles`.
- Config gained `WORD_PACKS` (planned pack ids until the vocabulary stage), `DIFFICULTIES` and `moleRange`.
- Duet labels are now Partner A / Partner B, and Duet allows 1+ players per partner.
- Protocol gained `shuffle_teams`, `kick` and `leave`, plus error codes `room_expired` and `kicked`.
- Modes gained `summary`, `configurable` and `startBlockers` (all reasons).

**Fixes to earlier components:**
- `Modal` now focuses the first field on open; before, Enter hit the close button.
- `Segmented` gained a `disabled` prop.

**Dev fixture service:**
- One simulated room per tab (sessionStorage) using the real lobby rules and projection. A toolbar (`DevLobbyTools`) adds fixture players, fills required seats, and acts as any player.
- Demo codes: `EXPRD` = expired, `NETDN` = connection failure.
- Start reports that match start arrives with the engine stage.
- It is absent from production bundles (checked).

**Decisions:**
- Kept **Recess** branding (decided earlier in this project) rather than "Deep Cut".
- Kept the original **Handler** term (labeled "gives clues") instead of "spymaster", to avoid Codenames vocabulary.
- New joiners enter as observers and pick a seat. Turning spectators off blocks Start until everyone is seated.

**Checks:** typecheck ✔, tests 23/23 ✔ (lobby rules, seating, host-only actions, shuffle, settings validation, mode switch, Duet, spectators off, leave/host hand-off, no tokens in views), build ✔.
- Browser (dev): create room, empty-name error, seat/handler rules, fill seats → Start enabled, non-host read-only view, shuffle, remove with confirm, Custom options and validation, Duet, all error states, reload reconnect, invite join as a new guest, leave, how to play, settings, phone layout.
- Browser (production build): an invite link shows the name gate, then "Online rooms are not open yet", with no dev tooling.

**Remaining for Step 7:** a live `RoomService` (WebSocket to a Cloudflare Durable Object running `applyLobby` and `projectView`), server-side session checks and expiry, rate limits, and match start via the engine.

## Stage 5 — Classic competitive engine (done, 2026-11-27)

**Engine status:** the competitive rules are complete and deterministic. Rules and fairness policy are in `CIPHER_RULES.md`.
- **`src/engine/clues.ts`:** `validateClue` (empty, multi-word, number 0–9 or ∞, board words and obvious forms via `stem`, warnings for compound containment and digits).
- **`src/engine/competitive.ts`:**
  - `createCompetitiveMatch` (seeded board, 9/8/7/1, random or fixed first team, distinct words).
  - `applyAction` (clue / suggest / guess / end turn / pause / resume, checked against match id, revision, phase, role and team; returns a new state plus events; never mutates its input).
  - `expireTurn` (server-clock timers) and `computeStats`.
  - Custom reuses it with its board size and mole count.
- **`src/server/match.ts`:** room glue for the Step 7 server (`startCompetitiveMatch`, `applyGameMessage` building actors from room records, `tickMatch`).

**Model and protocol changes:**
- Matches carry `revision` and `startingTeam`. `MatchResult.stats` records per-team and per-player statistics.
- Gameplay messages carry `{ match, rev }`.
- New error codes: `stale`, `wrong_match`, `match_over`, `wrong_phase`, `not_your_turn`.
- `GameScreen` now sends the match ref (no visual change).

**Special clues:** zero and ∞ both allow unlimited guesses, with at least one guess required. This was checked against rule references; one source disagrees on zero, which is noted in `CIPHER_RULES.md`.

**Dev harness:** `src/client/dev/EngineHarness.tsx` at `/?harness` (dev builds only).
- It runs the real engine, room runner and projection in one tab, with views for the Crimson/Cobalt handler, Crimson/Cobalt operative and spectator, "follow active seat", seed and first-team controls, and an engine log.
- It is not a multiplayer route and is absent from production (grep-checked). The dev fixture room service now points to it when Start is pressed.

**Fix:** the mission-report stamp no longer overlaps the title.

**Tests:** 49/49 pass (26 engine tests in `engine/competitive.test.ts`). They cover:
- setup layout and reproducibility;
- clue roles, phases and validation;
- every guess outcome: own agent, rival agent, civilian, mole;
- the N+1 limit, zero and ∞ clues, at least one guess before ending;
- guesses on earlier clues, and revealed or out-of-range cards;
- both victory paths, including revealing the rival's last agent;
- rejection after the match ends, stale revisions, wrong match ids, and no mutation of inputs;
- pause/resume, suggestions, timers, and history/statistics;
- 200 seeded random games that always terminate consistently;
- room-runner views keeping the key hidden from operatives and spectators.

Typecheck ✔, build ✔. In the browser harness: board-word and word-form rejection, a 2-clue turn ending at 3 guesses ("limit"), an ∞ clue allowing 5 guesses, mole → defeat with the report, and rematch.

**Not done (by design):** Duet engine, live multiplayer wiring (Step 7), and vocabulary-based word draws (the harness uses placeholder dev words).

## Stage 6 — Vocabulary & scalable board generator (done, 2026-11-27)

**Imported vocabulary (validated by tests against `src/vocab/data/summary.json`): 10,000 entries.**
- **Safety:** 9,830 safe and 170 `sensitive` (never drawn).
- **Difficulty:** 4,150 easy, 3,829 medium, 2,021 hard.
- **Sources:** 8,200 WordNet, 1,620 Wikidata, 180 original Cipher terms.

| Category | Target | Imported (primary) | Pack size (safe, incl. tagged) |
|---|---|---|---|
| General | 4,000 | 4,000 | 3,933 |
| Objects & occupations | 1,000 | 1,000 | 976 |
| Advanced | 1,000 | 1,000 | 974 |
| Animals & nature | 800 | 800 | 796 |
| Geography | 700 | 700 | 669 |
| Science & history | 700 | 700 | 682 |
| Anime & manga | 600 | 600 | 699 |
| Gaming | 600 | 600 | 842 |
| Movies & entertainment | 600 | 600 | 1,053 |

**Sources and licenses:** `src/vocab/SOURCES.md` (Princeton WordNet 3.0 with its license in `data/WORDNET_LICENSE.txt`, Wikidata CC0, original lists). No official Codenames list was used. Downloads were approved by the owner and cached in the git-ignored `scripts/vocab/.cache/`.

**Built:**
- **`scripts/vocab/build.ts`** (`npm run vocab`): WordNet parsing and scoring, cached Wikidata queries (`--fetch` refreshes), curated lists, blocklist and stoplist. Writes `bank.json` (compact rows, 470 KB) and `summary.json`.
- **`src/vocab/`:**
  - `types.ts`: an entry has id, word, normalized form, root group, category, tags, difficulty, language, safety and source.
  - `bank.ts`: loader and `inPacks`.
  - `index.ts`: `defaultBank()`, server-side only (the bank is not in the client bundle; checked).
  - `board.ts`: `generateBoardWords`, `tierCounts`, `conflicts`, `rememberBoard`.
- **Board balance (configurable, `BOARD_BALANCE` in config):** opposing = floor((S² − A) × 35%), starting = opposing + 1, civilians = the rest; the standard is one mole. This gives 9/8/7, 13/12/10, 17/16/15, 23/22/18, 29/28/23 and 35/34/30, all tested. Custom moles go from 1 up to one per 12 cards.
- **Packs and difficulty:**
  - Word packs are now the 9 categories. Classic and Duet use the 5 general-interest packs. Advanced, Anime, Gaming and Screen are opt-in via Custom.
  - Difficulty is now Easy 80/20/0, Balanced 40/48/12 (default), Hard 20/40/40 and Expert 0/40/60.
  - The lobby shows pack sizes and warns early when the packs are too small.
- **Generator:**
  - It draws random words per difficulty tier and rejects duplicates, same root group, and containment of 4+ letters. Related meanings are kept on purpose.
  - It avoids the room's last 3 boards (`ServerRoom.recentWordIds`) and reuses them only if the packs run short, saying so.
  - A short tier borrows from neighbouring tiers of the same packs and reports it. Too few words gives a clear `BoardError` asking for more packs, never words from other packs.
  - Identities are assigned afterwards by the engine, independently of meaning.
- **Randomness:** `cryptoRng()` (Web Crypto) for production boards and keys. The seeded generator has only 32 bits of state, so its keys could be brute-forced; it is for tests and fixtures only. `startCompetitiveMatch` now takes the bank and draws the board itself.

**Tests:** 62/62 pass (14 new vocabulary/board tests):
- entry shape, uniqueness and normalization;
- counts equal to the summary, including the 10,000 total;
- no blocked or filler words; standard packs can fill 10×10 in every tier;
- the layout table and configurability; engine identity counts on every size;
- exact difficulty mixes; every size × difficulty board distinct and conflict-free;
- specialized packs staying within themselves; determinism and the secure rng;
- recent-word avoidance; insufficient pools; the conflict rules.

Typecheck ✔, build ✔. The harness draws real boards.

**Known limits:** curation is automated (WordNet frequency comes from small corpora). Some long-tail entries are obscure or odd for a party game, e.g. MANOMETER, or names in the hard tiers. Manual review passes are recommended before launch.

## Stage 7 — Real-time multiplayer (done locally, 2026-11-27; not deployed)

**Hosting finding:** Netlify (the current host) serves static files and short-lived functions only. It has no WebSockets and no shared in-memory state, and polling functions would use up the free invocation quota within hours and couldn't apply simultaneous guesses atomically. So Cipher uses a **Cloudflare Worker + SQLite-backed Durable Objects** (free plan): one single-threaded authority per room. The Recess site stays on Netlify. Tooling added with the owner's approval: `wrangler` 4.169.0 and `@cloudflare/workers-types` (dev only; telemetry off).

**Built:**
- **`worker/`** (`index.ts`, `room.ts`, `wrangler.jsonc`, `README.md`):
  - The Worker handles room creation (`POST /rooms`), origin allow-list checks (CORS and WebSocket Origin), and routes each code to its Durable Object.
  - The Durable Object persists the room after every change, uses hibernating WebSockets with a ping auto-response, and sends each socket a per-player projected view.
  - It also handles alarms (hello timeout, grace, auto-pause, timers, expiry with an "expired" tombstone), a per-socket token bucket (20 burst, 8/s), a chat limit (5 per 10 s), a 4 KB message cap, and dedupe of repeated action ids.
- **`src/server/live.ts`** (pure, unit-tested):
  - `hello`: a session resumes only with the matching secret token (constant-time compare). A room code or name alone joins as a new observer, and duplicate names are renamed.
  - `handle`: lobby rules, start and rematch with `cryptoRng`, return to lobby, game actions.
  - Mid-match seating that leaks nothing: anyone may step out; a vacant handler seat goes to an operative of that bureau or an observer; an observer may fill only a bureau with no operative; nobody switches bureaus; anyone who has held a key can never become an operative (`keyHolders`).
  - `housekeeping`: host migration and lobby seat release after the 120 s grace; auto-pause after 20 s when a required role is missing (and resume when it's filled); turn timers; expiry after 30 idle minutes.
- **`src/net/validate.ts`:** strict shape validation for every client message.
- **Protocol:** close codes, `MAX_MESSAGE_BYTES`, `to_lobby`, optional `aid`.
- **Model:** `ServerRoom` gained `keyHolders`, `pauseReason` and `lastActiveAt`. The public view gets `pauseReason` and `keyHolders`, which say who held a key but never what it was.
- **Client:**
  - `src/client/liveRoomService.ts`: create via HTTPS; WebSocket hello with the stored session; reconnect with backoff (8 tries); keepalive; close codes mapped to room states.
  - `services.ts` uses the live server whenever `VITE_CIPHER_SERVER` is set. Dev builds without it fall back to the labeled fixture service, and **production has no mock rooms**.
  - `RoomScreen` shows a reconnecting banner and keeps finished matches on screen (report with Rematch / Lobby).
  - `GameScreen` has a pause banner offering only server-legal takeovers.
- **Scripts:** `server:dev`, `server:test` (3 s grace), `dev:live`, `test:live`. Launch configs `cipher-server`, `cipher-server-test` and `cipher-live`.

**Tests (actual results):**
- **Unit:** 68/68 (6 new live-room tests: token auth, start and key holders, auto-pause/takeover/returning handler, lobby grace and host migration, expiry, the message validator).
- **Multi-client integration (`npm run test:live`, independent WebSocket clients against the real local server): 14/14 scenarios.** 1,075 messages were scanned for leaks: no board seed, no session records or other players' tokens, no key outside handlers, nothing declassified before the end, no portraits on hidden cards. The scenarios:
  - projections per role;
  - unauthorized actions (including a forged "role" field);
  - impersonation with a wrong token;
  - two operatives guessing at the same revision → exactly one reveal, and the other is told it was stale;
  - duplicate action id applied once;
  - refresh/reconnect restoring seat and revision;
  - stale, previous-match and post-match actions rejected, and a rematch on the same code with no repeated words;
  - a complete Classic match;
  - mid-match newcomers spectating;
  - spectators-off rejection;
  - auto-pause → fair takeover → resume, with the replaced handler unable to guess;
  - host migration after grace;
  - malformed, oversized and flooding input;
  - unknown codes and foreign origins refused.
- **Independent browser sessions:**
  - Two browser origins with separate storage (`localhost:5175` and `[::1]:5175`) plus two scripted Cobalt clients.
  - Covered: create room, invite-link join, seat selection, start, handler sees the key and operative doesn't, clue and guesses through the UI, operative refresh mid-turn (same player and state), a complete match won by Crimson with the report in both browsers, rematch on the same code, and the room server stopped and restarted (reconnect banner, then automatic recovery with state intact).
  - The production bundle contains no dev or mock code and not the bank (grep). The Worker dry-run bundle is 604 KiB (118 KiB gzipped).

**Unresolved hosting requirements:**
- Deploying needs a **free Cloudflare account** and the owner's go-ahead. Then set `ALLOWED_ORIGINS` to the real site origin, deploy, and rebuild the site with `VITE_CIPHER_SERVER` (steps in `worker/README.md`). Until then, the production page says online rooms are not open yet.
- Free-plan quotas should be checked against expected traffic before launch.
- Room creation has no per-IP rate limit yet. Codes are 32⁵ ≈ 33.5 M; consider Cloudflare rate-limiting rules at deploy time.
- Duet live play is still to come (the engine is Classic/Custom only).

## Stage 8 — Duet cooperative mode (done, 2026-11-27)

**Built:**
- **`src/engine/duet.ts`:**
  - `generateDuetKey` builds both keys from the exact 9-pair table, shuffled independently of the words. `validateDuetKey` checks every generated key.
  - `createDuetMatch`, plus `applyDuetAction`: clue, suggest, guess, end turn, pause/resume, sudden death and win/loss.
  - `expireDuetTurn`, `sideDone` and `duetStats`.
- **`src/engine/match.ts`:** a dispatcher that routes by key kind, so the competitive engine is untouched apart from a `side` on the actor and two new event types.
- **Config:** `DUET` is now 9 agents, 13 civilians, 3 moles, 3 shared, 9 tokens, plus the pair table. `MatchStats.cooperative` and public `sidesDone` were added.
- **Server:**
  - `startMatch` handles Duet, drawing 5×5 words from the vocabulary. Every seated partner becomes a key holder.
  - Duet mid-match seating: an observer who never held a key may take a side with nobody connected; nobody switches sides.
  - Duet auto-pause triggers when a side is empty.
- **UI** (forest-green accents):
  - `DuetStatus`: agents recovered x/15, turn tokens, your own key's hidden agents, a sudden-death tag.
  - Partner panels showing who gives the clue or guesses, and who is done.
  - Private-key tints, A/B civilian markers, a "no guess limit" clue line, End turn hidden during sudden death.
  - A cooperative mission report: agents, tokens used, civilians hit, sudden-death note.
  - A pause banner offering Duet takeovers.
- **Rules doc:** the Duet section of `CIPHER_RULES.md`, including the checks against rule sources and Cipher's intentional differences.

**Tests:**
- **Unit:** 80/80 (12 new). Covered:
  - key distribution over 300 seeds, the 3 overlap and 15 unique agents, invalid keys detected, keys independent of the words;
  - roles; judging by the clue-giver's key (agent/mole and mole/agent);
  - asymmetric civilians (still live from the other direction, and blocked when already known);
  - no N+1 limit; one token per turn rather than per guess; alternation;
  - the "done" side handing over clue-giving;
  - sudden death (no clues, partner-key judging, civilian or mole loses);
  - victory with 15 agents; stale/wrong-match/pause/immutability;
  - privacy: each partner gets only their own key, observers none, and revealed cards never carry the other key's identity;
  - the room flow: start, key holders, seat locks, auto-pause, observer takeover.
- **Classic regression:** every earlier unit test still passes.
- **Integration:** 15/15 multi-client scenarios against the real local server. That's the 14 Classic ones plus a full Duet match to victory with a separate observer; 1,144 messages were scanned, confirming during play each partner held only their own key and the observer none.
- **Other checks:** typecheck ✔, build ✔, no dev code in the production bundle. The Duet layout was checked visually in the design lab.

**Not in scope:** expanded cooperative boards (Duet stays 5×5), and a configurable token count (fixed at 9 in config).

## Stage 9 — Custom mode (done, 2026-11-27)

**Built (no new engines, no new menu modes):**
- **`engine/settings.ts`:**
  - `modeRules`/`kindOf`: Custom cooperative uses Duet's seating and start rules.
  - `effectiveSettings`: what a match runs with.
  - `layoutFor`, `manualLayoutProblems`, `settingValueProblem`.
- **Settings model** (`RoomSettings`): `customKind`, `manualLayout`, `suggestions`, `bonusGuess`, `specialClues`, `duetTokens` and `customWords`.
  - Matches carry public `rules`.
  - Assassins go 1–5; timers are Off/30/60/90/120 (default Off); tokens are 9/10/11.
  - Settings are stored as chosen; Classic and Duet ignore the Custom fields.
- **Engines:**
  - Competitive accepts an explicit layout (validated) and the rule switches: no-bonus limit = N; special clues off rejects 0/∞; suggestions off rejects marks.
  - Duet accepts a token budget and the suggestions switch.
- **Words:**
  - `vocab/custom.ts` sanitizes, de-dupes, length-limits, safety-filters and caps lists at 400. The runtime `blocklist.json` is emitted by the vocab build (bank unchanged).
  - The generator accepts the `custom` pack and handles custom-only draws.
  - The server merges the list only when the pack is selected.
- **Server:** settings validation rejects bad values with reasons and reports combinations as blockers; settings are locked during matches; `startMatch` uses the effective settings.
  - Views carry `serverNow` for countdown display, and deadlines remain server-enforced through the room alarm.
  - The message cap rose to 16 KB for word lists; every field is still validated.
- **Lobby UI** (`LobbySettings` rewritten):
  - game and game type;
  - a live composition bar with the total card count;
  - board size; an assassin stepper or the manual editor with inline errors; tokens;
  - packs with counts plus the Custom list, and an importer (paste or upload, with a live keep/drop report);
  - difficulty, countdown, first turn, and the rule switches.
- **Game UI:**
  - Server countdown chip (skew-corrected, display only).
  - Clue numbers follow the special-clue switch; Suggest is hidden when off; Duet tokens show the room's budget.
  - Arrow/Home/End keyboard navigation across the grid.
  - Phone-landscape layout: compact chrome, and a large board fills the viewport height and scrolls both ways.

**Tests:**
- **Unit:** 92/92 (12 new). Covered:
  - every board size × 1–5 assassins;
  - manual layout rules (and that they are never rewritten); the engine honoring manual layouts and rejecting impossible ones;
  - bonus off, special clues off, suggestions off (both engines); 10 and 11 tokens reaching sudden death exactly;
  - word sanitizing, de-dupe, safety, limits and splitting; custom-only and mixed boards; too-few-words reporting;
  - host-only settings with rejection reasons and the lock during play;
  - a full Custom setup (8×8 manual + imported list + rule switches + 30 s timer) reaching the match, with server-clock expiry at the deadline;
  - Custom cooperative at 5×5 with 11 tokens.
- **Multi-client integration:** 20/20 scenarios against the real local server, 1,940 messages leak-scanned. The 15 earlier Classic and Duet scenarios still pass, plus 5 new:
  - every board size from 5×5 to 10×10 with the correct composition;
  - invalid settings rejected or reported, non-host blocked, locked mid-match;
  - an imported-word 7×7 manual match with no bonus, special clues or suggestions, played to completion;
  - a real 30-second server timer expiry;
  - Custom cooperative with 10 tokens and private keys.
- **Browser:**
  - The Custom lobby: live composition, manual-total error and blocker, import report ("4 of 8 will be kept · 2 invalid · 1 duplicates · 1 removed by the safety filter").
  - A 10×10 board in phone landscape (812×375): about 7 readable rows, scrolling both ways; arrow-key navigation (0 → 1 → 11 → row end 19).
- **Build:** no dev code or bank in the production bundle.

**Not changed:** Classic and Duet keep their standard rules. Expanded cooperative boards were intentionally not implemented.

## Stage 10 — Communications, suggestions and intelligence history (done, 2026-11-27)

**Chat** (server-enforced, `engine/chatRules.ts`, shared by server and UI):
- **Channels:** `global`, `team:crimson|cobalt`, `side:north|south` (Duet), `spectators`, and the read-only automated `system` log.
- **Who reads what:** team and side channels go only to their members (handlers read their team), observer chat goes only to observers, and global/log go to everyone. The projection filters `room.chat` per viewer, so other channels are never sent.
- **During live play:**
  - handlers cannot post;
  - operatives use their team channel or global;
  - observers post only to observers;
  - Duet: only the guessing partner may post in global (the clue-giving side is told why), side channels stay private, and nobody posts in global during sudden death.
- **Lobby and finished matches:** every readable channel is open.
- **Safety:** cleaned text (control, zero-width and bidi characters stripped, 280 characters max), rendered as plain text by React (no HTML), 5 messages per 10 s per player (Durable Object), and 200 messages kept.
- **Host moderation:** mute/unmute (muted players cannot post) and delete a player message, both logged.
- **Protocol:** `chat` carries `channel`; new `mute` and `delete_message` messages, all validated.

**Suggestions:**
- **Who can suggest:** only active operatives (competitive) or the guessing side (Duet); handlers and observers are rejected server-side.
- **Concurrency:** turns now record `sinceRev`. A suggestion made at any revision of the current guessing phase is accepted, so teammates marking at once never reject each other. A suggestion from an earlier turn is rejected as stale. Confirms still need the exact revision.
- **Visibility and clearing:** marks show initials on cards, can stack from several teammates, are advisory only, are visible only to the suggesting team (and observers), and are cleared on reveal and at turn changes.
- **Local-only:** selection and hover never touch the network.

**UI:**
- **`CommsPanel`:** channel tabs with unread counts (tracked locally), timestamps, team-colored names, the blocked reason in place of the input, the room log, and a roster with Mute.
- **`HistoryPanel`:** each clue with its guesses, outcomes and turn end, plus the match result. Selecting a clue outlines the cards guessed that turn (local only; only public guesses are used, never target associations).
- **Layout:** the two panels collapse independently (a narrow drawer on small screens), the roombar Communications button shows an unread badge, and the lobby uses the same panel. The old `ChatPanel`, `HistoryLog` and `SidePanel` were removed.

**Tests:**
- **Unit:** 101/101 (9 new):
  - the lobby and live-play chat permission matrix (handler blocked, operative team/global, observer isolation);
  - per-viewer chat visibility (rivals and observers never receive team chat);
  - Duet global and side rules, including sudden death;
  - host mute and delete versus non-host;
  - sanitizing (markup kept as inert text, control and bidi stripped, capped);
  - concurrent and stale suggestions (handlers and rivals rejected, cleared on turn change, never revealing);
  - history grouping; protocol validation.
- **Multi-client integration:** 23/23 against the real local server, with 2,200 messages scanned. Every delivered chat message passed a "viewer may read this channel" check. New scenarios:
  - team-chat isolation, handlers silenced, observers isolated, global synchronized to all six clients, mute enforced;
  - two teammates suggesting at once both landing, rivals never seeing them, cleared at turn change, a later stale suggestion rejected;
  - identical public history on every client.
- **Browser:** the design lab showed the comms tabs with an unread badge, the history list, and clue selection outlining its cards.
- **Build:** no dev code in production.

## Stage 11 — Portraits, terminal animations, sound (done, 2026-11-27)

**Artwork status: 0 of 68 final portraits supplied.** No illustrations were created or sourced. The game uses generated placeholder silhouettes for every slot until original art is dropped into `public/portraits/` (naming guide in its README; `npm run art` validates it and updates the manifest).

**Built** (details in `CIPHER_DESIGN.md`):
- **Portraits:** a family/slot manifest and pipeline; `Portrait` / `PlaceholderPortrait` components; portrait choice comes only from the revealed identity and the card's random seed; unrevealed cards show none; the word stays visible.
- **Decode engine:** pure timing and frames, a shared ticker, `DecodeText`, intro code rain, the presentation diff, and the animations switch.
- **The ten moments:** entrance, code decrypt, ACCESS GRANTED, board init, clue, agent/civilian/assassin reveals, mission banner, rematch.
- **Settings and sound:** Terminal animations / Reduce motion / Sound / Volume settings (persisted, also in-game), Esc/click skip, and synthesized sound effects.
- **Fixes during testing:**
  - new clues and reveals are now detected during render, so the first frame is already animated (the recorder had caught a one-frame flash of the final text);
  - the reveal label was bounded to about 1.1 s.

**Tests:**
- **Unit:** 109/109 (8 new). Covered:
  - characters every 80–110 ms; a typical word 0.8–1.2 s; clues 1.2–2 s; the reveal label ≤ 1.2 s;
  - banners 2.5–3.5 s for MISSION ACCOMPLISHED, and ≤ 3.5 s for all;
  - long text adapting rather than going instant;
  - board init within 3 s on every size, in parallel diagonal batches;
  - frames typed left to right, each character scrambling before it resolves, exact final text, the rematch starting from the old word;
  - the portrait family mapping, 68-slot naming, determinism and no word input;
  - the diff not replaying on first view or resync, and detecting reveals, clues, rematch and the end.
- **Live browser** (real server, scripted host and Cobalt players, browser as Crimson operative), measured in the DOM:
  - entrance logo: typed and resolved progressively, done at about 1.35 s;
  - ACCESS GRANTED: done at about 2.5 s, dismissed at about 3.6 s;
  - 5×5 board init: a diagonal wave, all done at about 2.4 s;
  - the clue "MARITIME 3": the word resolved at about 1.35 s, the number by about 1.9 s;
  - agent reveal: the label resolved at about 1.1 s, a Crimson placeholder portrait shown, the word visible throughout, no portrait on unrevealed cards;
  - refresh mid-match: nothing replayed (no decoding, reveal effects or banner);
  - assassin: interference plus ACCESS COMPROMISED on the card, and the defeat banner decoding in about 2.8 s;
  - animations off and reduce motion: everything appeared instantly;
  - Esc: skipped the running sequence.
- **Multi-client regression:** 23/23. Typecheck ✔, build ✔; no dev code, bank or TEMP labels in production.

**Not verified:**
- The rematch transition in a live browser (it's covered by unit tests).
- Sounds by ear (the automated browser has no audio output; playback is gated on a real user gesture).
- Frame-rate profiling of 10×10 boards on low-end phones. The design uses one rAF loop and direct DOM writes, but it wasn't measured on a device.

## Stage 12 — Final QA and optimization (2026-11-27)

**Status: feature-complete and tested locally. Not deployed and not production-ready.** It is blocked on deployment (a Cloudflare account and approval), on original portrait artwork (0/68), and on manual playtesting with real people and devices.

**Added or fixed in this pass:**
- **Complete mission report** (`client/game/report.ts`, pure, from recorded data only):
  - outcome and a perspective-aware MISSION ACCOMPLISHED / FAILED stamp and banner;
  - duration, clues, accuracy (correct/total), turns or tokens;
  - agents recovered per bureau (or shared for Duet);
  - best transmission (the clue with the most correct guesses that turn);
  - assassin word, who chose it and which bureau lost;
  - per-player accuracy, the full declassified board with shape markers, and the clue and guess history;
  - New operation with optional **role rotation** (handlers rotate within each bureau; Duet partners swap sides; server-side `rotateRoles`), and Return to lobby.
- **Rematch reset:** a fresh match id, revision 0, new keys, no reveals, suggestions, history or result, timers restarted, and key holders reset (the previous handler no longer receives a key).
- **Accessibility:**
  - non-color identity shapes on handler key bands, revealed cards and the report board (Crimson ▲, Cobalt ■, agent ●, civilian ○, assassin ✕);
  - contrast audited with computed ratios, and three low-contrast paper colors fixed (feedback 3.05 → 6.23, brown accent 4.34 → 5.37, dim ink 4.43 → 5.19);
  - all checked pairs now ≥ 4.5:1.
- **Performance:** memoized word cards with a stable selection handler (large boards re-render only changed cards); reveal and sound timers cleared on unmount.
- **Audit:** no unused modules, no new runtime dependencies (react and react-dom only; wrangler and workers-types are dev tools for the room server).
- **Report polish:** the stamp perspective, the accuracy sub-line size, the history-toggle contrast, and the stamp size on phones.

**Test results (this pass):**
- **Typecheck:** app + worker, 0 errors.
- **Lint:** no linter is configured in this project (none to run).
- **Unit:** **113/113** (4 new): report figures from a recorded match, no report before the end, new operation reset plus rotation (keys move to the new handlers only), Duet rotation and shared-agent report.
- **Multi-client integration** against the real local Durable Object server: **26/26 scenarios, 2,443 messages leak-scanned.** New this pass: Duet over the network through sudden death to defeat; New operation with rotation; random starting teams across independent rooms with unlimited timers by default.
- **Network inspection in the browser** (operative session, frames captured after reconnect): `key: null`, no identities, no Duet sides, no board seed, no portrait on hidden cards, only the player's own token. Page DOM and local/session storage contain no key data (the CSS class names in dev style tags are not data).
- **Live browser match:**
  - mission report verified with real figures (duration 40 s, 1 clue, 50% accuracy, agents 1/9 · 0/8, best transmission, assassin and losing bureau, full board, history);
  - a long player name (20 characters) displayed without overflow;
  - phone width (375 px) report without horizontal overflow.
- **Regression:** the Recess homepage, game list and the Five Letters, Needle Drop and $20 Anime Battle pages load with no console errors. Outside Cipher only `index.html` (one tile) and `assets/recess.js` (one entry) changed.
- **Build:** production build ✔, bundle clean (no dev code, bank or TEMP labels). Worker dry-run bundle 632 KiB (124 KiB gzipped).

**Verified across stages** (see earlier sections):
- full Classic, Duet and Custom matches; all six board sizes; identity distributions; random starts; every guess outcome; guess limits and special clues;
- Duet overlap, asymmetry, tokens and sudden death; timers and unlimited play; word-pool validation and imports;
- rooms, links, seats; simultaneous, duplicate and stale actions; refresh and reconnect; host migration; disconnected-handler pause and takeover;
- observers, chat permissions, suggestion sync, impersonation; the animation timings, reduced motion and the skip control.

**Unverified (needs manual or device testing):**
- playtesting with real people (clue fairness, pacing, chat etiquette);
- sound by ear;
- 10×10 frame rate on low-end phones;
- iOS Safari and Android Chrome on real devices (only browser emulation was used);
- screen readers (only ARIA structure was reviewed, no screen-reader session);
- the rematch board transition and Duet reveal animations seen live (unit-tested only);
- deployed behavior (Cloudflare edge, real latency, multi-region), free-plan quotas, and per-IP room-creation rate limiting (not implemented);
- manual review of the long tail of the automated vocabulary.

### Stage plan
1. ~~Decisions (brand, base branch)~~ — done.
2. ~~Scaffold `cipher/` app, models, route, foundation~~ — done.
3. Engine: config per board size, board/key generation, Classic/Duet/Custom rules, view projection, tests. (Classic/Custom competitive engine done in stage 5; Duet engine remains.)
4. ~~Room server: create/join by code and link, names, reconnect tokens, teams/roles/spectators, projection, chat, suggestions, confirm, timers, rematch, rate limits; local `wrangler dev`~~ — done in stage 7 (deploy pending approval).
5. Client networking + lobby screens. (Lobby screens, service interface and fixtures done in stage 4; live networking is Step 7.)
6. ~~Board and match UI (visual system, layout, components)~~ — done as stage 3; live wiring remains.
7. Terminal animation system (scramble, decode, cursor) + reduced motion + sound.
8. ~~Vocabulary pipeline to 10,000 words + tests~~ — done in stage 6 (manual review passes remain).
9. Portrait art system.
10. Responsive/a11y polish and QA.
11. Recess integration (homepage card, cover) — with approval.
12. Deploy server and site — only with approval.
