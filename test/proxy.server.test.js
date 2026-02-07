import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

let handler;

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal();
  const createServer = (cb) => {
    handler = cb;
    return { listen: vi.fn() };
  };
  return {
    ...actual,
    default: { ...actual, createServer },
    createServer,
  };
});

const createReq = ({ method, url, origin, body }) => {
  const handlers = {};
  return {
    method,
    url,
    headers: origin ? { origin } : {},
    on: (event, cb) => {
      handlers[event] = cb;
    },
    trigger: () => {
      if (body != null && handlers.data) {
        handlers.data(body);
      }
      if (handlers.end) {
        handlers.end();
      }
    },
    destroy: vi.fn(),
  };
};

const createRes = () => {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('proxy/server.js', () => {
  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    await import('../proxy/server.js');
  });

  afterAll(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('rejects disallowed origins', async () => {
    const req = createReq({
      method: 'POST',
      url: '/v1/messages',
      origin: 'https://evil.com',
      body: '{}',
    });
    const res = createRes();

    await handler(req, res);

    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toEqual({ error: 'Origin not allowed' });
  });

  it('handles preflight requests', async () => {
    const req = createReq({
      method: 'OPTIONS',
      url: '/v1/messages',
      origin: 'http://localhost:5173',
      body: null,
    });
    const res = createRes();

    await handler(req, res);

    expect(res.status).toBe(204);
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('returns 404 for unknown routes', async () => {
    const req = createReq({
      method: 'GET',
      url: '/nope',
      origin: 'http://localhost:5173',
      body: null,
    });
    const res = createRes();

    await handler(req, res);

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Not found' });
  });

  it('proxies requests to the upstream API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ ok: true }),
    });
    global.fetch = fetchMock;

    const req = createReq({
      method: 'POST',
      url: '/v1/messages',
      origin: 'http://localhost:5173',
      body: JSON.stringify({ message: 'hello' }),
    });
    const res = createRes();

    await handler(req, res);
    req.trigger();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      })
    );

    expect(res.status).toBe(200);
    expect(res.body).toBe(JSON.stringify({ ok: true }));
  });

  it('accepts requests with no Origin header (non-browser clients)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ ok: true }),
    });
    global.fetch = fetchMock;

    const req = createReq({
      method: 'POST',
      url: '/v1/messages',
      origin: undefined,
      body: JSON.stringify({ message: 'hello' }),
    });
    const res = createRes();

    await handler(req, res);
    req.trigger();
    await flushPromises();

    expect(res.status).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('null');
  });

  it('returns 500 when the payload is invalid JSON', async () => {
    const req = createReq({
      method: 'POST',
      url: '/v1/messages',
      origin: 'http://localhost:5173',
      body: '{',
    });
    const res = createRes();

    await handler(req, res);
    req.trigger();
    await flushPromises();

    expect(res.status).toBe(500);
    const payload = JSON.parse(res.body);
    expect(payload.error).toBeTruthy();
  });

  it('destroys the request when the body is too large', async () => {
    const req = createReq({
      method: 'POST',
      url: '/v1/messages',
      origin: 'http://localhost:5173',
      body: 'a'.repeat(2_000_001),
    });
    const res = createRes();

    await handler(req, res);
    req.trigger();

    expect(req.destroy).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });
});
