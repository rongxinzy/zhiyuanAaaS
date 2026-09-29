import { useSyncExternalStore } from "react";

import { Alert } from "antd";

export const AdminNotificationKind = {
  Success: "success",
  Error: "error",
} as const;
export type AdminNotificationKind =
  (typeof AdminNotificationKind)[keyof typeof AdminNotificationKind];

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

export function notify(kind: AdminNotificationKind, message: string) {
  if (timeout) clearTimeout(timeout);
  current = { id: ++nextID, kind, message };
  publish();
  timeout = setTimeout(
    () => {
      current = null;
      publish();
    },
    kind === AdminNotificationKind.Error ? 5000 : 3000,
  );
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
        type={success ? "success" : "error"}
        title={notification.message}
      />
    </div>
  );
}
