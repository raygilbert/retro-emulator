import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = Number(process.env.PROXY_PORT || 3001);
const API_URL = 'https://api.anthropic.com/v1/messages';
const LISTEN_HOST = process.env.PROXY_HOST || '127.0.0.1';

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Allow non-browser clients (curl, etc.)
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

const loadEnvFile = () => {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, 'utf8');
  const parsed = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    parsed[key] = value;
  }
  return parsed;
};

const envFromFile = loadEnvFile();
const API_KEY = envFromFile.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Add it to .env or your environment.');
  process.exit(1);
}

const sendJson = (res, status, payload, origin) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, anthropic-version, Anthropic-Version',
  });
  res.end(JSON.stringify(payload));
};

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  const requestId = Math.random().toString(36).slice(2, 8);
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    console.log(`[${requestId}] BLOCKED origin=${origin || 'none'}`);
    sendJson(res, 403, { error: 'Origin not allowed' }, 'null');
    return;
  }

  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] OPTIONS ${req.url} origin=${origin || 'none'}`);
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin || 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, anthropic-version, Anthropic-Version',
    });
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/v1/messages') {
    console.log(`[${requestId}] 404 ${req.method} ${req.url}`);
    sendJson(res, 404, { error: 'Not found' }, origin || 'null');
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 2_000_000) req.destroy();
  });

  req.on('end', async () => {
    try {
      console.log(`[${requestId}] POST /v1/messages bytes=${body.length}`);
      const payload = JSON.parse(body || '{}');
      console.log(`[${requestId}] model=${payload?.model || 'unknown'} max_tokens=${payload?.max_tokens || 'unknown'}`);
      const upstream = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });

      const text = await upstream.text();
      const durationMs = Date.now() - startedAt;
      console.log(
        `[${requestId}] upstream status=${upstream.status} bytes=${text.length} duration_ms=${durationMs}`
      );
      console.log(`[${requestId}] upstream body preview=${text.slice(0, 200)}`);
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': origin || 'null',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, anthropic-version, Anthropic-Version',
      });
      res.end(text);
    } catch (error) {
      console.log(`[${requestId}] error ${error.message || error}`);
      sendJson(res, 500, { error: error.message || 'Proxy error' }, origin || 'null');
    }
  });
});

server.listen(PORT, LISTEN_HOST, () => {
  console.log(`Claude proxy listening on http://${LISTEN_HOST}:${PORT}`);
});
