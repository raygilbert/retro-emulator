// ============================================================================
// ASCII ART NORMALIZATION
// ============================================================================

const BOX_LEFT_CHARS = new Set(['│', '║', '┌', '└', '╔', '╚', '├', '╠', '|', '*', '+']);
const BOX_RIGHT_CHARS = new Set(['│', '║', '┐', '┘', '╗', '╝', '┤', '╣', '|', '*', '+']);
const BOX_RIGHT_FOR_LEFT = new Map([
  ['│', '│'],
  ['║', '║'],
  ['|', '|'],
  ['┌', '┐'],
  ['└', '┘'],
  ['╔', '╗'],
  ['╚', '╝'],
  ['├', '┤'],
  ['╠', '╣'],
  ['*', '*'],
  ['+', '+'],
]);

const toChars = (value) => Array.from(value || '');

const padOrTrim = (line, columns, padChar = ' ') => {
  const chars = toChars(line);
  if (columns <= 0) return '';
  if (chars.length === columns) return line;
  if (chars.length > columns) return chars.slice(0, columns).join('');
  return chars.join('') + padChar.repeat(columns - chars.length);
};

const normalizeBoxLine = (line, columns) => {
  const chars = toChars(line);
  if (columns <= 0 || chars.length === 0) return padOrTrim(line, columns);
  if (chars.length < 2) return padOrTrim(line, columns);
  const allSame = chars.every((char) => char === chars[0]);
  if (allSame) {
    return padOrTrim(line, columns, chars[0]);
  }
  const first = chars[0];
  const last = chars[chars.length - 1];
  const hasLeft = BOX_LEFT_CHARS.has(first);
  const hasRight = BOX_RIGHT_CHARS.has(last);
  if (!hasLeft && !hasRight) {
    return padOrTrim(line, columns);
  }

  const needsRightBorder = hasLeft && !hasRight;
  const interior = needsRightBorder ? chars.slice(1) : chars.slice(1, -1);
  const interiorChars = toChars(interior.join(''));
  const interiorAllSame = interiorChars.length > 0 && interiorChars.every((char) => char === interiorChars[0]);
  const interiorPadChar = interiorAllSame ? interiorChars[0] : ' ';
  const targetInterior = Math.max(columns - 2, 0);
  let normalizedInterior = interiorChars;
  if (interiorChars.length > targetInterior) {
    normalizedInterior = interiorChars.slice(0, targetInterior);
  } else if (interiorChars.length < targetInterior) {
    normalizedInterior = interiorChars.concat(
      Array(targetInterior - interiorChars.length).fill(interiorPadChar)
    );
  }

  const rightBorder = needsRightBorder ? (BOX_RIGHT_FOR_LEFT.get(first) || '│') : last;
  return [first, ...normalizedInterior, rightBorder].join('');
};

export const normalizeAsciiLines = (lines, columns) => {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => normalizeBoxLine(line ?? '', columns));
};

const hasBoxChars = (line) => {
  const chars = toChars(line);
  return chars.some((char) => BOX_LEFT_CHARS.has(char) || BOX_RIGHT_CHARS.has(char));
};

const shouldNormalizeLine = (line) => {
  const chars = toChars(line);
  if (chars.length === 0) return false;
  const allSame = chars.every((char) => char === chars[0]);
  return allSame || hasBoxChars(line);
};

export const normalizeAsciiText = (text, columns) => {
  const lines = (text || '').split('\n');
  return lines
    .map((line) => (shouldNormalizeLine(line) ? normalizeBoxLine(line, columns) : line))
    .join('\n');
};

export const containsBoxChars = (text) => {
  return (text || '').split('\n').some((line) => hasBoxChars(line));
};

export const stripCodeFences = (text) => {
  if (!text) return text;
  const fenced = text.match(/^\s*```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
  if (fenced && typeof fenced[1] === 'string') {
    return fenced[1];
  }
  return text;
};

export const stripFenceLines = (text) => {
  if (!text) return text;
  return text
    .split('\n')
    .filter((line) => !/^\s*```/.test(line))
    .join('\n');
};

export const prefixLines = (text, prefix) => {
  return (text || '')
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
};

export const formatPlain = (text, { uppercase = false, trailingNewline = true } = {}) => {
  const body = uppercase ? String(text || '').toUpperCase() : String(text || '');
  return `\n${body}${trailingNewline ? '\n' : ''}`;
};

export const formatWithTrailer = (
  text,
  trailer,
  { uppercase = false, trailingNewline = true, gapLines = 1 } = {}
) => {
  const body = uppercase ? String(text || '').toUpperCase() : String(text || '');
  const gap = '\n'.repeat(Math.max(gapLines, 0) + 1);
  return `\n${body}${gap}${trailer}${trailingNewline ? '\n' : ''}`;
};

export const formatBoxed = (
  text,
  { top, bottom, linePrefix = '', beforeLines = [], afterLines = [] }
) => {
  const lines = prefixLines(text, linePrefix);
  const before = beforeLines.length ? `${beforeLines.join('\n')}\n` : '';
  const after = afterLines.length ? `\n${afterLines.join('\n')}` : '';
  return `\n${top}\n${before}${lines}${after}\n${bottom}\n`;
};
