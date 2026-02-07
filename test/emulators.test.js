import { describe, it, expect } from 'vitest';
import { EMULATORS, COLOR_THEMES } from '../emulators';

describe('emulators catalog', () => {
  it('exposes known emulator ids', () => {
    expect(EMULATORS.vt100).toBeDefined();
    expect(EMULATORS.c64).toBeDefined();
    expect(EMULATORS.apple2).toBeDefined();
  });

  it('has a default theme and named themes', () => {
    expect(COLOR_THEMES.default).toBeNull();
    expect(COLOR_THEMES.synthwave).toBeDefined();
    expect(COLOR_THEMES.miami).toBeDefined();
  });

  it('formats vt100 responses with a boxed header', () => {
    const output = EMULATORS.vt100.responseStyle('Hello');
    expect(output).toContain('┌─ CLAUDE');
    expect(output).toContain('Hello');
    expect(output).toContain('└');
  });

  it('formats c64 responses with uppercase and READY trailer', () => {
    const output = EMULATORS.c64.responseStyle('hello');
    expect(output).toContain('HELLO');
    expect(output).toContain('READY.');
  });
});
