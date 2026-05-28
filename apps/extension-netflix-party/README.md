# Huddle for Netflix — Chrome extension

Syncs Netflix playback across friends watching together in the same Huddle
room. Pairs with the website at [wehuddle.tv](https://wehuddle.tv) and the
Android app — all three clients speak the same `sync_video` socket protocol
against `api.wehuddle.tv`.

## What it does

When you load a `netflix.com/watch/<id>` URL with the extension active and
connected to a room, it:

1. Finds the page's `<video>` element (handles Netflix's Shadow DOM + iframe
   reparenting).
2. Listens for `play` / `pause` / `seeked` events and forwards them to the
   room's socket server.
3. Receives the same events from other room members and applies them locally
   (with throttling to avoid feedback loops).
4. Shows a small overlay on the page with the current sync state and an
   embedded chat input.

Each user signs into their own Netflix account — Huddle never proxies the
content stream itself. Playback uses Netflix's own Widevine session on each
client.

## Why an extension at all

Netflix can't be embedded in a regular webpage. It sets
`X-Frame-Options: DENY` on every response and Widevine DRM is bound to the
top-level browsing context. The only realistic paths are (a) a browser
extension running inside the netflix.com tab, or (b) a native app with an
embedded WebView. This is the (a) path. The Android app is the (b) path.

## Architecture

```
src/
  background.ts       Service worker. Brokers messages from popup to content.
  popup.ts            Popup UI controller. Stores roomId in chrome.storage.
  content.ts          Vite entry. Bootstraps src/content/init.ts.
  content/
    init.ts           Wires up event listeners + connects on load.
    socket.ts         socket.io-client wrapper. Handles connect/disconnect,
                      sync emit, sync receive.
    playerSync.ts     The <video> element binding. Applies remote events
                      and broadcasts local ones with feedback-loop guard.
    video.ts          Finds the <video> across Shadow DOM and iframes.
    overlay.ts        In-page floating sync status + chat input.
    chat.ts           Chat overlay message rendering.
    netflixBackground.ts  Helpers that send commands to the background
                          script (used when the content script can't act
                          directly, e.g. CSP-restricted contexts).
    syncUtils.ts      Predicates for "should I emit this local event"
                      (feedback dedupe, intent windows).
    state.ts          In-memory state object passed between modules.
    config.ts         Reads roomId from chrome.storage.
    constants.ts      Server URL + storage key constants.
    log.ts            Debug-prefixed console.log wrapper.
    types.ts          Shared TS types.
  types.d.ts          chrome.* ambient types.

public/
  manifest.json       MV3 manifest. Permissions: storage, activeTab, scripting.
                      Host: https://www.netflix.com/*.
  popup.html          Popup markup + styles.
  icon{16,48,128}.png Extension icons.
```

## Building locally

```
npm install                              # from repo root
npm --workspace huddle-netflix-party-extension run build
```

Output lands in `apps/extension-netflix-party/dist/`. Load that folder as an
unpacked extension in Chrome:

1. `chrome://extensions/`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → pick the `dist/` folder
4. Pin the extension to the toolbar

Watch mode:

```
npm --workspace huddle-netflix-party-extension run dev
```

Reload the extension in `chrome://extensions/` after each rebuild.

## Testing

The extension only activates on `https://www.netflix.com/watch/*`. To test:

1. Build + load unpacked
2. Create a room at [wehuddle.tv](https://wehuddle.tv) and copy the room ID
   from the URL (the bit after `/r/`)
3. Open `https://www.netflix.com/watch/<title-id>` (sign in if needed)
4. Click the Huddle extension icon → paste the room ID → **Connect**
5. The overlay should show "Connected: \<room id\>"; play/pause/seek should
   now broadcast to everyone else in the room

Multi-tab test: open the same room in a second browser profile or incognito
window, both should stay in sync.

## Publishing a new version

1. Bump `version` in `public/manifest.json` (e.g. `1.1.0`)
2. `npm run build`
3. Zip `dist/`: `cd dist && zip -r ../huddle-netflix-party-<version>.zip .`
4. Upload to the Chrome Web Store developer dashboard
5. Submit for review (~1-3 days)

The `version` in manifest.json must be monotonically increasing.

## Known limitations

- **Netflix UI redesigns** can break the `<video>` element selector or the
  Shadow DOM walker in `content/video.ts`. When that happens, playback still
  works but sync stops. Watch for it after any major Netflix client update.
- **Multi-user volume** isn't synced — each viewer controls their own audio.
- **Subtitles + audio track** aren't synced. Each viewer picks their own.
- **No iOS support** — Safari extensions need an Xcode wrapper app + Apple
  Developer Program ($99/yr) plus App Review approval. Out of scope for now.

## Maintenance treadmill

This is a Netflix-style player wrapper, which means Netflix can break us at
any time. Every major Netflix UI redesign has historically required fixes
within 1-2 weeks. Plan for at least quarterly maintenance touchups; monitor
the [Chrome Web Store listing's reviews](https://chromewebstore.google.com/detail/huddle-for-netflix/mmghgnlloogcifdblldihfmjoefabohc)
for user reports of broken playback.

## Links

- **Chrome Web Store**: <https://chromewebstore.google.com/detail/huddle-for-netflix/mmghgnlloogcifdblldihfmjoefabohc>
- **Website**: <https://wehuddle.tv>
- **Netflix help page on the site**: <https://wehuddle.tv/netflix>
