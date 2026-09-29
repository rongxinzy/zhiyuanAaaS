import {
  ArrowLeft,
  CircleAlert,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { AdminConsoleClient } from './client.js';
import { translate, type AdminLanguage } from './i18n.js';
import { AdminNotificationKind, notify } from './notifications.js';
import {
  PortalClient,
  chatUIBaseURL,
  portalChatBaseURL,
  type PortalEmployee,
  type PortalRequest,
} from './portal.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/components/ui/alert-dialog.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/components/ui/dialog.js';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../ui/components/ui/empty.js';
import { Field, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/components/ui/table.js';
import { Tabs, TabsIndicator, TabsList, TabsTrigger } from '../ui/components/ui/tabs.js';

const language: AdminLanguage = 'zh';

const DigitalEmployeesTab = {
  Employees: 'employees',
  Requests: 'requests',
} as const;
type DigitalEmployeesTab = (typeof DigitalEmployeesTab)[keyof typeof DigitalEmployeesTab];

// Mirrors the portal's own apply-time validation (portal/api.go namePattern):
// keep both in step or the server rejects with a 400 the UI could have caught.
const EMPLOYEE_NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

export function DigitalEmployees({
  client,
  portal,
}: {
  readonly client: AdminConsoleClient;
  /** Test seam: injected portal helpers (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
}) {
  const [resolvedPortal] = useState(
    () => portal ?? new PortalClient(() => client.getAccessToken()),
  );
  const [tab, setTab] = useState<DigitalEmployeesTab>(DigitalEmployeesTab.Employees);
  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <div className="flex w-full flex-col gap-5">
        <div>
          <p className="text-xs text-tertiary-foreground">{translate(language, 'workspaceLabel')}</p>
          <h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, 'digitalEmployees')}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{translate(language, 'digitalEmployeesDescription')}</p>
        </div>
        <div className="border-b border-border">
          <Tabs value={tab} onValueChange={(value) => setTab(value as DigitalEmployeesTab)}>
            <TabsList variant="line" className="w-max">
              <TabsTrigger value={DigitalEmployeesTab.Employees} className="px-3">
                {translate(language, 'digitalEmployeesTabEmployees')}
              </TabsTrigger>
              <TabsTrigger value={DigitalEmployeesTab.Requests} className="px-3">
                {translate(language, 'digitalEmployeesTabRequests')}
              </TabsTrigger>
              <TabsIndicator />
            </TabsList>
          </Tabs>
        </div>
        {tab === DigitalEmployeesTab.Employees ? (
          <EmployeePanel portal={resolvedPortal} client={client} />
        ) : (
          <RequestPanel portal={resolvedPortal} />
        )}
      </div>
    </section>
  );
}

function phaseBadgeVariant(phase: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (phase === 'Ready') return 'success';
  if (phase === 'Pending') return 'warning';
  if (phase === 'Error') return 'destructive';
  return 'secondary';
}

function formatTimestamp(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

// The portal authorizes every call (owner or admin); the console renders
// whatever the portal returns, surfacing 403s as inline alerts.
function EmployeePanel({
  portal,
  client,
}: {
  readonly portal: PortalClient;
  readonly client: AdminConsoleClient;
}) {
  const [selected, setSelected] = useState<PortalEmployee | null>(null);

  // Muse/Grok-Bot-style embedded conversation: mint the portal session in
  // the background and open the chat UI in an in-page pane — the console
  // stays the single shell. Falls back to a new tab (portal fragment link)
  // when the background mint fails.

  // Silent handoff: mint the portal session and select the employee in the
  // background (cookies land on the shared host), then open the chat UI in
  // a new tab — no portal entry page flashing in between. Falls back to the
  // fragment-token handoff when the background mint fails.
  // (An embedded in-page pane was tried and rolled back at the user's
  // request; the EmbeddedChat component stays in the file for a retry.)
  const openChat = async (employee: PortalEmployee) => {
    if (await portal.mintChatSession(employee.name)) {
      window.open(`${chatUIBaseURL()}/workspace`, '_blank', 'noopener');
      return;
    }
    const token = await client.getAccessToken();
    if (!token) {
      notify(AdminNotificationKind.Error, translate(language, 'digitalEmployeesChatNoSession'));
      return;
    }
    const href = `${portalChatBaseURL()}/chat?employee=${encodeURIComponent(employee.name)}#token=${encodeURIComponent(token)}`;
    window.open(href, '_blank', 'noopener');
  };

  return selected ? (
    <EmployeeDetail employee={selected} onBack={() => setSelected(null)} />
  ) : (
    <EmployeeList portal={portal} client={client} onSelected={setSelected} onChat={openChat} />
  );
}

// Embedded conversation pane: employee rail on the left, the framed chat UI
// on the right (same host, so the minted portal cookies flow into the
// frame). Switching employees re-mints and reloads the frame.
function EmbeddedChat({
  portal,
  current,
  onCurrentChange,
  onClose,
}: {
  readonly portal: PortalClient;
  readonly current: PortalEmployee;
  readonly onCurrentChange: (employee: PortalEmployee) => void;
  readonly onClose: () => void;
}) {
  const [employees, setEmployees] = useState<readonly PortalEmployee[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  // Measured pane height: the console shell's height chain is content-driven
  // (min-h containers), so a CSS calc guess either overflows small viewports
  // or wastes space on tall ones. Measure the pane's top offset once (and on
  // window resize) and size it to exactly the remaining viewport.
  const [paneHeight, setPaneHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setPaneHeight(Math.max(window.innerHeight - top - 16, 384));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    void portal.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, [portal]);

  const switchTo = async (employee: PortalEmployee) => {
    if (employee.name === current.name) return;
    if (await portal.mintChatSession(employee.name)) {
      onCurrentChange(employee);
      setNonce((value) => value + 1);
    }
  };

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 flex-1 gap-4"
      style={paneHeight !== undefined ? { height: paneHeight } : undefined}
    >
      <div className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
        <div className="px-2 pb-1 pt-1 text-xs text-muted-foreground">
          {translate(language, 'digitalEmployeesList')}
        </div>
        {(employees ?? []).map((employee) => (
          <button
            key={employee.name}
            type="button"
            onClick={() => void switchTo(employee)}
            className={`flex flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
              employee.name === current.name ? 'bg-accent font-medium' : ''
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {employee.displayName || employee.name}
              {employee.channels?.wecom ? (
                <Badge variant="outline">{translate(language, 'wecomBadge')}</Badge>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">{employee.name}</span>
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {current.displayName || current.name}
            <Badge variant={phaseBadgeVariant(current.phase)}>{current.phase || '—'}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setNonce((value) => value + 1)}>
              {translate(language, 'statusRefresh')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(`${chatUIBaseURL()}/workspace`, '_blank', 'noopener')}
            >
              {translate(language, 'chatPaneOpenTab')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              {translate(language, 'chatPaneClose')}
            </Button>
          </div>
        </div>
        <iframe
          key={`${current.name}-${nonce}`}
          src={`${chatUIBaseURL()}/workspace?embed=1`}
          title={current.displayName || current.name}
          className="min-h-0 w-full flex-1 border-0"
        />
      </div>
    </div>
  );
}

function EmployeeList({
  portal,
  client,
  onSelected,
  onChat,
}: {
  readonly portal: PortalClient;
  readonly client: AdminConsoleClient;
  readonly onSelected: (employee: PortalEmployee) => void;
  readonly onChat: (employee: PortalEmployee) => void;
}) {
  const [employees, setEmployees] = useState<readonly PortalEmployee[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setEmployees(await portal.listEmployees());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [portal]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
          {translate(language, 'digitalEmployeesList')}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            {loading ? <Spinner className="size-3.5" /> : <RefreshCw data-icon="inline-start" />}
            {translate(language, 'refresh')}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            {translate(language, 'digitalEmployeesApply')}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <CircleAlert data-icon="inline-start" />
          <AlertDescription>
            {translate(language, 'digitalEmployeesLoadFailed')}：{error}
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !employees ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {translate(language, 'loading')}
        </div>
      ) : employees && employees.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translate(language, 'digitalEmployeesColumnName')}</TableHead>
                <TableHead>{translate(language, 'digitalEmployeesColumnDisplayName')}</TableHead>
                <TableHead>{translate(language, 'digitalEmployeesColumnPhase')}</TableHead>
                <TableHead>{translate(language, 'digitalEmployeesColumnModel')}</TableHead>
                <TableHead>{translate(language, 'digitalEmployeesColumnOwner')}</TableHead>
                <TableHead className="text-right">{translate(language, 'digitalEmployeesColumnActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.name} className="cursor-pointer" onClick={() => onSelected(employee)}>
                  <TableCell className="font-medium">{employee.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {employee.displayName || employee.name}
                      {employee.channels?.wecom ? (
                        <Badge variant="outline">{translate(language, 'wecomBadge')}</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={phaseBadgeVariant(employee.phase)}>{employee.phase || '—'}</Badge>
                  </TableCell>
                  <TableCell>{employee.model}</TableCell>
                  <TableCell>{employee.owner || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void onChat(employee)}
                        title={translate(language, 'digitalEmployeesOpenChat')}
                      >
                        <MessageSquare data-icon="inline-start" />
                        {translate(language, 'digitalEmployeesOpenChat')}
                      </Button>
                      <DeleteEmployeeButton portal={portal} employee={employee} onDeleted={load} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Empty className="border border-dashed border-border rounded-lg">
          <EmptyHeader>
            <EmptyMedia>
              <MessageSquare />
            </EmptyMedia>
            <EmptyTitle>{translate(language, 'digitalEmployeesEmpty')}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <EmptyDescription>{translate(language, 'digitalEmployeesEmptyHint')}</EmptyDescription>
          </EmptyContent>
        </Empty>
      )}

      {creating ? (
        <ApplyDialog
          portal={portal}
          onClose={() => setCreating(false)}
          onApplied={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function DeleteEmployeeButton({
  portal,
  employee,
  onDeleted,
}: {
  readonly portal: PortalClient;
  readonly employee: PortalEmployee;
  readonly onDeleted: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      await portal.deleteEmployee(employee.name);
      notify(AdminNotificationKind.Success, translate(language, 'digitalEmployeesDeleted'));
      setConfirming(false);
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setConfirming(true)}
        title={translate(language, 'digitalEmployeesDelete')}
      >
        <Trash2 data-icon="inline-start" />
        {translate(language, 'digitalEmployeesDelete')}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate(language, 'digitalEmployeesDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate(language, 'digitalEmployeesDeleteConfirm')}「{employee.name}」？
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <Alert variant="destructive">
              <CircleAlert data-icon="inline-start" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{translate(language, 'cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void remove(); }} disabled={pending}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {translate(language, 'digitalEmployeesDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ApplyDialog({
  portal,
  onClose,
  onApplied,
}: {
  readonly portal: PortalClient;
  readonly onClose: () => void;
  readonly onApplied: () => void;
}) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setName('');
    setDisplayName('');
    setError(null);
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!EMPLOYEE_NAME_PATTERN.test(name)) {
      setError(translate(language, 'digitalEmployeesInvalidName'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await portal.apply(name, displayName);
      if (result.kind === 'rejected') {
        setError(result.message);
        return;
      }
      notify(
        AdminNotificationKind.Success,
        result.kind === 'created'
          ? translate(language, 'digitalEmployeesApplyCreated')
          : `${translate(language, 'digitalEmployeesApplyPending')}：${result.message}`,
      );
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(language, 'digitalEmployeesApplyTitle')}</DialogTitle>
          <DialogDescription>{translate(language, 'digitalEmployeesApplyDescription')}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          {error ? (
            <Alert variant="destructive">
              <CircleAlert data-icon="inline-start" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="digital-employee-name">
                {translate(language, 'digitalEmployeesFieldName')}
              </FieldLabel>
              <Input
                id="digital-employee-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={translate(language, 'digitalEmployeesNamePlaceholder')}
                autoComplete="off"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="digital-employee-display-name">
                {translate(language, 'digitalEmployeesFieldDisplayName')}
              </FieldLabel>
              <Input
                id="digital-employee-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={translate(language, 'digitalEmployeesDisplayNamePlaceholder')}
                autoComplete="off"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              {translate(language, 'cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {translate(language, 'digitalEmployeesApplySubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDetail({
  employee,
  onBack,
}: {
  readonly employee: PortalEmployee;
  readonly onBack: () => void;
}) {
  const rows: readonly (readonly [string, string])[] = [
    [translate(language, 'digitalEmployeesColumnName'), employee.name],
    [translate(language, 'digitalEmployeesColumnDisplayName'), employee.displayName || '—'],
    [translate(language, 'digitalEmployeesColumnPhase'), employee.phase || '—'],
    [translate(language, 'digitalEmployeesFieldRuntime'), employee.runtime],
    [translate(language, 'digitalEmployeesColumnModel'), employee.model],
    [translate(language, 'digitalEmployeesColumnOwner'), employee.owner || employee.ownerId],
    [translate(language, 'digitalEmployeesFieldMemoryUser'), employee.memoryUser || '—'],
    [translate(language, 'digitalEmployeesFieldCreatedAt'), formatTimestamp(employee.createdAt)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {translate(language, 'digitalEmployeesBack')}
        </Button>
        <div className="flex items-center gap-2 text-sm font-semibold">
          {employee.displayName || employee.name}
          {employee.channels?.wecom ? (
            <Badge variant="outline">{translate(language, 'wecomBadge')}</Badge>
          ) : null}
        </div>
        <Badge variant={phaseBadgeVariant(employee.phase)}>{employee.phase || '—'}</Badge>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableBody>
            {rows.map(([label, value]) => (
              <TableRow key={label}>
                <TableCell className="w-40 text-muted-foreground">{label}</TableCell>
                <TableCell className="font-medium">{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Everyone sees this tab: the portal returns the caller's own requests and
// admin-only actions fail with a clear 403 (portal admin config is not
// knowable client-side).
function RequestPanel({ portal }: { readonly portal: PortalClient }) {
  const [requests, setRequests] = useState<readonly PortalRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PortalRequest | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await portal.listRequests());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [portal]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{translate(language, 'digitalEmployeesRequestsList')}</div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? <Spinner className="size-3.5" /> : <RefreshCw data-icon="inline-start" />}
          {translate(language, 'refresh')}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <CircleAlert data-icon="inline-start" />
          <AlertDescription>
            {translate(language, 'digitalEmployeesRequestsLoadFailed')}：{error}
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !requests ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {translate(language, 'loading')}
        </div>
      ) : requests && requests.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <RequestTable portal={portal} requests={requests} onChanged={load} onReject={setRejecting} />
        </div>
      ) : (
        <Empty className="border border-dashed border-border rounded-lg">
          <EmptyHeader>
            <EmptyMedia>
              <MessageSquare />
            </EmptyMedia>
            <EmptyTitle>{translate(language, 'digitalEmployeesRequestsEmpty')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {rejecting ? (
        <RejectDialog
          portal={portal}
          request={rejecting}
          onClose={() => setRejecting(null)}
          onDecided={load}
        />
      ) : null}
    </div>
  );
}

function RequestTable({
  portal,
  requests,
  onChanged,
  onReject,
}: {
  readonly portal: PortalClient;
  readonly requests: readonly PortalRequest[];
  readonly onChanged: () => Promise<void>;
  readonly onReject: (request: PortalRequest) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (request: PortalRequest, decision: 'approve' | 'reject', reason?: string) => {
    setPendingId(request.id);
    setError(null);
    try {
      await portal.decideRequest(request.id, decision, reason);
      notify(AdminNotificationKind.Success, translate(language, 'digitalEmployeesRequestDecided'));
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  };
  return (
    <>
      {error ? (
        <div className="p-2">
          <Alert variant="destructive">
            <CircleAlert data-icon="inline-start" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{translate(language, 'digitalEmployeesRequestEmployee')}</TableHead>
            <TableHead>{translate(language, 'digitalEmployeesColumnDisplayName')}</TableHead>
            <TableHead>{translate(language, 'digitalEmployeesRequestOwner')}</TableHead>
            <TableHead>{translate(language, 'digitalEmployeesRequestState')}</TableHead>
            <TableHead>{translate(language, 'digitalEmployeesRequestTime')}</TableHead>
            <TableHead className="text-right">{translate(language, 'digitalEmployeesColumnActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-medium">{request.employeeName}</TableCell>
              <TableCell>{request.displayName || request.employeeName}</TableCell>
              <TableCell>{request.owner}</TableCell>
              <TableCell>
                <Badge variant={request.state === 'pending' ? 'warning' : 'secondary'}>{request.state}</Badge>
              </TableCell>
              <TableCell>{formatTimestamp(request.createdAt)}</TableCell>
              <TableCell className="text-right">
                {request.state === 'pending' ? (
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === request.id}
                      onClick={() => void decide(request, 'approve')}
                    >
                      {pendingId === request.id ? <Spinner className="size-3.5" /> : null}
                      {translate(language, 'digitalEmployeesApprove')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === request.id}
                      onClick={() => onReject(request)}
                    >
                      {translate(language, 'digitalEmployeesReject')}
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted-foreground">{request.reason || '—'}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function RejectDialog({
  portal,
  request,
  onClose,
  onDecided,
}: {
  readonly portal: PortalClient;
  readonly request: PortalRequest;
  readonly onClose: () => void;
  readonly onDecided: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setReason('');
    setError(null);
  }, []);
  const reject = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await portal.decideRequest(request.id, 'reject', reason || undefined);
      notify(AdminNotificationKind.Success, translate(language, 'digitalEmployeesRequestDecided'));
      onClose();
      await onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(language, 'digitalEmployeesRejectTitle')}</DialogTitle>
          <DialogDescription>
            {translate(language, 'digitalEmployeesRejectDescription')}「{request.employeeName}」
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => void reject(event)}>
          {error ? (
            <Alert variant="destructive">
              <CircleAlert data-icon="inline-start" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reject-reason">
                {translate(language, 'digitalEmployeesRejectReason')}
              </FieldLabel>
              <Input
                id="reject-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                autoComplete="off"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              {translate(language, 'cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {translate(language, 'digitalEmployeesReject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
