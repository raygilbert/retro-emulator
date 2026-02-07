import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual, createServer: () => ({ listen: vi.fn() }) },
    createServer: () => ({ listen: vi.fn() }),
  };
});

const loadModule = async () => import('../proxy/server.js');

describe('proxy/server.js env handling', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('exits when no API key is configured', async () => {
    vi.resetModules();
    const cwd = process.cwd();
    const tmp = mkdtempSync(join(tmpdir(), 'retro-emulator-'));
    process.chdir(tmp);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(loadModule()).rejects.toThrow('exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    process.chdir(cwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('loads the API key from .env when present', async () => {
    vi.resetModules();
    const cwd = process.cwd();
    const tmp = mkdtempSync(join(tmpdir(), 'retro-emulator-'));
    writeFileSync(join(tmp, '.env'), 'ANTHROPIC_API_KEY=fromfile\n', 'utf8');
    process.chdir(tmp);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    await expect(loadModule()).resolves.toBeDefined();
    expect(exitSpy).not.toHaveBeenCalled();
    process.chdir(cwd);
    rmSync(tmp, { recursive: true, force: true });
  });
});
