import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('config.js', () => {
  beforeEach(() => {
    delete window.__EMULATOR_API_BASE_URL__;
    vi.resetModules();
  });

  it('sets the emulator API base url on window', async () => {
    await import('../config.js');
    expect(window.__EMULATOR_API_BASE_URL__).toBe('http://localhost:3001');
  });
});
