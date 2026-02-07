import React, { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const renderSpy = vi.fn();
const createRootSpy = vi.fn(() => ({ render: renderSpy }));

vi.mock('react-dom/client', () => ({
  createRoot: createRootSpy,
}));

describe('src/main.jsx', () => {
  beforeEach(() => {
    renderSpy.mockClear();
    createRootSpy.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
    vi.resetModules();
  });

  it('creates a root and renders the app', async () => {
    await import('../src/main.jsx');

    const rootElement = document.getElementById('root');
    expect(createRootSpy).toHaveBeenCalledWith(rootElement);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    const [rendered] = renderSpy.mock.calls[0];
    expect(rendered).toEqual(expect.objectContaining({ type: StrictMode }));
  });
});
