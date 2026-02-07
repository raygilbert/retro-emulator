# Security Best Practices Report

## Executive Summary
This review covers the React frontend and the local proxy server. The client is proxy-only by design; direct browser API key injection is not supported. The proxy is constrained to localhost binding and localhost-only origins, limiting exposure to the local machine. A CSP is defined via `<meta http-equiv="Content-Security-Policy">`, but edge/runtime headers are still recommended for full coverage (e.g., `frame-ancestors` is not supported in meta CSP).

No secrets, API keys, PII, or critical vulnerabilities were found in the committed source code.

## Critical
None found.

## High
None found.

## Medium

### 1) REACT-CSP-001 / REACT-HEADERS-001 -- CSP present via meta; verify edge headers
- **Severity:** Medium
- **Location:** `index.html` lines 7-17
- **Evidence:**
  ```html
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ..."
  />
  ```
- **Impact:** Meta CSP provides defense-in-depth for XSS but does not support `frame-ancestors` and is less authoritative than HTTP headers. Without edge/runtime headers, clickjacking protections and other headers (e.g., `X-Content-Type-Options`, `X-Frame-Options`) may be missing.
- **Fix:** Set CSP and security headers at the edge/server (preferred), including `frame-ancestors` or `X-Frame-Options`.
- **Mitigation:** Keep the app free of dangerous sinks (no `dangerouslySetInnerHTML`, no `eval`) and minimize third-party scripts.
- **Note:** `style-src 'unsafe-inline'` is required because the component renders a dynamic `<style>` tag (`retro-emulator.jsx` line 609). The values injected into that style block come from hardcoded emulator/theme color definitions and are not user-controllable, so this does not create a CSS injection vector. However, `'unsafe-inline'` for styles does widen the CSP surface area; replacing the dynamic style tag with CSS custom properties or a stylesheet would allow removing it.
- **False positive notes:** If your hosting platform already sets these headers, confirm at runtime and align policies.

## Low

### 2) PROXY-LOCAL-001 -- Local-only proxy hardening (localhost binding + origin allowlist)
- **Severity:** Low
- **Location:** `proxy/server.js` lines 1-124
- **Evidence:**
  ```js
  const LISTEN_HOST = process.env.PROXY_HOST || '127.0.0.1';
  ...
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  ...
  'Access-Control-Allow-Origin': origin || 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, anthropic-version, Anthropic-Version',
  ```
- **Impact:** With localhost binding and origin checks, exposure is limited to local use. If these guards are removed and the proxy is exposed publicly, it becomes an open relay for the API key.
- **Fix:** Keep the proxy bound to `127.0.0.1` and restrict CORS to localhost origins only (already implemented).
- **Mitigation:** If you ever need LAN access, add authentication and rate limiting before loosening the origin/host restrictions.
- **Escalation note:** If `PROXY_HOST` is set to `0.0.0.0` or a LAN interface, reassess this finding as High severity.

---

## Secrets and Credentials Audit
- **No hardcoded API keys or secrets** in any committed source file.
- `.env` files are excluded via `.gitignore` (pattern: `.env` and `.env.*`).
- `README.md` contains the placeholder `ANTHROPIC_API_KEY=your_key_here` for documentation purposes only.
- Test files use dummy values (`test-key`, `fromfile`) that are not real credentials.
- The proxy loads the API key exclusively from `.env` or the process environment; the key is never sent to the client.
- The client explicitly blocks direct API access to `api.anthropic.com` (`retro-emulator.jsx` line 347).

## XSS and DOM Safety Audit
- No `dangerouslySetInnerHTML`, `eval()`, `new Function()`, or `document.write()` in application code.
- All user input is rendered via React's default escaping (JSX text content).
- API responses are rendered as text content in `<div>` elements, not as raw HTML.
- The `sanitizeHistory` function (`retro-emulator.jsx` lines 18-26) validates items loaded from `localStorage` before use.

## Notes
- `localStorage` is used in the app runtime (`retro-emulator.jsx` lines 32-51) to persist non-sensitive UI preferences: selected emulator, color theme, and keyboard visibility. No credentials, tokens, or PII are stored. Data read from `localStorage` is validated via `JSON.parse` with a try/catch and type-checked before use.
- Inline bootstrapping script was moved to `config.js` to keep CSP strict without `script-src 'unsafe-inline'`.
- The proxy enforces a 2MB request body limit (`proxy/server.js` line 84) and only forwards `POST /v1/messages`.
- This review is limited to the repository source code. Runtime headers, hosting configuration, and infrastructure controls were not inspected.
