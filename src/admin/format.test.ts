import { describe, expect, test } from 'vitest';

import { formatTimestamp, formatTimestampSeconds } from './format.js';

describe('admin timestamp formatting', () => {
  test('keeps an unparseable timestamp verbatim instead of inventing a date', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });

  test('renders nothing for a missing audit timestamp and keeps garbage verbatim', () => {
    expect(formatTimestampSeconds('')).toBe('');
    expect(formatTimestampSeconds('not-a-date')).toBe('not-a-date');
  });
});

test('does not append a timezone abbreviation on audit timestamps', () => {
  const rendered = formatTimestampSeconds('2026-10-20T06:13:04.370031Z');
  expect(rendered).toMatch(/2026/);
  expect(rendered).not.toMatch(/GMT/i);
  expect(rendered).not.toMatch(/UTC/i);
});
