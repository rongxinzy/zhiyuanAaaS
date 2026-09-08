import { CheckCircle2, CircleAlert } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "../ui/components/ui/alert.js";

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
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-4 motion-safe:animate-in motion-safe:slide-in-from-top-3 motion-safe:fade-in duration-200"
      role="status"
      aria-live="polite"
    >
      <Alert
        variant="default"
        className="w-auto min-w-52 max-w-md rounded-2xl border-0 bg-foreground px-4 py-3 text-background shadow-lg"
      >
        <>
          {success ? (
            <CheckCircle2 className="text-success" aria-hidden="true" />
          ) : (
            <CircleAlert className="text-destructive" aria-hidden="true" />
          )}
        </>
        <AlertDescription className="font-semibold text-background">
          {notification.message}
        </AlertDescription>
      </Alert>
    </div>
  );
}
