// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useDebouncedDocumentKeyword } from './use-debounced-document-keyword.js';

describe('useDebouncedDocumentKeyword', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('commits trimmed keyword after the debounce window', () => {
    const { result } = renderHook(() => useDebouncedDocumentKeyword(300));
    act(() => {
      result.current.setKeyword('  README  ');
    });
    expect(result.current.search).toBe('');
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.search).toBe('');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.search).toBe('README');
  });

  test('applySearch flushes immediately without waiting', () => {
    const { result } = renderHook(() => useDebouncedDocumentKeyword(300));
    act(() => {
      result.current.setKeyword('spec');
    });
    act(() => {
      result.current.applySearch();
    });
    expect(result.current.search).toBe('spec');
  });

  test('clearSearch resets both fields', () => {
    const { result } = renderHook(() => useDebouncedDocumentKeyword(300));
    act(() => {
      result.current.applySearch('x');
    });
    act(() => {
      result.current.clearSearch();
    });
    expect(result.current.keyword).toBe('');
    expect(result.current.search).toBe('');
  });
});
