# Huddle 🍿

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

- Node.js 20+
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
DATABASE_URL=postgresql://user:password@localhost:5432/huddle
CORS_ORIGINS=
NODE_ENV=development
```

3. **Database setup:**

```bash
cd apps/server
npm run db:deploy  # Run migrations
npm run build      # Generate Prisma client
```

4. **Frontend environment** (`apps/web/.env.local`):

```env
API_PROXY_TARGET=http://localhost:4000
```

5. **Start everything:**

```bash
npm run dev
```

- 🌐 Web: http://localhost:3002
- 🔌 Backend: http://localhost:4000
- 🔍 Diagnostics: http://localhost:3002/diagnostic

## 🌐 Production Deployment

**See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for complete instructions.**

### Quick Deploy Checklist

**Railway (Backend):**

```env
DATABASE_URL=<railway-postgres-url>
CORS_ORIGINS=https://yourdomain.com
NODE_ENV=production
```

**Vercel (Frontend):**

```env
API_PROXY_TARGET=https://your-backend.railway.app
NEXT_PUBLIC_SOCKET_SERVER_URL=wss://your-backend.railway.app
```

🔴 **Important:** Redeploy Vercel after setting environment variables!

## 📦 Project Structure

```
huddle/
├── apps/
│   ├── web/              # Next.js frontend
│   ├── server/           # Express backend
│   └── docs/             # Documentation
├── packages/
│   ├── shared-logic/     # Socket.IO & WebRTC hooks
│   ├── ui/               # Shared components
│   └── eslint-config/    # Shared configs
└── mobile/               # React Native (WIP)
```

## 🛠️ Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind
- **Backend:** Express, Socket.IO, Prisma, PostgreSQL
- **Real-time:** Socket.IO, WebRTC
- **Hosting:** Vercel + Railway

## 🐛 Troubleshooting

### Login doesn't work

- ✅ Set `API_PROXY_TARGET` in Vercel
- ✅ Set `CORS_ORIGINS` in Railway
- ✅ Redeploy Vercel after env changes

### Socket disconnects immediately

- ✅ Check Railway logs for CORS errors
- ✅ Use `wss://` not `ws://` for production

Visit `/diagnostic` page to test connectivity.

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
