import { useCallback, useEffect, useRef, useState } from 'react';

export const DELETE_POLL_INTERVAL = 1000;
export const DELETE_POLL_LIMIT = 30;

type Deletion = {
  readonly baseId: string;
  readonly context: string;
  readonly id: string;
  readonly operationId: string;
  readonly acceptedAt: number;
  readonly stalled: boolean;
  readonly uncertain?: boolean;
};

/** A successful DELETE acknowledges an asynchronous job, not a removed row. */
export function useKnowledgeDeletionSync(
  baseId: string | null,
  context: string,
  read: (signal: AbortSignal) => Promise<void>,
  onRemoved: (operationIds: readonly string[]) => void,
) {
  const [entries, setEntries] = useState<readonly Deletion[]>([]);
  const entriesRef = useRef(entries);
  // Keep the ledger synchronous: an accepted write and a completed list read
  // can settle in the same React batch without dropping either operation.
  const updateEntries = useCallback((update: (current: readonly Deletion[]) => readonly Deletion[]) => {
    entriesRef.current = update(entriesRef.current);
    setEntries(entriesRef.current);
  }, []);
  const onRemovedRef = useRef(onRemoved);
  onRemovedRef.current = onRemoved;

  const accept = useCallback(
    (entry: Omit<Deletion, 'acceptedAt' | 'stalled'>) => {
      updateEntries((current) => [
        ...current.filter((item) => item.baseId !== entry.baseId || item.id !== entry.id),
        { ...entry, acceptedAt: Date.now(), stalled: false },
      ]);
    },
    [updateEntries],
  );
  const acceptUncertain = useCallback(
    (entry: Omit<Deletion, 'acceptedAt' | 'stalled'>) => accept({ ...entry, uncertain: true }),
    [accept],
  );

  const observe = useCallback(
    (readContext: string, ids: readonly string[]) => {
      // Absence only counts in the exact list where deletion was submitted. A
      // different page/search/folder must never be mistaken for a completed job.
      const removed = entriesRef.current.filter((item) => item.context === readContext && !ids.includes(item.id));
      if (removed.length === 0) return;
      updateEntries((current) => current.filter((item) => !removed.includes(item)));
      onRemovedRef.current(removed.map((item) => item.operationId));
    },
    [updateEntries],
  );

  const active = entries.filter((item) => item.context === context && !item.stalled);
  const activeKey = active.map((item) => `${item.id}:${item.acceptedAt}`).join(',');
  useEffect(() => {
    if (!activeKey) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const expiresAt = Math.min(
      ...entriesRef.current
        .filter((item) => item.context === context && !item.stalled)
        .map((item) => item.acceptedAt + DELETE_POLL_INTERVAL * DELETE_POLL_LIMIT),
    );
    // Bound even a read that never finishes; aborting must not depend on the
    // upstream returning a response.
    const deadline = setTimeout(
      () => {
        controller.abort();
        clearTimeout(timer);
        updateEntries((current) =>
          current.map((item) =>
            item.context === context && Date.now() >= item.acceptedAt + DELETE_POLL_INTERVAL * DELETE_POLL_LIMIT
              ? { ...item, stalled: true }
              : item,
          ),
        );
      },
      Math.max(0, expiresAt - Date.now()),
    );
    const poll = async () => {
      const pending = entriesRef.current.filter((item) => item.context === context && !item.stalled);
      if (controller.signal.aborted || pending.length === 0) return;
      const expired = pending.filter(
        (item) => Date.now() - item.acceptedAt >= DELETE_POLL_INTERVAL * DELETE_POLL_LIMIT,
      );
      if (expired.length > 0) {
        updateEntries((current) => current.map((item) => (expired.includes(item) ? { ...item, stalled: true } : item)));
        return;
      }
      await read(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), DELETE_POLL_INTERVAL);
    };
    timer = setTimeout(() => void poll(), DELETE_POLL_INTERVAL);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(deadline);
    };
  }, [activeKey, context, read, updateEntries]);

  return { entries: entries.filter((item) => item.baseId === baseId), accept, acceptUncertain, observe };
}
