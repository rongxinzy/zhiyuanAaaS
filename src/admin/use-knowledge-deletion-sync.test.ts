// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DELETE_POLL_INTERVAL, DELETE_POLL_LIMIT, useKnowledgeDeletionSync } from './use-knowledge-deletion-sync.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('preserves a newly accepted deletion when an older result is observed in the same React batch', () => {
  const read = vi.fn().mockResolvedValue(undefined);
  const removed = vi.fn();
  const { result } = renderHook(() => useKnowledgeDeletionSync('base', 'list', read, removed));
  act(() => result.current.accept({ baseId: 'base', context: 'list', id: 'old', operationId: 'old-operation' }));
  act(() => {
    result.current.accept({ baseId: 'base', context: 'list', id: 'new', operationId: 'new-operation' });
    result.current.observe('list', ['new']);
  });
  expect(result.current.entries).toEqual([expect.objectContaining({ id: 'new', operationId: 'new-operation' })]);
  expect(removed).toHaveBeenCalledWith(['old-operation']);
});

test('bounds a hanging read and keeps the operation until a manual matching observation', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  let signal: AbortSignal | undefined;
  const read = vi.fn().mockImplementation((value: AbortSignal) => {
    signal = value;
    return new Promise<void>(() => {});
  });
  const removed = vi.fn();
  const { result } = renderHook(() => useKnowledgeDeletionSync('base', 'first-page', read, removed));
  act(() => result.current.accept({ baseId: 'base', context: 'first-page', id: 'doc', operationId: 'operation' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DELETE_POLL_INTERVAL);
  });
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DELETE_POLL_INTERVAL * DELETE_POLL_LIMIT);
  });
  expect(signal?.aborted).toBe(true);
  expect(result.current.entries[0]).toMatchObject({ id: 'doc', operationId: 'operation', stalled: true });
  act(() => result.current.observe('other-page', []));
  expect(removed).not.toHaveBeenCalled();
  act(() => result.current.observe('first-page', []));
  expect(result.current.entries).toEqual([]);
  expect(removed).toHaveBeenCalledWith(['operation']);
});

test('cancels old query timers and in-flight reads without treating another page as deletion confirmation', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  let signal: AbortSignal | undefined;
  const read = vi.fn().mockImplementation((value: AbortSignal) => {
    signal = value;
    return new Promise<void>(() => {});
  });
  const removed = vi.fn();
  const hook = renderHook(({ context }) => useKnowledgeDeletionSync('base', context, read, removed), {
    initialProps: { context: 'first-page' },
  });
  act(() => hook.result.current.accept({ baseId: 'base', context: 'first-page', id: 'doc', operationId: 'operation' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DELETE_POLL_INTERVAL);
  });
  hook.rerender({ context: 'second-page' });
  expect(signal?.aborted).toBe(true);
  act(() => hook.result.current.observe('second-page', []));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DELETE_POLL_INTERVAL * DELETE_POLL_LIMIT);
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(removed).not.toHaveBeenCalled();
  expect(hook.result.current.entries).toHaveLength(1);
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
