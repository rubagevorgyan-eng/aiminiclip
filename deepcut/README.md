# DEEPCUT

*The deeper your knowledge, the deeper you go.*

A browser trivia game: seven open questions, 25 seconds each. Any correct answer counts, and rarer answers dig deeper (Coal 10m up to Diamond 100m, max 700m). Daily Dig gives everyone the same seven questions each UTC day. Unlimited Dig is random, as often as you like.

Static site: Vite + React + TypeScript, no backend, no accounts. Progress is stored in the browser's localStorage.

## Install and run

Requires Node 22.6+ (tests use Node's built-in TypeScript stripping; Node 24 recommended).

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # unit tests (node:test, no extra deps)
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ at http://localhost:4174
```

## Deploy

`dist/` is a plain static site with relative asset paths, so it works at a domain root or in any sub-folder.

- **Vercel:** import the repo, set the project's Root Directory to `deepcut`. `vercel.json` sets the build (`npm run build`), output (`dist`) and long-lived caching for hashed assets.
- **Netlify / Cloudflare Pages / GitHub Pages:** build command `npm run build`, publish directory `deepcut/dist`.
- **Inside another static site:** copy the contents of `dist/` into a folder (e.g. `games/deep-cut/`).

After deploying, change `og:image` and `twitter:image` in `index.html` to the absolute URL of `og-image.jpg` (some link previews ignore relative image URLs).

## Add questions

Questions live in `src/data/questions/<category>.json`, one array per category:

```json
{
  "id": "geo-borders-china",
  "text": "Name a country that borders China.",
  "category": "Geography",
  "difficulty": "medium",
  "answers": [
    { "name": "Russia", "rarity": "common" },
    { "name": "Myanmar", "aliases": ["Burma"], "rarity": "rare" }
  ],
  "reject": ["Japan"],
  "ignore": []
}
```

- `rarity`: `common`, `uncommon`, `notable`, `rare`, `legendary`, `mythic` (Coal to Diamond). Rarity is curated, not measured.
- `aliases`: other spellings, abbreviations, alternative names. Case, accents, punctuation, "the", "St"/"Saint" and Roman numerals are already handled; small typos are accepted on answers of 7+ letters.
- `reject`: wrong answers that must never be accepted, even as near-misses.
- `ignore`: words dropped before matching (e.g. `["penguin"]` so "Emperor penguin" = "Emperor").
- New category: add a JSON file and one import line in `src/data/questions.ts`.
- Run `npm test`: it fails on duplicate ids, unknown rarities, aliases shared by two answers, or a name from another question being accepted as a typo.
- Adding or removing questions changes which questions future Daily Digs pick (everyone on the same deployed version still gets the same set). Today's dig can change mid-day if you deploy during it, so deploy bank changes near 00:00 UTC. Bump `BANK_VERSION` in `src/data/selection.ts` only to deliberately reshuffle all dailies.

## Known limitations

- Rarity is editorial judgment, not real player statistics. There is no backend, so no global leaderboards, accounts or cross-device sync.
- Progress lives in one browser; clearing site data resets it. Daily "one attempt" is per browser, not per person.
- Bounded answer lists are complete as of 2025; time-sensitive questions say "up to 2025" and will need refreshing.
- On iPhone, keyboard handling relies on the Visual Viewport API; tested in browser emulation, not on a physical device.
- Sounds are synthesized; their balance was verified by instrumentation, not by ear on many devices.
- Fonts load from Google Fonts; offline, system fallbacks are used.
