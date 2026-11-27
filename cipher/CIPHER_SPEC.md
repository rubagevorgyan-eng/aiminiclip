# CIPHER — Specification (as implemented)

Requirements as finally agreed and built. Detailed rules: `CIPHER_RULES.md`. Design system: `CIPHER_DESIGN.md`. History, decisions and test results: `CIPHER_PROGRESS.md`.

## Product
- **Name:** CIPHER, a game on the **Recess** site (sibling of Deep Cut, Five Letters, Needle Drop and $20 Anime Battle), served at `/games/cipher/`. The owner chose Recess branding over "Deep Cut" (stage 0).
- **Concept:** competitive and cooperative word association inspired by Codenames, with original branding, art direction, interface, rules text and vocabulary. Original terms: **handler** (clue giver, i.e. "spymaster"), operative, observer; Crimson / Cobalt bureaus; agents, civilians, moles/assassins; Duet partners A/B.
- **Visual theme:** vintage classified intelligence × modern minimalism (ivory dossiers, olive surfaces, brass accents). Green is reserved for decoding animations.
- **Platforms:** responsive desktop, mobile portrait and phone landscape.

## Modes (exactly three in the menu)
| Mode | Engine | Board | Notes |
|---|---|---|---|
| Classic | competitive | 5×5 (9/8/7/1) | standard rules, fixed |
| Duet | cooperative | 5×5, two private keys (9 agents, 13 civilians, 3 assassins each; 3 shared; 15 to find) | 9 turn tokens, sudden death |
| Custom | competitive *or* cooperative | competitive 5×5–10×10; cooperative 5×5 | assassins 1–5, manual distribution, timers, difficulty, packs, imported words, rule switches, 9/10/11 tokens |

Larger competitive boards use the Cipher balance rule: opposing = floor((S² − A) × 35%), starting = opposing + 1, civilians = the rest.

## Multiplayer
- **Rooms:** private rooms by invitation link (`?room=CODE`) or 5-character code; no registration; guest sessions carry a secret token.
- **Authority:** a server-authoritative room per room (Cloudflare Worker + Durable Object). Clients send requests only; the server validates everything and sends each client a view built for that client alone.
- **Communication:** chat channels (team/side, global, observers, room log) with server-enforced play-time restrictions and host moderation. Teammate suggestions; any active operative confirms a guess.
- **Timers:** optional server-enforced countdown (Off by default).
- **Observers:** spectators enabled, with host control.
- **Matches:** single match per game; the post-match report offers New operation (same link, optional role rotation) or Return to lobby.

## Content
- **Vocabulary:** **10,000** validated entries (9,830 board-safe) from Princeton WordNet 3.0, Wikidata (CC0) and original lists. No official Codenames lists.
- **Portraits:** 68-slot collection (16 Crimson, 16 Cobalt, 12 civilians, 8 assassins, 16 Duet). **0 original portraits supplied so far**; generated placeholders are shown and clearly marked as temporary.
- **Animation:** slow green terminal decoding (80–110 ms per character) for entrance, room code, access, board start, clues, reveals and the mission banner. Skippable; off with reduced motion or the setting.
- **Sound:** optional synthesized sound effects; off-able, with volume; nothing plays before user interaction.

## Out of scope
AI opponents, voice chat, public matchmaking, paid AI APIs, and expanded cooperative boards.

## Development rules (unchanged)
1. Preserve all existing Recess functionality (site and every game, including Deep Cut).
2. Reuse the current technology stack wherever practical.
3. Keep Cipher isolated from unrelated game logic and styling.
4. Use reusable components instead of duplicated code.
5. **Never expose unrevealed card identities to unauthorized clients.** Competitive keys go to handlers only; each Duet partner receives only their own side; observers receive none. Everything is declassified only when the match ends.
6. Avoid unnecessary dependencies, abstractions and full-file rewrites.
7. Do not copy official Codenames artwork, source code, branding or proprietary word databases.
8. Implement only the scope of each development step.
9. No deploying, purchases or paid infrastructure without the owner's approval.
10. Keep responses concise; never print whole source files into the conversation.
