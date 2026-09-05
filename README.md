# Huddle 🍿

[![CI](https://github.com/TolgaYanar/huddle/actions/workflows/ci.yml/badge.svg)](https://github.com/TolgaYanar/huddle/actions/workflows/ci.yml)

A real-time video watching and chat application with synchronized playback, voice/video chat, and text messaging.

Watch videos together with friends, synchronized playback across all participants.

## ✨ Key Features

- 🎬 **Synchronized video playback** - Watch YouTube, Twitch, Kick together
- 📹 **Video & voice chat** - WebRTC-powered real-time communication
- 💬 **Real-time messaging** - Instant chat with activity log
- 🔐 **User accounts** - Secure authentication and saved rooms
- 🎲 **Wheel picker** - Make group decisions together
- 🔒 **Private rooms** - Password-protected rooms
- 📱 **Responsive** - Works on desktop and mobile

## 🚀 Quick Start (Local Development)

### Prerequisites

- Node.js >=22.19.0 (or >=24) — `undici` 8 does not run on Node 20
  (matching Prisma 7's supported Node lines)
- PostgreSQL
- npm 11+

### Setup

1. **Clone and install:**

```bash
git clone <repo-url>
cd huddle
npm install
```

2. **Backend environment** (`apps/server/.env`):

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/huddle?schema=public
CORS_ORIGINS=http://localhost:3002
NODE_ENV=development
```

Do not leave `CORS_ORIGINS` empty. An empty allowlist reflects the request origin
in development only; with `NODE_ENV=production` the server fails closed and
rejects every browser origin, so both the API and the Socket.IO handshake break.

3. **Database setup:**

```bash
cd apps/server
npm run db:deploy  # Run migrations
npm run build      # Generate Prisma client
```

4. **Frontend environment** (`apps/web/.env.local`, see `apps/web/.env.example`):

```env
API_PROXY_TARGET=http://localhost:4000
YOUTUBE_API_KEY=<your-youtube-data-api-v3-key>
# Optional outside Vercel: NEXT_PUBLIC_APP_RELEASE=<git-sha-or-version>
# Optional TURN relay for calls across restrictive NATs (JSON RTCIceServer array):
# NEXT_PUBLIC_ICE_SERVERS='[{"urls":["turn:relay.example.com:3478"],"username":"u","credential":"p"}]'
```

`YOUTUBE_API_KEY` is read by the Next.js route handlers in `apps/web/app/api/`
(`youtube-search`, `youtube-playlist`, `youtube-preview`, `video-info`). Without
it, YouTube browsing and search return "YouTube browsing is not configured".

5. **Start everything:**

```bash
npm run dev
```

### Checks

```bash
npm run format:check  # Prettier
npm run lint          # ESLint (web)
npm run check-types   # tsc (web + extension)
npm run test          # vitest (web + extension) + node:test (server)
npm run build         # next build + prisma generate + extension bundle
```

The same five commands run in CI on every push and pull request. Use Node
22.19.0 (`.nvmrc`).

- 🌐 Web: http://localhost:3002
- 🔌 Backend: http://localhost:4000
- 🔍 Health check: http://localhost:4000/health

## 🌐 Production Deployment

Web is deployed on Vercel, the backend on Railway.

### Deploy Checklist

**Railway (Backend):**

```env
DATABASE_URL=<railway-postgres-url>
CORS_ORIGINS=https://yourdomain.com
NODE_ENV=production
```

**Vercel (Frontend):**

```env
API_PROXY_TARGET=https://your-backend.railway.app
YOUTUBE_API_KEY=<your-youtube-data-api-v3-key>
# Optional override; otherwise VERCEL_GIT_COMMIT_SHA is used automatically.
NEXT_PUBLIC_APP_RELEASE=<git-sha-or-version>
```

Leave `NEXT_PUBLIC_SOCKET_SERVER_URL` unset. The client then connects to the web
origin and Next.js proxies `/socket.io` to `API_PROXY_TARGET`, so the HttpOnly
session cookie rides along with the handshake.

Only point the socket straight at the backend
(`NEXT_PUBLIC_SOCKET_SERVER_URL=wss://<backend-host>`) when the backend shares a
parent domain with the web app **and** `COOKIE_DOMAIN` is set on the server to
that shared domain. On a plain `*.vercel.app` + `*.railway.app` pair the two are
cross-site, the session cookie is not sent, and the socket connects
unauthenticated.

🔴 **Important:** Redeploy Vercel after setting environment variables!

## 📦 Project Structure

```
huddle/
├── apps/
│   ├── web/                      # Next.js 16 frontend (port 3002)
│   ├── server/                   # Express + Socket.IO + Prisma backend (port 4000)
│   └── extension-netflix-party/  # MV3 Chrome extension for Netflix sync
├── packages/
│   ├── shared-logic/             # useRoom() Socket.IO & WebRTC hooks, shared types
│   ├── eslint-config/            # Shared ESLint config
│   └── typescript-config/        # Shared tsconfig bases
├── mobile/android/               # Native Android client (Kotlin, Gradle)
└── scripts/
```

npm workspaces cover `apps/*` and `packages/*` only. `mobile/android` is a
separate Gradle project and is not part of any turbo task.

## 🛠️ Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind
- **Backend:** Express, Socket.IO, Prisma, PostgreSQL
- **Real-time:** Socket.IO, WebRTC
- **Clients:** Web, Chrome extension (Netflix sync), native Android (Kotlin)
- **Monorepo:** Turborepo + npm workspaces
- **Hosting:** Vercel (web) + Railway (server)

## 🐛 Troubleshooting

### Login doesn't work

- ✅ Set `API_PROXY_TARGET` in Vercel
- ✅ Set `CORS_ORIGINS` in Railway
- ✅ Redeploy Vercel after env changes

### Socket disconnects immediately

- ✅ Check Railway logs for CORS errors — an empty `CORS_ORIGINS` denies every
  browser origin in production
- ✅ Prefer leaving `NEXT_PUBLIC_SOCKET_SERVER_URL` unset so the handshake goes
  through the same-origin rewrite and carries the session cookie
- ✅ If you do set it, use `wss://` not `ws://`

Check the backend health endpoint (`/health`) to test connectivity.

## 📝 License

MIT

---

## Turborepo Info

This project uses Turborepo for monorepo management.

### Commands

To build all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo build

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo build
yarn dlx turbo build
pnpm exec turbo build
```

You can build a specific package by using a [filter](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo build --filter=docs

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo build --filter=docs
yarn exec turbo build --filter=docs
pnpm exec turbo build --filter=docs
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev
yarn exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev --filter=web

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev --filter=web
yarn exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo login

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo login
yarn exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo link

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo link
yarn exec turbo link
pnpm exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.com/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.com/docs/reference/configuration)
- [CLI Usage](https://turborepo.com/docs/reference/command-line-reference)
