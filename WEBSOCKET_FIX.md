# WebSocket Connection Fix

## Problem

WebSocket connections were failing with:

- 308 Permanent Redirect during WebSocket handshake
- 400 Bad Request on polling fallback
- Consistent disconnections from socket server

## Root Causes

1. **Missing explicit path configuration** - Socket.IO client and server weren't explicitly configured with the `/socket.io` path
2. **Transport configuration mismatch** - Server wasn't properly configured to allow transport upgrades
3. **HTTPS redirect issues** - WebSocket upgrade was hitting redirects in production
4. **Insufficient error logging** - Hard to diagnose connection issues

## Changes Made

### 1. Client Configuration (`packages/shared-logic/src/index.ts`)

```typescript
socketRef.current = io(SERVER_URL, {
  transports: ["polling", "websocket"],
  autoConnect: false,
  withCredentials: true,
  path: "/socket.io", // ✅ Explicit path
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
});
```

### 2. Server Configuration (`apps/server/index.js`)

```javascript
const io = new Server(server, {
  cors: {
    /* ... */
  },
  path: "/socket.io", // ✅ Explicit path
  transports: ["polling", "websocket"], // ✅ Both transports
  allowUpgrades: true, // ✅ Allow upgrade from polling to WebSocket
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  allowEIO3: true,
});
```

### 3. Enhanced Error Logging

Added detailed logging on both client and server to help diagnose future issues.

## Testing

### Local Development

1. Start the server: `cd apps/server && npm run dev`
2. Start the web app: `cd apps/web && npm run dev`
3. Check browser console for connection logs
4. Should see: "Connected to socket server"

### Production Deployment

#### If using Vercel/Netlify (Serverless)

⚠️ **Important**: Socket.IO requires a long-running server. Serverless functions won't work!

**Solution**: Deploy the server separately:

- Use Railway, Render, DigitalOcean App Platform, or similar
- Set `NEXT_PUBLIC_SOCKET_SERVER_URL` to your server URL
- Ensure CORS is configured correctly in `CORS_ORIGINS` env var

#### If using VPS/Cloud VM

1. Ensure your reverse proxy (Nginx, Apache, Caddy) handles WebSocket upgrades:

**Nginx Configuration:**

```nginx
location /socket.io/ {
    proxy_pass http://localhost:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Increase timeouts for long-polling
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
    proxy_read_timeout 7d;
}
```

**Caddy Configuration:**

```caddy
yourdomain.com {
    reverse_proxy /socket.io/* localhost:4000 {
        transport http {
            keepalive 7d
        }
    }
}
```

2. If using HTTPS, ensure your Socket.IO server URL uses `https://` or is same-origin

## Environment Variables

### Server (`apps/server/.env`)

```env
PORT=4000
CORS_ORIGINS=https://yourdomain.com,http://localhost:3000
NODE_ENV=production
DATABASE_URL=postgresql://...
```

### Web App (`apps/web/.env.local`)

```env
# For same-origin connection (recommended for production):
NEXT_PUBLIC_SOCKET_SERVER_URL=

# OR for separate server (development/different domains):
NEXT_PUBLIC_SOCKET_SERVER_URL=https://your-server-domain.com
```

## Troubleshooting

### Still seeing 308 errors?

1. Check if your hosting provider forces HTTPS redirects
2. Ensure `NEXT_PUBLIC_SOCKET_SERVER_URL` matches your current protocol (http/https)
3. Use same-origin connection in production by setting `NEXT_PUBLIC_SOCKET_SERVER_URL=`

### Still seeing 400 errors?

1. Check CORS configuration in server `CORS_ORIGINS`
2. Verify the server is actually running and accessible
3. Check browser console for detailed error messages
4. Check server logs for connection_error events

### Connection succeeds but immediately disconnects?

1. Check firewall rules allow WebSocket connections
2. Verify reverse proxy timeout settings
3. Check server logs for authentication errors

### Polling works but WebSocket upgrade fails?

This is normal and not a problem! Socket.IO will continue using long-polling, which works fine for most use cases.

If you want WebSocket upgrade to succeed:

1. Verify proxy configuration allows `Upgrade` header
2. Check if any CDN/WAF is blocking WebSocket connections
3. Ensure `allowUpgrades: true` is set on server

## Additional Resources

- [Socket.IO Troubleshooting](https://socket.io/docs/v4/troubleshooting-connection-issues/)
- [Socket.IO Behind a Reverse Proxy](https://socket.io/docs/v4/reverse-proxy/)
