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
npm run format         # prettier --write (ts/tsx/js/json/css/md/yml)
npm run format:check   # the same set, verified in CI
npm run check-duplicates  # rejects macOS "name 2.ext" copies
```

`.github/workflows/ci.yml` runs duplicates → format → lint → check-types → test → build on
every push and PR against `main`, on Node 22.19.0 (`.nvmrc`). A second job
reports `npm audit --omit=dev` but always exits 0 — see the comment there for
why it is not blocking. `mobile/android` is excluded from Prettier via
`.prettierignore`; it is a separate Gradle project.

macOS iCloud/FileProvider copies (`name 2.ext` beside `name.ext`) are
deliberately **not** gitignored: a `* 2.*` pattern also matches legitimate
names such as `docs/OAuth 2.md` and would silently drop them from every
commit. `scripts/check-duplicate-files.sh` rejects them in CI instead. It
keys on the sibling — a copy is only flagged when the original exists beside
it — and checks directory components too, because one such copy once landed
inside a Prisma migration directory and another shadowed a Next type file.

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

`NEXT_PUBLIC_APP_RELEASE` is an optional, public sync-telemetry build label.
`next.config.js` falls back to Vercel's build-time `VERCEL_GIT_COMMIT_SHA`; it
must contain only a version or SHA token, never a secret.

The server reads exactly: `DATABASE_URL`, `PORT`, `CORS_ORIGINS`, `NODE_ENV`,
`ALLOW_EXTENSION_ORIGINS`, `COOKIE_DOMAIN`, `VERBOSE_LOGS`, `SENTRY_DSN`, and
the TURN relay set `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`,
`TURN_URLS`, `TURN_SECRET`, `TURN_USERNAME`, `TURN_CREDENTIAL`,
`TURN_TTL_SECONDS`, `STUN_URLS`, `REQUIRE_TURN`. Anything else in
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

The production database was **baselined**, not migrated: `_prisma_migrations`
records `20260427000000_init` with `applied_steps_count = 0`, so its DDL never
ran there. Production therefore can, and did, differ from what migration
history claims — `RoomState` was missing while history said the table existed,
and the first migration to touch it failed mid-deploy. A failed migration is
not a single bad release: `migrate deploy` runs in the container start command,
so P3009 blocks every subsequent boot until the record is resolved, which takes
the API down entirely.

Before merging any migration, diff it against production rather than trusting
history:

```bash
cd apps/server
railway run --service Postgres -- sh -c \
  'DATABASE_URL="$DATABASE_PUBLIC_URL" npx prisma migrate diff \
     --from-config-datasource --to-schema prisma/schema.prisma --script'
```

An empty result means the migration is safe to deploy. Anything else must be
repaired first, in a separate step, before the migration lands.

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
`/health`, `/socket.io*`, `/api/auth/*`, `/api/telemetry/*`, `/api/webrtc/*`
and `/api/saved-rooms*` to
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

**Sync telemetry.** `SyncMetric` is one cumulative, anonymous summary per
`sessionId` + source, not an event log. Web counters live in refs under
`hooks/useSyncTelemetry.tsx`; extension counters live in
`apps/extension-netflix-party/src/content/telemetry.ts`. Every flush carries a
monotonically increasing `sequence`, and the server ignores duplicates or
older network deliveries. A reconnect rotates the extension session; a late
failure from the old request must never mark the new session dirty. Player and
autoplay counters represent lifecycle transitions, not every repeated room
snapshot. The extension manifest version is its public release label. Chrome
content scripts are bound to the Netflix page's same-origin policy, so the
collector sends its fixed-shape payload over the extension's existing socket
through `socket/handlers/telemetry.js`; do not restore a cross-origin content
script fetch or add a mandatory API host permission merely for measurement.
Never add room, user, socket, title or URL fields. The telemetry route owns its
16 KB JSON parser, so `index.js` must continue skipping `/api/telemetry/*` in
the global 1 MB parser; the socket handler mirrors that 16 KB boundary and
reuses the same parser/storage functions. Metrics expire after 30 days through
the shared `expiryCleanup` driver and must never influence product, auth or
billing logic.

**WebRTC.** Signaling goes through `socket/handlers/webrtc.js`; peer management is
in `apps/web/app/r/[roomId]/hooks/webrtcPeers/`. `Permissions-Policy` in
`next.config.js` must keep `camera=(self), microphone=(self)`. Offer/answer
collisions are resolved by `PeerNegotiator` with a deterministic polite role;
never restore a direct `signalingState !== "stable"` early-return because media
renegotiation requested during an active exchange must remain queued.

When the polite peer accepts a colliding offer, `setRemoteDescription`
implicitly rolls back the offer it had already sent, and everything that offer
carried goes with it — an ICE restart requested when relay credentials
arrived, and any track added since the last exchange. `receiveDescription`
therefore re-arms `offerPending` on every collision it accepts, so the flush at
the end of that exchange puts the proposal back on the wire. Without it the
second person to join a room could not send audio at all: their transceiver
read `sendrecv` and their sender held a live track while `outbound-rtp` stayed
at zero packets, so about half of all calls were audible in one direction
only. A remote track being `live` does not mean media is flowing — verify with
`getStats()` (`outbound-rtp.packetsSent`, `inbound-rtp.packetsReceived` and
`totalAudioEnergy`), never with `track.readyState`. Treat each
`room_users` payload as authoritative: peers absent from its `users` list must
be closed even if a preceding `user_left` event was missed during reconnect.
Media permission promises cannot be cancelled by the browser, so
`useMediaTracks` invalidates pending mic/camera/screen requests by generation
and stops tracks from stale results. Keep the local preview on the callback ref:
the video element is conditionally remounted by several room UI states.

Remote voice is played only by `components/RemoteAudioSink.tsx`, mounted at the
room root in `RoomClientView`. It used to live in each participant's tile,
and the tiles unmount when the call panel is collapsed or theatre mode is
entered — every peer connection stayed healthy and the room went silent, with
nothing logged. Never put an `<audio>` for a remote stream back into a tile:
it would stop with the tile and, while both exist, play every voice twice.
The sink also owns the autoplay gate: a listener who has not interacted with
the page gets `NotAllowedError` from `play()`, which the old code swallowed.
The sink shows an "Enable audio" control and retries on the next gesture.

ICE servers are issued by the server: `GET /api/webrtc/ice`
(`src/routes/ice.js`, pure logic in `src/webrtc/iceConfig.js`). It always
returns STUN, and a TURN entry in one of three modes:

- `cloudflare` — `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_API_TOKEN`.
  Cloudflare deliberately refuses a locally computed shared-secret credential,
  so `src/webrtc/cloudflareTurn.js` exchanges the key for one over their API.
  That is a network call, so it is cached and refreshed at 80% of the TTL,
  and concurrent cold-start joins collapse onto one request. Past the refresh
  point the cached credential is only served while at least
  `MIN_REMAINING_SECONDS` (120 s) of it is left: the client's own refresh floor
  is 30 s, so a shorter one dies on a live peer before another is requested,
  and a server that sat idle through the whole window used to hand its next
  joiner a credential with one second on it. Below that floor the caller waits
  for a fresh mint; if that mint fails, a still-valid short credential beats no
  relay and is served anyway, while an expired one never is. Nothing there
  throws: a failed mint degrades the response to STUN.
- `hmac` — `TURN_URLS` + `TURN_SECRET`, a TURN-REST-API credential
  (`<expiry>:<random>` / base64 HMAC-SHA1) computed locally.
- `static` — `TURN_URLS` + `TURN_USERNAME`/`TURN_CREDENTIAL`, refused under
  `NODE_ENV=production` because it cannot expire.

Cloudflare wins when set, and says so in a `[ice]` boot warning.

`REQUIRE_TURN` makes a missing relay a startup failure instead of a silent
downgrade. For `cloudflare` that promise cannot be kept from configuration
alone — a revoked key is indistinguishable from a live one until it is used —
so `index.js` mints once before it listens when the flag is set, and exits 1 if
Cloudflare refuses. Without the flag the same check runs in the background so a
Cloudflare blip never delays a boot that is allowed to degrade. For the same
reason `/health` reports a `credential` field (`ready` / `failing` / `unknown`,
or `n/a` outside Cloudflare) and marks `status: degraded` when the relay is
configured but cannot actually mint; `relay: "configured"` on its own never
meant a working relay.

STUN is public configuration, but a TURN credential spends relay quota, so the
route hands one out only to a caller that proves live room membership with the
capability issued at socket join (`x-huddle-room-token`); everything else gets 403. The route's last handler is async — Express 4 does not catch a rejected
async handler, so it must keep its own try/catch or a failure hangs the
request instead of degrading.

The TTL does **not** need to outlast a call. A shorter window limits what a
leaked credential is worth, and the client handles rotation: when the server
returns different TURN servers, `configureExistingPeers` calls
`setConfiguration` plus `restartIce` on live peers rather than dropping them.

Relay credentials must never move into the web bundle:
`NEXT_PUBLIC_ICE_SERVERS` is only the static fallback parsed by
`hooks/webrtcPeers/iceServers.ts`. `useWebRTCPeers` refreshes at 80% of the
TTL, retries a failed lookup every minute, and exposes
`latestRef.current.iceReady`; the `room_users`, `user_joined` and offer
handlers in `useWebRTCPeerSubscriptions` await it rather than racing the
fetch. The gate is bounded by the fetch timeout (3 s) and always opens — a
failed lookup means STUN only, never no peers.

It does **not** request before `iceAccessToken` exists. That capability
arrives with the first `room_users` payload, so an earlier request could only
be refused; it would spend rate-limit budget and put a 403 in every user's
console. The gate opens immediately in that window instead of holding, because
an offer can arrive before our own presence and a peer that is never built is
worse than one that starts on STUN. The first peer of a session is therefore
often STUN-only, and `configureExistingPeers` upgrades it in place with
`setConfiguration` plus `restartIce` when the credentials land. STUN alone cannot connect two peers who are
both behind symmetric NAT; that needs a relay, and no client code change can
substitute for it.

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

The store listing text is reviewed against Google's metadata policy, and a
listing that reads naturally can still fail it. Version 1.3.0 was rejected for
"keyword spam" over one line in the description that named the browsers the
extension runs on — `Chrome, Edge, Brave, Arc, Opera, Vivaldi`. Naming a
compatible browser is fine on our own site; a list of brand names in the store
description is not. Say the requirement once, generically ("a Chromium-based
desktop browser"), and keep the listing to what the extension actually does.
Service names the extension really supports (Netflix, Prime Video) are
functional, not keywords, and are fine.

## Conventions

- Prettier for formatting; ESLint with `--max-warnings 0` on web.
- AI `Co-authored-by` trailers are opt-in: never add one unless the user
  explicitly requests it in the current conversation, and never bypass the
  commit hook or apply the `allow-ai-coauthor` PR label without that request.
- React 19 / `react-dom` 19.2.3 are pinned via root `overrides` — do not bump one
  workspace independently.
- `shared-logic` is consumed as raw TypeScript through Next's
  `transpilePackages`; it has no build step, so it must stay framework-agnostic
  and free of Next-only imports.
- Node >=22.19.0 (or >=24); npm 11. The floor is set by `undici` 8, which
  calls `markAsUncloneable` and therefore cannot run on Node 20 — the web
  build fails at page-data collection there, not at install. Prisma 7
  additionally excludes Node 21, early Node 22 and Node 23.

**Error reporting.** `apps/server/src/observability/sentry.js` and the web's
`instrumentation.ts` / `instrumentation-client.ts` are inert without a DSN, so
the project builds, deploys and runs with no Sentry account. Keep it that way:
the DSN is read at init and the SDK is only imported when one is present. The
server validates the DSN shape first because `Sentry.init` accepts a malformed
one and carries on, which would report "enabled" while delivering nothing.
Tracing, profiling and Session Replay are off by design — sync quality has its
own collector in `src/telemetry`, and replay would capture the video title,
room name and chat.

## Roadmap

The product direction is platform breadth: the video is the point, and the web
app already supports seven services. The gap is DRM platforms, which need the
extension.

Phase 0 (sync telemetry and error reporting), Phase 2 (the provisional adapter
boundary plus Netflix migration), and Phase 3 (`RoomState.platform`) are done.
The measured Prime half of Phase 1 lives in `docs/platform-spike.md`; Disney+
remains unmeasured because no test account is available. Phase 4 ships Prime
behind an optional host permission in extension v1.3.0, with identity failing
closed when Prime's DOM hook disappears. The adapter remains provisional until
it can be reviewed against that third platform; do not pretend an unmeasured
Disney+ implementation validates the boundary.

## Documentation

`README.md` is the user-facing setup guide and its structure/env sections match
the tree as of the last update (the stale `apps/docs`, `packages/ui`, React
Native `mobile/`, `DEPLOYMENT_GUIDE.md` and `/diagnostic` references were
removed). There is no separate deployment guide; the deploy checklist lives in
the README. If you change the workspace layout or an environment variable, update
`README.md`, the matching `.env.example` and this file together.
