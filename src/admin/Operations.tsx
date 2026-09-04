import { AlertCircle, FileKey2, RefreshCw, ShieldAlert, Upload, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { License, LicenseImportRequest } from '@aep/sdk-node';

import { AdminConsoleClient, type AdminUserSession } from './client.js';
import { formatTimestamp } from './format.js';
import { translate, type AdminLanguage, type AdminTranslationKey } from './i18n.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/components/ui/alert-dialog.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/components/ui/card.js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/components/ui/dialog.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/components/ui/empty.js';
import { Field, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Skeleton } from '../ui/components/ui/skeleton.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/components/ui/table.js';
import { Tabs, TabsIndicator, TabsList, TabsTrigger } from '../ui/components/ui/tabs.js';

const language: AdminLanguage = 'zh';
const OperationsTab = { Licenses: 'licenses', Sessions: 'sessions' } as const;
type OperationsTab = (typeof OperationsTab)[keyof typeof OperationsTab];

export function Operations({ client }: { readonly client: AdminConsoleClient }) {
  const [tab, setTab] = useState<OperationsTab>(OperationsTab.Licenses);
  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div>
          <p className="text-xs text-tertiary-foreground">{translate(language, 'workspaceLabel')}</p>
          <h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, 'operations')}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{translate(language, 'operationsDescription')}</p>
        </div>
        <div className="border-b border-border">
          <Tabs value={tab} onValueChange={value => setTab(value as OperationsTab)}>
            <TabsList variant="line" className="w-max">
              <TabsTrigger value={OperationsTab.Licenses} className="px-3">{translate(language, 'licenses')}</TabsTrigger>
              <TabsTrigger value={OperationsTab.Sessions} className="px-3">{translate(language, 'sessions')}</TabsTrigger>
              <TabsIndicator />
            </TabsList>
          </Tabs>
        </div>
        {tab === OperationsTab.Licenses ? <LicensePanel client={client} /> : <SessionPanel client={client} />}
      </div>
    </section>
  );
}

function LicensePanel({ client }: { readonly client: AdminConsoleClient }) {
  const [licenses, setLicenses] = useState<readonly License[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminTranslationKey | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLicenses(await client.licenses());
    } catch {
      setError('licensesLoadFailed');
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><FileKey2 className="size-4 text-muted-foreground" aria-hidden="true" />{translate(language, 'licenses')}</div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => setImportOpen(true)}><Upload data-icon="inline-start" />{translate(language, 'importLicense')}</Button>
          <Button variant="ghost" size="icon" aria-label={translate(language, 'refresh')} title={translate(language, 'refresh')} disabled={loading} onClick={() => void load()}>{loading ? <Spinner /> : <RefreshCw />}</Button>
        </div>
      </div>
      {error ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, error)}</AlertDescription></Alert> : null}
      {loading && !licenses ? <LicenseSkeleton /> : licenses ? <LicenseTable licenses={licenses} client={client} onChanged={load} onError={() => setError('licensesLoadFailed')} /> : null}
      <LicenseImportDialog client={client} open={importOpen} onOpenChange={setImportOpen} onChanged={load} onError={() => setError('licensesLoadFailed')} />
    </div>
  );
}

function LicenseTable({ licenses, client, onChanged, onError }: { readonly licenses: readonly License[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (licenses.length === 0) return <Empty><EmptyHeader><EmptyMedia><FileKey2 aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'noLicenses')}</EmptyTitle><EmptyDescription>{translate(language, 'noLicensesHint')}</EmptyDescription></EmptyHeader></Empty>;
  const revoke = async (licenseId: string) => {
    setPendingId(licenseId);
    try { await client.revokeLicense(licenseId); await onChanged(); } catch { onError(); } finally { setPendingId(null); }
  };
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'license')}</TableHead><TableHead>{translate(language, 'licenseStatus')}</TableHead><TableHead>{translate(language, 'expiresAt')}</TableHead><TableHead>{translate(language, 'activeUsers')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{licenses.map(license => <TableRow key={license.licenseId}><TableCell><div className="min-w-0"><div className="truncate font-normal">{license.licenseId}</div><div className="truncate text-xs text-tertiary-foreground">{license.customerId} · {license.keyId}</div></div></TableCell><TableCell><Badge variant={license.status === 'active' ? 'success' : 'outline'}>{translate(language, license.status === 'active' ? 'enabled' : 'revoked')}</Badge></TableCell><TableCell className="text-xs text-tertiary-foreground">{formatTimestamp(license.expiresAt)}</TableCell><TableCell className="text-xs text-tertiary-foreground">{license.activeUsers} / {license.limits.users}</TableCell><TableCell className="text-right">{license.status === 'active' ? <AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" disabled={pendingId !== null} />}><ShieldAlert data-icon="inline-start" />{translate(language, 'revokeLicense')}</AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'revokeLicenseTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'revokeLicenseDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pendingId !== null}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive-hover" disabled={pendingId !== null} onClick={() => void revoke(license.licenseId)}>{translate(language, 'confirmRevokeLicense')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : <span className="text-xs text-tertiary-foreground">{translate(language, 'revoked')}</span>}</TableCell></TableRow>)}</TableBody></Table></div>;
}

function LicenseImportDialog({ client, open, onOpenChange, onChanged, onError }: { readonly client: AdminConsoleClient; readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { setFailed(true); return; }
    setPending(true); setFailed(false);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const envelope = extractLicenseEnvelope(parsed);
      if (!envelope) throw new Error('Invalid license envelope');
      await client.importLicense({ license: envelope });
      setFile(null); onOpenChange(false); await onChanged();
    } catch { setFailed(true); onError(); } finally { setPending(false); }
  };
  return <Dialog open={open} onOpenChange={nextOpen => { if (!pending) { onOpenChange(nextOpen); if (!nextOpen) { setFile(null); setFailed(false); } } }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{translate(language, 'importLicense')}</DialogTitle><DialogDescription>{translate(language, 'licenseImportDescription')}</DialogDescription></DialogHeader><form onSubmit={submit} noValidate className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'licenseImportFailed')}</AlertDescription></Alert> : null}<FieldGroup><Field><FieldLabel htmlFor="license-file">{translate(language, 'licenseFile')}</FieldLabel><Input id="license-file" type="file" accept=".json,application/json" disabled={pending} onChange={event => setFile(event.target.files?.[0] ?? null)} /></Field></FieldGroup><DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}{translate(language, pending ? 'saving' : 'importLicense')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function extractLicenseEnvelope(value: unknown): LicenseImportRequest['license'] | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = 'license' in value && value.license && typeof value.license === 'object' ? value.license : value;
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  if (record.format !== 'zhiyuan-license-v1' || typeof record.keyId !== 'string' || typeof record.signature !== 'string' || !record.payload || typeof record.payload !== 'object') return null;
  return candidate as LicenseImportRequest['license'];
}

function SessionPanel({ client }: { readonly client: AdminConsoleClient }) {
  const [sessions, setSessions] = useState<readonly AdminUserSession[] | null>(null);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async (filter?: string) => {
    setLoading(true); setError(false);
    try { setSessions(await client.sessions(filter || undefined)); } catch { setError(true); } finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void load(''); }, [load]);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void load(userId.trim()); };
  return <div className="flex flex-col gap-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />{translate(language, 'sessions')}</div><p className="mt-1 text-sm text-muted-foreground">{translate(language, 'sessionsDescription')}</p></div><Button variant="ghost" size="icon" aria-label={translate(language, 'refresh')} title={translate(language, 'refresh')} disabled={loading} onClick={() => void load()}>{loading ? <Spinner /> : <RefreshCw />}</Button></div><form className="flex items-end gap-2" onSubmit={submit}><Field className="min-w-0 flex-1"><FieldLabel htmlFor="session-user-id">{translate(language, 'filterUserId')}</FieldLabel><Input id="session-user-id" value={userId} onChange={event => setUserId(event.target.value)} placeholder="user-id" disabled={loading} /></Field><Button type="submit" variant="outline" disabled={loading}>{translate(language, 'search')}</Button></form>{error ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'sessionsLoadFailed')}</AlertDescription></Alert> : null}{loading && !sessions ? <SessionSkeleton /> : sessions ? <SessionTable sessions={sessions} /> : null}</div>;
}

function SessionTable({ sessions }: { readonly sessions: readonly AdminUserSession[] }) {
  if (sessions.length === 0) return <Empty><EmptyHeader><EmptyMedia><UsersRound aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'noSessions')}</EmptyTitle><EmptyDescription>{translate(language, 'noSessionsHint')}</EmptyDescription></EmptyHeader></Empty>;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'sessionId')}</TableHead><TableHead>{translate(language, 'user')}</TableHead><TableHead>{translate(language, 'topic')}</TableHead><TableHead>{translate(language, 'lastSeenAt')}</TableHead><TableHead>{translate(language, 'status')}</TableHead></TableRow></TableHeader><TableBody>{sessions.map(session => <TableRow key={session.sessionId}><TableCell className="max-w-48 truncate text-xs text-tertiary-foreground">{session.sessionId}</TableCell><TableCell className="max-w-48 truncate text-xs">{session.userId}</TableCell><TableCell className="max-w-56 truncate text-xs text-tertiary-foreground">{session.topic}</TableCell><TableCell className="text-xs text-tertiary-foreground">{formatTimestamp(session.lastSeenAt)}</TableCell><TableCell><Badge variant={session.revokedAt ? 'outline' : 'success'}>{translate(language, session.revokedAt ? 'revoked' : 'enabled')}</Badge></TableCell></TableRow>)}</TableBody></Table></div>;
}

function LicenseSkeleton() { return <div className="overflow-hidden rounded-lg border border-border bg-card">{Array.from({ length: 3 }, (_, index) => <div className="flex items-center gap-3 border-b p-4 last:border-b-0" key={index}><Skeleton className="size-8 shrink-0 rounded-lg" /><div className="min-w-0 flex-1 flex flex-col gap-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-7 w-16" /></div>)}</div>; }
function SessionSkeleton() { return <div className="overflow-hidden rounded-lg border border-border bg-card">{Array.from({ length: 4 }, (_, index) => <div className="flex items-center gap-3 border-b p-4 last:border-b-0" key={index}><Skeleton className="h-3.5 w-1/4" /><Skeleton className="h-3.5 w-1/4" /><Skeleton className="h-3.5 w-1/4" /><Skeleton className="h-7 w-16" /></div>)}</div>; }
