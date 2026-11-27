# Cipher room server

An authoritative multiplayer server: one Cloudflare **Durable Object per room** (`RoomObject`) behind a small Worker (`index.ts`). Game rules live in `src/` (shared with the client). This folder only adds sockets, storage, alarms, origin checks and rate limits.

## Why not Netlify
Recess is a static Netlify site (`netlify.toml`: publish `.`). Netlify Functions are short-lived HTTP handlers. They can't hold WebSockets or shared in-memory state, so live rooms would need clients polling functions plus a blob store:
- about one invocation per player per second, which uses up the free quota within hours of play;
- no single-threaded owner per room, so simultaneous guesses couldn't be applied atomically.

Durable Objects give each room one single-threaded owner with persistent storage and hibernating WebSockets. They're available on the Workers **free** plan (SQLite-backed classes).

## Run locally (no account needed)
```bash
npm run server:dev    # room server on http://localhost:8787 (wrangler dev, local storage in .wrangler/)
npm run dev:live      # Cipher UI on http://localhost:5175 pointed at it
npm run server:test   # second server on :8788 with a 3 s disconnect grace, for the integration suite
npm run test:live     # 14 multi-client scenarios against :8788
```
Wrangler telemetry is disabled through `WRANGLER_SEND_METRICS=false` and `send_metrics: false`.

## Deploy (not done; needs the owner's approval)
1. A free Cloudflare account, then `npx wrangler login`.
2. In `wrangler.jsonc`, set `ALLOWED_ORIGINS` to the real site origin(s) (e.g. `https://<recess-site>`). Remove localhost entries for production.
3. Run `npx wrangler deploy --config worker/wrangler.jsonc`. This prints the Worker URL (`https://cipher-rooms.<account>.workers.dev`).
4. Build the site against it: `VITE_CIPHER_SERVER=https://cipher-rooms.<account>.workers.dev npm run publish:site`, then commit `games/cipher/`.

Until then, the production page honestly shows **"Online rooms are not open yet."**

Free-plan limits to watch (check current Cloudflare pricing before launch): Durable Object requests per day (incoming WebSocket messages are billed at 20:1), storage, and CPU time. The bundle is about 604 KiB (118 KiB gzipped), mostly the vocabulary.

## Endpoints
- `POST /rooms {name, mode}` → `{code, playerId, token}` (201). Only allowed origins.
- `GET /rooms/:code/ws` → WebSocket. The first message must be `hello` (within 10 s). Close codes are in `src/net/protocol.ts` (`CLOSE`).
- `GET /health`.
