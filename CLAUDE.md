# CLAUDE.md

Guidance for Claude Code / AI agents working in this repository.

## What this is

Huddle is a real-time "watch together" app: synchronized video playback (YouTube,
Twitch, Kick, Netflix), WebRTC voice/video chat, text chat, playlists and small
party games. It is a Turborepo monorepo with npm workspaces.

## Layout

```
apps/
  web/                      Next.js 16 + React 19 frontend (port 3002)
  server/                   Express 4 + Socket.IO 4 + Prisma backend (port 4000)
  extension-netflix-party/  MV3 Chrome extension, Vite + TypeScript
packages/
  shared-logic/             useRoom() socket/WebRTC hooks, shared types (raw TS, no build)
  eslint-config/            shared ESLint config
  typescript-config/        shared tsconfig bases
mobile/android/             Native Android client (Kotlin, Gradle) — outside npm workspaces
scripts/
```

Workspaces are `apps/*` and `packages/*` only. `mobile/android` is a separate
Gradle project and is not covered by any turbo task.

## Commands

Run from the repo root unless noted.

```bash
npm run dev            # turbo run dev — web on :3002, server on :4000
npm run build          # turbo run build (web: next build, server: prisma generate)
npm run check-types    # turbo run check-types — only web + extension define this task
npm run test           # turbo run test — web + extension (vitest), server (node:test)
npm run lint           # turbo run lint — only web defines this task
npm run format         # prettier --write "**/*.{ts,tsx,md}"
```

`.github/workflows/ci.yml` runs lint → check-types → test → build on every push and
PR against `main`, on Node 22.19.0 (`.nvmrc`). A second, non-blocking job runs
`npm audit --omit=dev`.

Per package:

```bash
npm test --workspace web            # vitest run (jsdom, Testing Library)
npm test --workspace server         # node --test over src/**/__tests__/*.test.js
npm test --workspace huddle-netflix-party-extension   # vitest run (node env)
npm run db:migrate --workspace server   # prisma migrate dev
npm run db:deploy  --workspace server   # prisma migrate deploy
npm run build      --workspace extension-netflix-party  # vite build
```

Note: `server` and the shared packages have no `check-types` task, so
`npm run check-types` reports 2 successful tasks (web, extension) — that is the
expected full result, not a partial run. Server code is plain CommonJS JavaScript;
type errors there are only caught by its `node --test` suites. Likewise only `web`
defines `lint`, so `npm run lint` reports 1 task.

Server tests do not need a database, and almost none need a generated Prisma
client: handlers take `prisma` by injection and only `src/prisma.js` imports
`@prisma/client`. Keep it that way — put pure connection helpers in
`src/prismaConfig.js` (no client import) and test those, not `src/prisma.js`.
The one exception is `__tests__/prismaClient.test.js`, which is why the server's
`test` task `dependsOn: ["build"]` (that build is `prisma generate`). Without
that dependency the suite passes locally and fails on a fresh checkout.

`web` builds with the Next 16 default (Turbopack). If a build appears to hang in
the compile step, delete `apps/web/.next` and retry — a stale cache directory,
not the source, is the usual cause. Do not pin `next build --webpack` to work
around it; that changes the production bundler on Vercel too.

## Environment

`apps/server/.env` (see `apps/server/.env.example`):

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/huddle?schema=public
CORS_ORIGINS=http://localhost:3002
NODE_ENV=development
# PORT=4000
```

`apps/web/.env.local`:

```
API_PROXY_TARGET=http://localhost:4000
YOUTUBE_API_KEY=...   # read by apps/web/app/api/youtube-*/ and video-info route handlers
```

Gotcha: `YOUTUBE_API_KEY` is a **web** variable, not a server one. Nothing in
`apps/server` reads it; it is consumed by the route handlers `youtube-search`,
`youtube-playlist`, `youtube-preview` and `video-info`. Without it those routes
return "YouTube browsing is not configured". `apps/web/.gitignore` ignores
`.env*` but negates `!.env.example`, so the template stays committed.

The server reads exactly: `DATABASE_URL`, `PORT`, `CORS_ORIGINS`, `NODE_ENV`,
`ALLOW_EXTENSION_ORIGINS`, `COOKIE_DOMAIN`, `VERBOSE_LOGS`. Anything else in
`apps/server/.env` is dead configuration.

Prisma is on **v7**. Two things moved in that upgrade and both are easy to
regress:

- `schema.prisma` no longer holds `url = env("DATABASE_URL")` — v7 rejects it.
  The CLI reads the URL from `apps/server/prisma.config.js`, which also calls
  `dotenv.config()` because v7 stopped auto-loading `.env`.
- The runtime client needs an explicit driver adapter (`@prisma/adapter-pg`),
  wired in `src/prisma.js`. Both paths still read exactly `DATABASE_URL`, so
  deployment configuration is unchanged.

With an adapter the pg pool connects lazily, so `$connect()` resolves even
against an unreachable database. The startup probe therefore uses a real
round-trip (`$queryRaw\`SELECT 1\``); reverting it to `$connect()`would pin`dbConnected`to true and silently kill the memory-only degradation path that`/health`, `auth/session.js`and`sessionCleanup.js` depend on.

Prisma provider is **postgresql**. `apps/server/prisma/dev.db` is a leftover
SQLite artifact left on disk but no longer tracked (`*.db` is git-ignored) — do
not treat it as the dev database.

Production: web on Vercel, server on Railway. Railway needs `CORS_ORIGINS` — an
empty allowlist is not "allow all", it fails closed under `NODE_ENV=production`
(`src/cors.js`). Vercel should normally leave `NEXT_PUBLIC_SOCKET_SERVER_URL`
unset so the socket rides the same-origin rewrite; see the socket transport note
below before setting it.

## Architecture notes that matter when changing code

**Socket transport.** `packages/shared-logic/src/serverUrl.ts` resolves the
Socket.IO endpoint. `NEXT_PUBLIC_SOCKET_SERVER_URL` wins; empty string means
same-origin; on localhost it falls back to `:4000`; in production it uses
`window.location.origin` so the HttpOnly session cookie rides along with the
handshake. Changing this breaks auth on the socket, not just connectivity.

Pointing that variable at the backend host directly is only safe when the backend
shares a parent domain with the web app and `COOKIE_DOMAIN` is set to it.
`auth/session.js:getCookieDomain` widens the cookie only from an explicit
`COOKIE_DOMAIN`, or in production for `wehuddle.tv` and its subdomains. Across a
`*.vercel.app` / `*.railway.app` pair the two origins are cross-site, the session
cookie never reaches the handshake, and the socket connects unauthenticated.

**Next.js rewrites.** `apps/web/next.config.js` (`beforeFiles`) proxies only
`/health`, `/socket.io*`, `/api/auth/*` and `/api/saved-rooms*` to
`API_PROXY_TARGET`. Everything else under `/api` is a real Next route handler in
`apps/web/app/api/` (url-preview, video-info, youtube-search, image-search,
image-generate, ...) — do not add a blanket `/api/:path*` rewrite or those break.
`skipTrailingSlashRedirect: true` is required because a 308 kills the Engine.IO
websocket upgrade. Security headers set in `next.config.js` do not apply to the
proxied routes; those come from `apps/server/src/security.js`.

**Server socket layer.** `apps/server/src/socket/` splits into `handlers/`
(one per event domain: `syncVideo`, `webrtc`, `chat`, `playlists*`, `wheel`,
`cupGame`, `game`, `timer`, `moderation`, `joinRoom`, `leaveRoom`, `disconnect`)
and `helpers/` (pure logic, rate limiting, room state). Prefer adding logic to
`helpers/` where it is unit-testable; handlers should stay thin.

Room membership must be checked with `helpers/membership.js` — `isRoomMember`
for the calling socket, `isSocketIdInRoom` for any other socket id (the WebRTC
relay target) or when only `io` is in scope. Never use a raw
`socket.rooms.has(roomId)` or `io.sockets.adapter.rooms.get(roomId).has(id)`:
Socket.IO keeps every socket in a room named after its own id, so both raw
checks pass when a client sends its own socket id as `roomId`. That bypassed
every per-room gate and wrote state into a pseudo-room that leave/disconnect
cleanup never visits.

An emptied room is torn down by `scheduleRoomCleanup` after
`ROOM_EMPTY_GRACE_MS`, not inline. Do not delete per-room maps in `leaveRoom` /
`disconnect`: the grace window is what lets a refresh or a reconnect blip keep
the room's password, ban list and host. `cleanupRoom` frees them all via
`PER_ROOM_MAPS`. Because `roomHost` survives that window, its socket id can
outlive its socket — `helpers/users.js:ensureRoomHost` re-checks the stored host
against the live room and promotes the joiner if it is gone.

**Playback sync.** Server-side truth lives in the `RoomState` model and
`socket/helpers/sync.js`, which extrapolates position from a timestamp. On the
client, `apps/web/app/r/[roomId]/hooks/activityLog/roomState.ts` applies remote
state and `components/playerSection/useRoomCatchup.ts` handles drift/catch-up.
Local playback events are broadcast through `sendSyncEvent`; guard flags such as
`applyingRemoteSyncRef` exist to stop remote-applied changes from echoing back as
new local events. Removing a guard causes sync feedback loops, not just jitter.

**WebRTC.** Signaling goes through `socket/handlers/webrtc.js`; peer management is
in `apps/web/app/r/[roomId]/hooks/webrtcPeers/`. `Permissions-Policy` in
`next.config.js` must keep `camera=(self), microphone=(self)`. Offer/answer
collisions are resolved by `PeerNegotiator` with a deterministic polite role;
never restore a direct `signalingState !== "stable"` early-return because media
renegotiation requested during an active exchange must remain queued. Treat each
`room_users` payload as authoritative: peers absent from its `users` list must
be closed even if a preceding `user_left` event was missed during reconnect.
Media permission promises cannot be cancelled by the browser, so
`useMediaTracks` invalidates pending mic/camera/screen requests by generation
and stops tracks from stale results. Keep the local preview on the callback ref:
the video element is conditionally remounted by several room UI states.

**Auth.** Session cookie based (`apps/server/src/auth/`): `session.js` (SHA-256
hashed tokens, HttpOnly cookie), `password.js`, `validators.js`, `middleware.js`,
`rateLimiter.js`. Password hashing and verification are asynchronous scrypt;
every call site must `await` them so CPU work stays off the event loop. Socket
auth is attached in `socket/attachAuth.js`. Expired database sessions are
removed by the unref'ed scheduler in `auth/sessionCleanup.js`; keep the
`Session.expiresAt` index if its query changes.

**Party games.** Game creation, questioner counts and embedded clue images have
hard server-side limits in `socket/handlers/game.js` and `cupGame.js`; keep those
bounds when adding new creation paths. Cup Spider payloads are per-viewer:
`pendingCard.srcCupIndex` plus peek/relocate event coordinates are visible only
to the acting player, and public broadcast payloads must never reintroduce them.
Only a game's creator or the room host may reset it.

**Room UI.** `apps/web/app/r/[roomId]/` is the large surface: `roomClient/`
assembles props (`buildCallSidebarProps`, `buildPlayerSectionProps`), `components/`
holds the panels, `hooks/` holds behaviour. Keep new work inside the existing
`roomClient` → `components` prop-building direction rather than reaching into
hooks from deep components.

**Netflix extension.** `apps/extension-netflix-party/src/content/` mirrors the web
sync logic against the Netflix player. Manifest version and `package.json` version
must stay in step. Before bumping the version, check the live Chrome Web Store
version — the source tree can already be ahead of what is published.

## Conventions

- Prettier for formatting; ESLint with `--max-warnings 0` on web.
- React 19 / `react-dom` 19.2.3 are pinned via root `overrides` — do not bump one
  workspace independently.
- `shared-logic` is consumed as raw TypeScript through Next's
  `transpilePackages`; it has no build step, so it must stay framework-agnostic
  and free of Next-only imports.
- Node >=22.19.0 (or >=24); npm 11. The floor is set by `undici` 8, which
  calls `markAsUncloneable` and therefore cannot run on Node 20 — the web
  build fails at page-data collection there, not at install. Prisma 7
  additionally excludes Node 21, early Node 22 and Node 23.

## Documentation

`README.md` is the user-facing setup guide and its structure/env sections match
the tree as of the last update (the stale `apps/docs`, `packages/ui`, React
Native `mobile/`, `DEPLOYMENT_GUIDE.md` and `/diagnostic` references were
removed). There is no separate deployment guide; the deploy checklist lives in
the README. If you change the workspace layout or an environment variable, update
`README.md`, the matching `.env.example` and this file together.
