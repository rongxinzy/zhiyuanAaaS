import { Alert } from 'antd';
import { useSyncExternalStore } from 'react';

export const AdminNotificationKind = {
  Success: 'success',
  Error: 'error',
} as const;
export type AdminNotificationKind = (typeof AdminNotificationKind)[keyof typeof AdminNotificationKind];

interface AdminNotification {
  readonly id: number;
  readonly kind: AdminNotificationKind;
  readonly message: string;
}

let nextID = 0;
let current: AdminNotification | null = null;
let timeout: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

export function clearNotification() {
  if (timeout) clearTimeout(timeout);
  timeout = undefined;
  if (current === null) return;
  current = null;
  publish();
}

/** Success auto-dismisses in 3s; errors in 5s. New notify replaces the previous one (no stack). */
export function notify(kind: AdminNotificationKind, message: string, durationMs?: number) {
  if (timeout) clearTimeout(timeout);
  current = { id: ++nextID, kind, message };
  publish();
  const ms = durationMs ?? (kind === AdminNotificationKind.Error ? 5000 : 3000);
  if (ms > 0) {
    timeout = setTimeout(() => {
      current = null;
      publish();
    }, ms);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function snapshot() {
  return current;
}

export function AdminNotificationViewport() {
  const notification = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!notification) return null;
  const success = notification.kind === AdminNotificationKind.Success;
  return (
    <div className="admin-notification" role="status" aria-live="polite">
      <Alert
        showIcon
        type={success ? 'success' : 'error'}
        title={notification.message}
        closable={{ onClose: clearNotification }}
      />
    </div>
  );
}
