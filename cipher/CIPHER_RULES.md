# CIPHER — Competitive rules (Classic)

These are the rules the engine (`src/engine/competitive.ts`) enforces, plus the table rules software cannot check. Wording is ours. The mechanics follow the standard word-association format the spec references.

## Setup
- 25 distinct words in a 5×5 grid. Two bureaus: Crimson and Cobalt.
- The starting bureau is random (or fixed by the host). It gets **9 agents**, the other **8**, plus **7 civilians** and **1 mole**.
- Each bureau has exactly one **handler** (clue giver) and one or more **operatives**.
- Handlers see the full key. Operatives and spectators see an identity only once its card is revealed. The whole key is declassified when the match ends.
- Custom uses the same engine with a larger board and an adjustable mole count (`competitiveLayout`).

## Turn
1. The active handler transmits **one word and a number**.
2. Operatives discuss and may mark **suggestions** (visible to their own bureau and spectators).
3. **Any** active operative confirms a guess. The engine reveals the card:
   - **Own agent:** keep guessing.
   - **Rival agent:** it counts for the rival, and the turn ends.
   - **Civilian:** the turn ends.
   - **Mole:** the guessing bureau loses at once.
4. When a bureau's last agent is revealed, **that bureau wins at once**, even if the rival revealed it.

## Guess limits and special numbers
- **Number N (1–9):** at most **N + 1** guesses this turn. The extra guess lets a team catch up on earlier clues, and any unrevealed card may be guessed.
- **0 (zero):** "none of our agents relate to this word". Guesses are **unlimited**.
- **∞ (unlimited):** "several, I won't say how many". Guesses are **unlimited**.
- Zero and unlimited stay distinct in the history and the UI. The engine treats them the same way: no limit on consecutive correct guesses.
- Operatives must make **at least one guess** before ending a turn voluntarily. A wrong guess or the guess limit ends the turn automatically.

**Source check (2026-11-27):** the published rulebook and most rule references describe zero and unlimited clues as allowing unlimited guesses, with at least one guess required. One community summary gives a zero clue a single guess. We follow the majority (rulebook) reading.

## Clue validation
**Rejected automatically** (case- and accent-insensitive):
- empty or multi-word clues;
- a number outside 0–9 (unless the clue is unlimited);
- an unrevealed board word;
- an obvious form of an unrevealed board word (plurals, -ed, -ing, -er, -est, -ly; a simple stemmer, see `stem()`).

**Allowed:** words of already revealed cards.

**Warnings only:**
- the clue contains, or is part of, an unrevealed board word (e.g. `SNOW` vs `SNOWMAN`). Compounds of a board word are against the table rules, but containment alone is not proof;
- the clue contains digits.

**Table rules** (players police these; software can't):
- The clue must be about meaning. No hints by spelling, letter count, starting letter or position on the board.
- No extra hints through tone, gestures, timing or chat.
- No foreign-language translations or invented words unless the table agrees.
- If a clue breaks these rules, the table may treat the turn as ended.

## Integrity guarantees (engine)
- Every action is checked against the match id, **revision** (stale actions are rejected), phase, role and active bureau.
- Revealed cards can't be guessed again. Nothing is accepted after the match ends, and play stops while paused (host only).
- The server builds the actor from its own room records; clients only name the action, match and revision.
- Secret identities come only from the private key, never from the public board.
- Timers are optional (default: unlimited) and expire only through the server clock (`expireTurn`). Animations consume engine events and never change state or decide what is valid.
- Randomness is injected (`seededRng(seed)`), so the same seed reproduces the same board.

# Duet (cooperative)

Enforced by `src/engine/duet.ts`.

## Setup
- A 5×5 board of 25 words. **Partner A** (north) and **Partner B** (south) each hold a private key with **9 agents, 13 civilians and 3 moles**.
- The two keys are built from this exact pair table, shuffled independently of the words:

| A \ B | agent | civilian | mole |
|---|---|---|---|
| **agent** | 3 | 5 | 1 |
| **civilian** | 5 | 7 | 1 |
| **mole** | 1 | 1 | 1 |

- So 3 agents are shared and **15 distinct agents** must be found. Every generated key is validated against the table.
- **9 turn tokens.** No timer by default. The first clue-giver is random.

## Turns
1. The clue-giver transmits one word and a number. The number is informational; there is **no number + 1 limit**.
2. The partner guesses. Each guess is judged against the **clue-giver's** key, never the guesser's.
   - **Agent:** revealed for both partners; keep guessing.
   - **Civilian:** marked civilian **for that direction only** (shown as an A/B marker), and the turn ends. The card can still be guessed from the other direction later; its identity on the other key is never revealed.
   - **Mole:** immediate defeat.
3. The guesser may stop after at least one guess. **A finished turn uses one token**; correct guesses use none.
4. Turns alternate. When all 9 agents on a partner's key are found, that partner stops giving clues and the other gives every remaining clue. This "done" state is public, as it is when said aloud at the table.

## Sudden death
When the last token is used with agents still hidden:
- no more clues and no ending turns;
- each seated player may guess words that are agents on their **partner's** key;
- any civilian or mole loses; a partner whose partner's agents are all found has nothing left to guess.

All 15 agents found means victory.

## Privacy
- Each player receives only their own side's key; observers receive neither.
- A revealed card carries only "agent (judged by A or B)" and its portrait. A civilian guess reveals nothing, only the direction marker. A mole is shown only on defeat.
- Both keys are declassified when the match ends.

## Cipher-specific differences (intentional)
- **More than two players:** several players may sit on one side and share that key. Any of them may give the clue or guess for that side.
- **Known civilians are blocked:** a card already marked civilian for the current clue-giver cannot be guessed again (no information is lost).
- **Mid-match replacement:** an observer who never held a key may take over a side with nobody connected. Nobody switches sides (that would reveal the second key). Play auto-pauses when a side is empty.
- **Rule sources vary:** sources differ slightly on how sudden-death guessing is ordered. Cipher lets anyone seated guess in any order, and any wrong guess loses.

# Custom

Custom is the third menu mode. It runs on the **existing engines**: *Competitive* uses the Classic engine, and *Cooperative* uses the Duet engine. Room settings keep exactly what the host chose. `engine/settings.ts → effectiveSettings()` decides what a match uses:
- **Classic and Duet:** always 5×5, standard packs, Balanced difficulty and the standard rules.
- **Custom:** the host's choices.

## Custom competitive
- **Board:** 5×5 to 10×10 (always square).
- **Assassins:** 1–5. Agents are balanced automatically: opposing = floor((S² − A) × 35%), starting = opposing + 1, civilians = the rest.
- **Advanced manual distribution:** first-team agents, second-team agents, civilians and assassins. Both teams need at least one agent, assassins must be 1–5, and the total must equal S². If the board size changes, the manual numbers are kept and the mismatch is reported; they are never rewritten.
- **Countdown timer:** Off (default), 30, 60, 90 or 120 s. The server enforces it; browsers only display the server deadline.
- **Words:** difficulty Easy / Balanced / Hard / Expert, plus any word packs and an imported Custom list.
- **Switches:** teammate suggestions, bonus guess (off means exactly N guesses), special clues (off rejects 0 and ∞), spectators.

## Custom cooperative
- **Board:** the validated 5×5 Duet key structure only. There are no scaled-up cooperative keys.
- **Turn tokens:** 9, 10 or 11.
- **Also:** optional countdown, difficulty, word packs and Custom list, suggestions, spectators.

## Custom word lists
Words are pasted or uploaded (.txt or .csv, up to 64 KB). Separators are new lines, commas, semicolons or tabs. Each word is:
- cleaned of control characters and upper-cased;
- one token, 2–16 characters (letters, digits, `'` and `-`);
- de-duplicated, ignoring case and accents;
- passed through the vocabulary safety blocklist;
- capped at 400 words.

The lobby shows what will be kept, and what was dropped and why, before saving. The server re-sanitizes everything it receives. A custom-only list ignores the difficulty mix. If the list (plus any packs) cannot fill the board, Start is blocked with the exact count; the board is never padded or filled from other packs.

## Validation and permissions
- Only the host changes settings.
- An invalid value (for example 6 assassins, 12 tokens or a 45 s timer) is rejected with a message.
- An invalid combination is stored as chosen and listed as a Start blocker.
- Settings are locked while a match runs.
- The client checks for feedback; the server checks again and is authoritative.
