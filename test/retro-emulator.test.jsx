import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STORAGE_KEY } from '../retro-emulator.jsx';

describe('RetroEmulator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (window.__EMULATOR_API_BASE_URL__) {
      delete window.__EMULATOR_API_BASE_URL__;
    }
  });

  const boot = async () => {
    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });
  };

  const runCommand = async (user, input, command) => {
    await act(async () => {
      await user.clear(input);
      await user.type(input, command);
      await user.keyboard('{Enter}');
    });
  };

  const renderEmulator = async ({ baseUrl } = {}) => {
    if (baseUrl) {
      window.__EMULATOR_API_BASE_URL__ = baseUrl;
    } else if (window.__EMULATOR_API_BASE_URL__) {
      delete window.__EMULATOR_API_BASE_URL__;
    }
    vi.resetModules();
    const { default: RetroEmulator } = await import('../retro-emulator.jsx');
    return render(<RetroEmulator />);
  };

  it('boots and enables input', async () => {
    await renderEmulator();
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    await boot();
    expect(input).toBeEnabled();
  });

  it('renders help output for /help', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/help');

    expect(screen.getByText(/AVAILABLE COMMANDS/)).toBeInTheDocument();
  });

  it('toggles keyboard display with /keyboard', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    expect(screen.getByText('KEYBOARD')).toBeInTheDocument();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/keyboard');

    expect(screen.queryByText('KEYBOARD')).not.toBeInTheDocument();
  });

  it('clears the terminal with /clear', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/help');
    expect(screen.getByText(/AVAILABLE COMMANDS/)).toBeInTheDocument();

    await runCommand(user, input, '/clear');

    expect(screen.queryByText(/AVAILABLE COMMANDS/)).not.toBeInTheDocument();
  });

  it('lists emulators in chronological order with /list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/list');

    const list = screen.getByText(/AVAILABLE EMULATORS/);
    const text = list.textContent || '';
    const appleIndex = text.indexOf('apple2');
    const vtIndex = text.indexOf('vt100');
    const amigaIndex = text.indexOf('amiga');
    expect(appleIndex).toBeGreaterThan(-1);
    expect(vtIndex).toBeGreaterThan(-1);
    expect(amigaIndex).toBeGreaterThan(-1);
    expect(appleIndex).toBeLessThan(vtIndex);
    expect(vtIndex).toBeLessThan(amigaIndex);
  });

  it('shows emulator details with /about', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/about');

    expect(screen.getByText(/The terminal that defined terminal emulation/)).toBeInTheDocument();
  });

  it('switches emulator with /emu and updates the header', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/emu c64');

    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByText(/Commodore 64/)).toBeInTheDocument();
  });

  it('restores settings from localStorage on load', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ currentEmulator: 'msdos', colorTheme: 'amber', showKeyboard: false })
    );

    await renderEmulator();
    await boot();

    expect(screen.getByText(/MS-DOS/)).toBeInTheDocument();
    expect(screen.queryByText('KEYBOARD')).not.toBeInTheDocument();
  });

  it('reports unknown emulator names', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/emu notreal');

    expect(screen.getByText(/Unknown emulator/)).toBeInTheDocument();
  });

  it('changes theme with /theme', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/theme miami');

    expect(screen.getByText(/Theme changed to: MIAMI/)).toBeInTheDocument();
  });

  it('supports quoted arguments in commands', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/theme "miami"');

    expect(screen.getByText(/Theme changed to: MIAMI/)).toBeInTheDocument();
  });

  it('persists settings after user changes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/emu msdos');
    await boot();
    await runCommand(user, input, '/theme miami');
    await runCommand(user, input, '/keyboard');

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(stored).toMatchObject({
      currentEmulator: 'msdos',
      colorTheme: 'miami',
      showKeyboard: false,
    });
  });

  it('rejects unknown themes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/theme neon');

    expect(screen.getByText(/Unknown theme/)).toBeInTheDocument();
  });

  it('shows a helpful error for unknown commands', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEmulator();
    await boot();

    const input = screen.getByRole('textbox');
    await runCommand(user, input, '/nope');

    expect(screen.getByText(/Unknown command/)).toBeInTheDocument();
  });

  it('sends a message and renders the response', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/plain' },
      text: async () => 'Hello there',
    });
    global.fetch = fetchMock;

    await renderEmulator({ baseUrl: 'http://localhost' });
    await boot();

    const input = screen.getByRole('textbox');
    await act(async () => {
      await user.type(input, 'hello');
      await user.keyboard('{Enter}');
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText(/Hello there/)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/messages'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows a direct API access error when using the default host', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await renderEmulator({ baseUrl: 'https://api.anthropic.com' });
    await boot();

    const input = screen.getByRole('textbox');
    await act(async () => {
      await user.type(input, 'hello');
      await user.keyboard('{Enter}');
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText(/Direct API access is disabled\. Use the local proxy\./))
      .toBeInTheDocument();
  });

  it('renders API error responses from the server', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'text/plain' },
      text: async () => 'Bad API key',
    });
    global.fetch = fetchMock;

    await renderEmulator({ baseUrl: 'http://localhost' });
    await boot();

    const input = screen.getByRole('textbox');
    await act(async () => {
      await user.type(input, 'hello');
      await user.keyboard('{Enter}');
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText(/ERROR: Bad API key Check your API key and permissions\./))
      .toBeInTheDocument();
  });

  it('strips code fences from model responses', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ content: [{ text: '```\nhello\n```' }] }),
      text: async () => '',
    });
    global.fetch = fetchMock;

    await renderEmulator({ baseUrl: 'http://localhost' });
    await boot();

    const input = screen.getByRole('textbox');
    await act(async () => {
      await user.type(input, 'hello');
      await user.keyboard('{Enter}');
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText(/hello/)).toBeInTheDocument();
    expect(screen.queryByText('```')).not.toBeInTheDocument();
  });
});
