import { describe, it, expect } from 'vitest';
import {
  normalizeAsciiLines,
  normalizeAsciiText,
  containsBoxChars,
  stripCodeFences,
  stripFenceLines,
  prefixLines,
  formatPlain,
  formatWithTrailer,
  formatBoxed,
} from '../formatters';

describe('formatters', () => {
  it('normalizes box lines and pads right borders', () => {
    const lines = ['│abc'];
    const result = normalizeAsciiLines(lines, 6);
    expect(result).toEqual(['│abc │']);
  });

  it('pads repeated characters to column width', () => {
    const lines = ['-----'];
    const result = normalizeAsciiLines(lines, 8);
    expect(result).toEqual(['--------']);
  });

  it('normalizes only box/mono lines in a multi-line string', () => {
    const text = ['-----', 'Hello', '│Hi'].join('\n');
    const result = normalizeAsciiText(text, 6);
    const lines = result.split('\n');
    expect(lines[0]).toBe('------');
    expect(lines[1]).toBe('Hello');
    expect(lines[2]).toBe('│Hi  │');
  });

  it('detects box characters in any line', () => {
    expect(containsBoxChars('Hello')).toBe(false);
    expect(containsBoxChars('┌──┐\n| ok |')).toBe(true);
  });

  it('strips full fenced code blocks', () => {
    const fenced = '```\nhello\n```';
    expect(stripCodeFences(fenced)).toBe('hello');
    expect(stripCodeFences('no fences')).toBe('no fences');
  });

  it('strips fence lines while keeping content', () => {
    const text = ['```', 'line one', 'line two', '```'].join('\n');
    expect(stripFenceLines(text)).toBe('line one\nline two');
  });

  it('prefixes each line', () => {
    expect(prefixLines('a\nb', '> ')).toBe('> a\n> b');
  });

  it('formats plain text with optional uppercase and trailing newline', () => {
    expect(formatPlain('hello', { uppercase: true, trailingNewline: false }))
      .toBe('\nHELLO');
  });

  it('formats with trailer and gap lines', () => {
    const result = formatWithTrailer('hi', 'READY', { gapLines: 1 });
    expect(result).toBe('\nhi\n\nREADY\n');
  });

  it('formats boxed content with before/after lines', () => {
    const result = formatBoxed('ok', {
      top: 'TOP',
      bottom: 'BOT',
      linePrefix: '| ',
      beforeLines: ['|'],
      afterLines: ['|'],
    });

    expect(result).toBe('\nTOP\n|\n| ok\n|\nBOT\n');
  });
});
