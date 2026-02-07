# Retro Emulator (Local Proxy)

![DEC VT100 emulator showing the Claude VT boot screen](cvt100.png)

This repo runs via a local proxy where users supply their own API key.

## Local Proxy (Bring Your Own Key)

1. Create a `.env` file in the repo root:

```bash
ANTHROPIC_API_KEY=your_key_here
```

2. Start the proxy:

```bash
npm run proxy
```

Optional: override the port (default `3001`):

```bash
PROXY_PORT=3001 npm run proxy
```

3. Point the frontend at the proxy by defining a base URL before the app loads:

Option A: Vite env (recommended for builds)

Create or update `.env`:

```bash
VITE_EMULATOR_API_BASE_URL=http://localhost:3001
```

Option B: Global override (useful for static hosting or quick tests)

```html
<script>
  window.__EMULATOR_API_BASE_URL__ = 'http://localhost:3001';
</script>
```

The client will call `http://localhost:3001/v1/messages`, and the proxy injects the API key.

## One-Command Dev (Proxy + App)

1. Install dependencies:

```bash
npm install
```

2. Run the dev servers:

```bash
npm run dev
```

This starts the proxy on `http://localhost:3001` and the app on Vite's dev server (typically `http://localhost:5173`).

## Notes

- The proxy is intentionally minimal and does not store data.
- The proxy binds to `127.0.0.1` by default and is intended for local use only.
- If you ever expose the proxy publicly, add authentication and rate limiting first.
- The client does not accept browser-injected API keys; use the proxy.
- If you change the proxy host or port, update the `connect-src` directive in `index.html` to allow that origin.
