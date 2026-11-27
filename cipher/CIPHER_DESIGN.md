# CIPHER — Design system

The feel is a premium physical espionage board game crossed with a classified retro terminal. It should never read as a SaaS dashboard or a neon arcade game. Everything here is scoped to the Cipher page.

## Files
- `src/styles/base.css`: tokens, fonts, reset, paper grain, reduced motion.
- `src/styles/ui.css`: primitives (header, buttons, fields, segmented, chips, stamps, panel, dossier, modal, toasts, logo, home).
- `src/styles/game.css`: board, cards, team/clue/composer/guess panels, side panel, chat, log, mission report, responsive layout, focus mode.
- `src/client/components/`: React components (below). `src/client/game/identity.ts` and `derive.ts` hold the presentation helpers.

## Color
| Token | Hex | Use |
|---|---|---|
| `--c-bg` | #111310 | page |
| `--c-olive` | #262B22 | panels (`-2` / `-3` darker / lighter) |
| `--c-ivory` | #E8E1CF | word cards, dossiers |
| `--c-brass` | #B49A65 | primary buttons, selection outlines, focus ring, active turn |
| `--c-crimson` | #A44040 | Crimson Bureau |
| `--c-cobalt` | #3B6291 | Cobalt Bureau |
| `--c-agent` | #426B50 | Duet agents |
| `--c-neutral` | #969183 | revealed civilians |
| `--c-assassin` | #080908 | revealed moles (with a thin crimson edge) |
| `--term` | #45F08A | **reserved** for hacking / decryption animations; never used in the permanent UI |

Every identity-colored element reads one custom property, `--k`, set by `.tone-*` (revealed) or `.key-*` (a handler's key) classes.

## Type
| Role | Font | Fallbacks |
|---|---|---|
| Logo, major headings (`--f-display`) | Cinzel 600/700 | Trajan Pro, Cormorant SC, Georgia, serif |
| Word cards, clue word (`--f-card`) | Barlow Condensed 600 | Arial Narrow, Roboto Condensed, sans-serif |
| Room codes, card numbers, logs, labels (`--f-mono`) | IBM Plex Mono 400–600 | ui-monospace, SF Mono, Menlo, Consolas |
| Interface (`--f-body`) | Inter 400–700 | system-ui, -apple-system, Segoe UI |

No fonts are installed locally. They load from Google Fonts in `index.html`, the same way as other Recess pages, and Archivo Black is kept for the Recess logo. Card words scale with their card using container units: `min(17cqi, 150cqi / length)`, never below 9.5px, never wrapping.

## Surfaces and details
Paper grain (`--grain`, an inline SVG noise tile) sits on the page, ivory cards and dossiers. Borders are thin, shadows restrained, and corners are 3/5/8px (no pills). Brass outlines mark selection, and a brass ring marks keyboard focus. The stamps are original markings (`MARKINGS` in `Stamp.tsx`): Eyes only, Declassified, Handler clearance, Compromised, Mission complete.

## Components
`CipherLogo` (stacked or inline) · `Button` / `IconButton` · `Icons` · `Stamp` · `Dossier` · `Segmented` · `Modal` (native dialog) · `ToastProvider` / `useNotify` · `WordCard` (hidden: default, selected, suggested pips, disabled, Duet civilian marks, handler key band) · `RevealedCard` (identity face, portrait window placeholder until the art stage) · `Board` (5×5–10×10, zoom) · `ScoreCounter` · `TeamPanel` · `PlayerList` · `ClueDisplay` · `ClueComposer` · `GuessControls` · `RoomControls` · `ChatPanel` · `HistoryLog` · `SidePanel` · `MissionReport` · screen `GameScreen` (the full gameplay layout).

Lobby and menu (stage 4, `styles/lobby.css`): `AccessCode` (room code as a secure credential), `NameField`, `SeatGroup` (team / partner / observer seating with host actions), `LobbySettings` (mission parameters), `RoomStatus` (loading and error states), mode file cards, and the dialogs in `screens/menu/`.

## Layout
- **Phone (under 640px):** team panels sit as a two-up strip, then the clue, the board and the controls. Chat, log and roster open as a bottom sheet. 5×5 and 6×6 fit without scrolling; larger boards scroll sideways inside the board frame.
- **Tablet / small desktop (640–1279px):** the same order, and the side panel becomes a right-hand drawer.
- **Wide (1280px and up):** team panels flank the board, with chat/log docked on the right and collapsible. On 8×8–10×10 the team panels move into a strip above the board so it gets the full width.
- **Zoom:** 7×7 and up offer Fit / 125 / 150 / 200%. The frame scrolls on both axes.
- **Focus mode:** hides the side panel, mode chips and key note, and shrinks the team panels and clue to one line.

## Safety
Key tints render only from `view.key` (sent to handlers and to a Duet player for their own side), or from `match.declassified` after the match. Operative and spectator views never get either, and fixture tests check that.

## Dev fixtures
`src/client/dev/` holds `fixtures.ts`, `DesignLab.tsx` and `lab.css`. Run `npm run dev` and open `/?lab` (launch config `cipher-dev`, port 5175). The lab is clearly labeled, loads only when `import.meta.env.DEV` is true, and is absent from production builds (checked).

## Portraits (stage 11)
- **Families and target collection (68):** 16 Crimson, 16 Cobalt, 12 civilians, 8 assassins, 16 Duet agents.
- **Files:** `public/portraits/<family>/<family>-NN.webp` (or `.avif`), square 384 px, under 40 KB. The naming guide is in `public/portraits/README.md`. `npm run art` validates the folder and writes `src/art/portraits.manifest.json`.
- **Selection:** `src/art/portrait.ts`. The family comes from the *revealed* identity; the slot is `seed % count + 1`, where the seed is each card's secure-random portrait seed, so the word plays no part. Unrevealed cards carry no seed and never render a portrait. Handlers see only key tints.
- **Rendering:** `components/Portrait.tsx` shows the supplied art for its slot, otherwise `PlaceholderPortrait`: a generated, family-tinted, halftone head-and-shoulders silhouette that varies hat, collar, glasses and facing by slot. Dev builds mark it "TEMP".
- **Status:** **no final artwork has been supplied (0/68)**. Every slot currently shows the placeholder.

## Terminal animations (stage 11)
- **Engine** (`client/fx/`):
  - `timing.ts`: pure plans; characters resolve every 95 ms (80–110), each scrambles for its lead time first, and long text adapts to a budget.
  - `ticker.ts`: one shared requestAnimationFrame loop, plus skip.
  - `DecodeText.tsx`: writes frames straight to the DOM, with a blinking green cursor, exposing the final text to assistive tech.
  - `CodeRain.tsx`: intro only.
  - `diff.ts`: what changed between views.
  - `motion.ts`: the on/off switch.
- **Green** (`--term`) is used only while decoding, then text returns to the normal colors; dark green is used on ivory for contrast.
- **Where it plays:**
  - entrance logo and brief code rain;
  - the creator's access code decrypting;
  - AUTHENTICATING → ACCESS GRANTED for new joiners;
  - a board-wide diagonal decode on match start and rematch (from the old words);
  - incoming clue word and number;
  - reveals: a scan, label decode and portrait develop for agents; a muted version for civilians; interference and ACCESS COMPROMISED for assassins; a pulse on Duet civilian markers;
  - the mission banner (MISSION ACCOMPLISHED / MISSION FAILED / ACCESS COMPROMISED / OPERATION CONCLUDED).
- **Rules:** presentation only. Nothing animates on first view, reconnect (new epoch) or large resyncs. Obsolete runs cancel on unmount, text change or match change. Esc or a click skips. Animations stop with "Terminal animations" off, "Reduce motion" on, or the system preference.

## Sound (stage 11)
- **`client/sound.ts`:** Web Audio synthesis, original with no sample files: type ticks, paper rustle, radio click, stamp, confirmation beep, victory and defeat tones.
- **Playback:** nothing plays before the first user gesture, and there's no background sound; each sound is throttled.
- **Settings:** Sound on/off and volume persist with the device settings, and an in-game Settings button sits in the room bar.
