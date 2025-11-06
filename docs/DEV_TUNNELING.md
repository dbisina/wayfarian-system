# Dev tunneling for stable API base

When your LAN IP changes, mobile devices lose the API connection. You can avoid that by tunneling your local server and pasting a stable URL into the app’s API override (persisted in AsyncStorage).

The app now supports a developer override (saved as `apiOverrideUrl`). Set it in the OAuth Debug screen:
- Paste your tunnel URL (with or without `/api` – we’ll normalize it)
- Save Override → Ping to verify
- Clear Override to return to auto-detect

## Options

### 1) Cloudflare Tunnel (quick / no account)
Ephemeral, great for testing.

- Start your server (localhost:3001)
- Run:
  - Windows: `cloudflared tunnel --protocol http2 --url http://localhost:3001`
    - Tip: forcing `--protocol http2` avoids QUIC/UDP issues on restricted networks
- Copy the printed URL, e.g. `https://<random>.trycloudflare.com`
- In app: Override with `https://<random>.trycloudflare.com/api`

If you see `Failed to dial a quic connection` errors, your network likely blocks UDP/QUIC; `--protocol http2` uses TCP over 443 and usually works.

The INFO/ERR logs about origin certificates are harmless for quick tunnels (only named tunnels use origin certs).

### 2) Cloudflare Tunnel (named / stable domain)
Requires a Cloudflare account and a domain. Gives you a durable hostname.

- Login (one-time): `cloudflared tunnel login`
- Create: `cloudflared tunnel create wayfarian-local`
- Route DNS: `cloudflared tunnel route dns wayfarian-local api.wayfarian-dev.yourdomain.com`
- Run: `cloudflared tunnel run wayfarian-local --protocol http2`
- In app: Override with `https://api.wayfarian-dev.yourdomain.com/api`

### 3) ngrok (simple)
- Run: `ngrok http 3001`
- Copy the HTTPS URL, e.g. `https://<sub>.ngrok.app`
- In app: Override with `https://<sub>.ngrok.app/api`
- For a stable domain, reserve one in ngrok and reuse it.

### 4) Tailscale (private, no public exposure)
Peer-to-peer VPN; works on cellular + LAN.

- Install Tailscale on your PC and phone; enable MagicDNS
- Your machine will get a stable name like `http://my-pc.tailnet-name.ts.net:3001`
- In app: Override with `http://my-pc.tailnet-name.ts.net:3001/api`

## CORS
If your server enforces CORS, allow your tunnel origin in dev. A permissive dev config in Express:

```js
app.use(require('cors')({ origin: true, credentials: true }));
```

If you restrict origins, add your tunnel domain(s) to the allowlist.

## Where the override is stored
- Key: `apiOverrideUrl` (AsyncStorage)
- Helpers: `getApiOverride`, `setApiOverride`, `clearApiOverride`
- The app auto-appends `/api` if missing and prefers the override over auto-detection.
