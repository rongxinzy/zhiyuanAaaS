import { AlertCircle, Check, FileKey2, KeyRound, Pencil, Plus, RefreshCw, RotateCcw, ShieldAlert, Trash2, Upload, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { CredentialAssignment, CredentialMetadata, License, LicenseImportRequest, PlatformUser, Role, Team } from '@aep/sdk-node';

import { AdminConsoleClient, AdminSubjectType, type AdminCredentials, type AdminUserSession } from './client.js';
import { formatTimestamp } from './format.js';
import { translate, type AdminLanguage, type AdminTranslationKey } from './i18n.js';
import { SubjectMultiPicker } from './Resources.js';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/components/ui/dialog.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/components/ui/empty.js';
import { Field, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Skeleton } from '../ui/components/ui/skeleton.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/components/ui/table.js';
import { Tabs, TabsIndicator, TabsList, TabsTrigger } from '../ui/components/ui/tabs.js';
import { ToggleGroup, ToggleGroupItem } from '../ui/components/ui/toggle-group.js';

const language: AdminLanguage = 'zh';
const OperationsTab = { Licenses: 'licenses', Sessions: 'sessions', Credentials: 'credentials' } as const;
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
              <TabsTrigger value={OperationsTab.Credentials} className="px-3">{translate(language, 'credentials')}</TabsTrigger>
              <TabsIndicator />
            </TabsList>
          </Tabs>
        </div>
        {tab === OperationsTab.Licenses ? <LicensePanel client={client} /> : tab === OperationsTab.Sessions ? <SessionPanel client={client} /> : <CredentialPanel client={client} />}
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

function CredentialPanel({ client }: { readonly client: AdminConsoleClient }) {
  const [state, setState] = useState<AdminCredentials | null>(null);
  const [users, setUsers] = useState<readonly PlatformUser[]>([]);
  const [roles, setRoles] = useState<readonly Role[]>([]);
  const [teams, setTeams] = useState<readonly Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [granting, setGranting] = useState<CredentialMetadata | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [credentials, resources] = await Promise.all([client.credentials(), client.resources()]);
      setState(credentials);
      setUsers(resources.users);
      setRoles(resources.roles);
      setTeams(resources.teams);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  return <div className="flex flex-col gap-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />{translate(language, 'credentials')}</div>
        <p className="mt-1 text-sm text-muted-foreground">{translate(language, 'credentialsDescription')}</p>
      </div>
      <Button variant="ghost" size="icon" aria-label={translate(language, 'refresh')} title={translate(language, 'refresh')} disabled={loading} onClick={() => void load()}>{loading ? <Spinner /> : <RefreshCw />}</Button>
    </div>
    {error ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'credentialsLoadFailed')}</AlertDescription></Alert> : null}
    <CredentialEditorDialog client={client} open={undefined} onOpenChange={() => undefined} onChanged={load} onError={() => setError(true)} />
    {loading && !state ? <CredentialSkeleton /> : state ? <CredentialList credentials={state.credentials} assignments={state.assignments} users={users} roles={roles} teams={teams} client={client} onChanged={load} onError={() => setError(true)} onGrant={setGranting} /> : null}
    {granting ? <CredentialGrantDialog client={client} credential={granting} users={users} roles={roles} teams={teams} open onOpenChange={nextOpen => { if (!nextOpen) setGranting(null); }} onChanged={load} onError={() => setError(true)} /> : null}
  </div>;
}

function CredentialList({ credentials, assignments, users, roles, teams, client, onChanged, onError, onGrant }: {
  readonly credentials: readonly CredentialMetadata[];
  readonly assignments: readonly CredentialAssignment[];
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly client: AdminConsoleClient;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onGrant: (credential: CredentialMetadata) => void;
}) {
  if (credentials.length === 0) return <Empty><EmptyHeader><EmptyMedia><KeyRound aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'noCredentials')}</EmptyTitle><EmptyDescription>{translate(language, 'noCredentialsHint')}</EmptyDescription></EmptyHeader></Empty>;
  return <div className="flex flex-col gap-4"><div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'credential')}</TableHead><TableHead>{translate(language, 'credentialService')}</TableHead><TableHead>{translate(language, 'deliveryMode')}</TableHead><TableHead>{translate(language, 'credentialStatus')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{credentials.map(credential => <CredentialRow key={credential.id} credential={credential} assignments={assignments.filter(item => item.resourceId === credential.id)} users={users} client={client} onChanged={onChanged} onError={onError} onGrant={() => onGrant(credential)} />)}</TableBody></Table></div><div className="flex items-center gap-2 text-xs text-tertiary-foreground"><KeyRound className="size-3.5" aria-hidden="true" />{translate(language, 'credentialSecretHint')}</div></div>;
}

function CredentialRow({ credential, assignments, users, client, onChanged, onError, onGrant }: {
  readonly credential: CredentialMetadata;
  readonly assignments: readonly CredentialAssignment[];
  readonly users: readonly PlatformUser[];
  readonly client: AdminConsoleClient;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onGrant: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const run = async (operation: () => Promise<void>) => { setPending(true); try { await operation(); await onChanged(); } catch { onError(); } finally { setPending(false); } };
  const userNames = new Map(users.map(user => [user.id, user]));
  return <>
    <TableRow>
      <TableCell><div className="min-w-0"><div className="truncate font-normal">{credential.name}</div><div className="truncate text-xs text-tertiary-foreground">{credential.id} · {credential.maskedValue}</div></div></TableCell>
      <TableCell className="max-w-40 truncate text-xs text-tertiary-foreground">{credential.service}</TableCell>
      <TableCell><Badge variant="info">{translate(language, credential.deliveryMode === 'client' ? 'clientDelivery' : 'serverOnlyDelivery')}</Badge></TableCell>
      <TableCell><Badge variant={credential.enabled ? 'success' : 'outline'}>{translate(language, credential.enabled ? 'enabled' : 'disabled')}</Badge></TableCell>
      <TableCell><div className="flex flex-wrap justify-end gap-1.5"><Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)}><Pencil data-icon="inline-start" />{translate(language, 'edit')}</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => setRotating(true)}><RotateCcw data-icon="inline-start" />{translate(language, 'rotateCredential')}</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async () => { await client.updateCredential(credential.id, { enabled: !credential.enabled }); })}>{translate(language, credential.enabled ? 'disable' : 'enable')}</Button><Button size="sm" onClick={onGrant}><UsersRound data-icon="inline-start" />{translate(language, 'grantCredential')}</Button><AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" disabled={pending} />}><Trash2 data-icon="inline-start" />{translate(language, 'delete')}</AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'deleteCredentialTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'deleteCredentialDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive-hover" disabled={pending} onClick={() => void run(async () => { await client.deleteCredential(credential.id); })}>{translate(language, 'confirmDeleteCredential')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell>
    </TableRow>
    {assignments.length > 0 ? <TableRow><TableCell colSpan={5}><div className="flex flex-wrap gap-2 text-xs text-tertiary-foreground">{assignments.map(assignment => <CredentialAssignmentRow key={assignment.id} assignment={assignment} user={userNames.get(assignment.subject.id)} client={client} onChanged={onChanged} onError={onError} />)}</div></TableCell></TableRow> : null}
    {editing ? <CredentialEditorDialog client={client} credential={credential} open onOpenChange={open => { if (!open) setEditing(false); }} onChanged={onChanged} onError={onError} /> : null}
    {rotating ? <CredentialRotateDialog client={client} credential={credential} open onOpenChange={open => { if (!open) setRotating(false); }} onChanged={onChanged} onError={onError} /> : null}
  </>;
}

function CredentialAssignmentRow({ assignment, user, client, onChanged, onError }: { readonly assignment: CredentialAssignment; readonly user: PlatformUser | undefined; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const [pending, setPending] = useState(false);
  const revoke = async () => { setPending(true); try { await client.deleteCredentialAssignment(assignment.id); await onChanged(); } catch { onError(); } finally { setPending(false); } };
  const label = assignment.subject.type === AdminSubjectType.User && user ? user.displayName : `${assignment.subject.type}: ${assignment.subject.id}`;
  return <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1"><span className="truncate">{label}</span><AlertDialog><AlertDialogTrigger render={<Button size="icon-xs" variant="ghost" aria-label={translate(language, 'revoke')} title={translate(language, 'revoke')} disabled={pending} />}><Trash2 /></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'revokeConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'revokeConfirmDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive-hover" disabled={pending} onClick={() => void revoke()}>{translate(language, 'confirmRevoke')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></span>;
}

function CredentialEditorDialog({ client, credential, open, onOpenChange, onChanged, onError }: { readonly client: AdminConsoleClient; readonly credential?: CredentialMetadata; readonly open: boolean | undefined; readonly onOpenChange: (open: boolean) => void; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const editing = Boolean(credential);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState(credential?.name ?? '');
  const [service, setService] = useState(credential?.service ?? '');
  const [deliveryMode, setDeliveryMode] = useState<'server_only' | 'client'>(credential?.deliveryMode ?? 'server_only');
  const [value, setValue] = useState('');
  const [enabled, setEnabled] = useState(credential?.enabled !== false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const actualOpen = open === undefined ? dialogOpen : open;
  const setOpen = (next: boolean) => { if (!pending) { if (open === undefined) setDialogOpen(next); onOpenChange(next); } };
  useEffect(() => { if (actualOpen) { setName(credential?.name ?? ''); setService(credential?.service ?? ''); setDeliveryMode(credential?.deliveryMode ?? 'server_only'); setValue(''); setEnabled(credential?.enabled !== false); setFailed(false); } }, [actualOpen, credential]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !service.trim() || (!editing && !value)) { setFailed(true); return; }
    setPending(true); setFailed(false);
    try {
      if (credential) await client.updateCredential(credential.id, { name: name.trim(), service: service.trim(), deliveryMode, enabled });
      else await client.createCredential({ name: name.trim(), service: service.trim(), type: 'api_key', deliveryMode, value, enabled: true });
      setOpen(false); await onChanged();
    } catch { setFailed(true); onError(); } finally { setPending(false); }
  };
  return <Dialog open={actualOpen} onOpenChange={setOpen}>{open === undefined ? <DialogTrigger render={<Button variant="outline" size="sm" className="self-start" />}><Plus data-icon="inline-start" />{translate(language, 'addCredential')}</DialogTrigger> : null}<DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{translate(language, editing ? 'editCredential' : 'addCredential')}</DialogTitle><DialogDescription>{translate(language, editing ? 'editCredentialDescription' : 'addCredentialDescription')}</DialogDescription></DialogHeader><form onSubmit={submit} noValidate className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'credentialFormFailed')}</AlertDescription></Alert> : null}<FieldGroup><Field><FieldLabel htmlFor={editing ? 'edit-credential-name' : 'credential-name'}>{translate(language, 'credentialName')}</FieldLabel><Input id={editing ? 'edit-credential-name' : 'credential-name'} value={name} onChange={event => setName(event.target.value)} disabled={pending} /></Field><Field><FieldLabel htmlFor={editing ? 'edit-credential-service' : 'credential-service'}>{translate(language, 'credentialService')}</FieldLabel><Input id={editing ? 'edit-credential-service' : 'credential-service'} value={service} onChange={event => setService(event.target.value)} disabled={pending} /></Field>{!editing ? <Field><FieldLabel htmlFor="credential-value">{translate(language, 'credentialValue')}</FieldLabel><Input id="credential-value" type="password" value={value} onChange={event => setValue(event.target.value)} autoComplete="new-password" disabled={pending} /></Field> : null}<Field><FieldLabel>{translate(language, 'deliveryMode')}</FieldLabel><ToggleGroup value={[deliveryMode]} onValueChange={next => { if (next[0]) setDeliveryMode(next[0] as 'server_only' | 'client'); }} variant="outline" aria-label={translate(language, 'deliveryMode')}><ToggleGroupItem value="server_only">{translate(language, 'serverOnlyDelivery')}</ToggleGroupItem><ToggleGroupItem value="client">{translate(language, 'clientDelivery')}</ToggleGroupItem></ToggleGroup></Field>{editing ? <Button type="button" variant="outline" role="checkbox" aria-checked={enabled} disabled={pending} onClick={() => setEnabled(current => !current)}>{translate(language, 'credentialEnabled')}: {translate(language, enabled ? 'enabled' : 'disabled')}</Button> : null}</FieldGroup><DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>{translate(language, 'cancel')}</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}{translate(language, pending ? 'saving' : 'save')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function CredentialRotateDialog({ client, credential, open, onOpenChange, onChanged, onError }: { readonly client: AdminConsoleClient; readonly credential: CredentialMetadata; readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!value) { setFailed(true); return; } setPending(true); setFailed(false); try { await client.rotateCredential(credential.id, { value }); setValue(''); onOpenChange(false); await onChanged(); } catch { setFailed(true); onError(); } finally { setPending(false); } };
  return <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{translate(language, 'rotateCredential')}</DialogTitle><DialogDescription>{translate(language, 'rotateCredentialDescription')}</DialogDescription></DialogHeader><form onSubmit={submit} noValidate className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'credentialRotateFailed')}</AlertDescription></Alert> : null}<FieldGroup><Field><FieldLabel htmlFor="rotate-credential-value">{translate(language, 'credentialValue')}</FieldLabel><Input id="rotate-credential-value" type="password" value={value} onChange={event => setValue(event.target.value)} autoComplete="new-password" disabled={pending} /></Field></FieldGroup><DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}{translate(language, pending ? 'saving' : 'rotateCredential')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function CredentialGrantDialog({ client, credential, users, roles, teams, open, onOpenChange, onChanged, onError }: { readonly client: AdminConsoleClient; readonly credential: CredentialMetadata; readonly users: readonly PlatformUser[]; readonly roles: readonly Role[]; readonly teams: readonly Team[]; readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (open) { setSelected(new Set()); setFailed(false); } }, [open, credential.id]);
  const toggle = useCallback((key: string) => setSelected(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }), []);
  const submit = async () => { if (selected.size === 0) return; setPending(true); setFailed(false); try { await Promise.all([...selected].map(key => { const separator = key.indexOf(':'); const type = key.slice(0, separator) as 'user' | 'role' | 'team'; const id = key.slice(separator + 1); return client.createCredentialAssignment({ credentialId: credential.id, subject: { type, id } }); })); onOpenChange(false); await onChanged(); } catch { setFailed(true); onError(); } finally { setPending(false); } };
  return <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{translate(language, 'grantCredential')}</DialogTitle><DialogDescription>{translate(language, 'grantCredentialDescription')}</DialogDescription></DialogHeader><div className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'credentialAssignmentFailed')}</AlertDescription></Alert> : null}<FieldGroup><Field><SubjectMultiPicker users={users} roles={roles} teams={teams} selected={selected} onToggle={toggle} disabled={pending} /></Field></FieldGroup></div><DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button><Button type="button" disabled={pending || selected.size === 0} onClick={() => void submit()}>{pending ? <Spinner data-icon="inline-start" /> : <UsersRound data-icon="inline-start" />}{translate(language, pending ? 'granting' : 'grant')}</Button></DialogFooter></DialogContent></Dialog>;
}

function CredentialSkeleton() { return <div className="overflow-hidden rounded-lg border border-border bg-card">{Array.from({ length: 3 }, (_, index) => <div className="flex items-center gap-3 border-b p-4 last:border-b-0" key={index}><Skeleton className="size-8 shrink-0 rounded-lg" /><div className="min-w-0 flex-1 flex flex-col gap-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-7 w-24" /></div>)}</div>; }

function SessionTable({ sessions }: { readonly sessions: readonly AdminUserSession[] }) {
  if (sessions.length === 0) return <Empty><EmptyHeader><EmptyMedia><UsersRound aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'noSessions')}</EmptyTitle><EmptyDescription>{translate(language, 'noSessionsHint')}</EmptyDescription></EmptyHeader></Empty>;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'sessionId')}</TableHead><TableHead>{translate(language, 'user')}</TableHead><TableHead>{translate(language, 'topic')}</TableHead><TableHead>{translate(language, 'lastSeenAt')}</TableHead><TableHead>{translate(language, 'status')}</TableHead></TableRow></TableHeader><TableBody>{sessions.map(session => <TableRow key={session.sessionId}><TableCell className="max-w-48 truncate text-xs text-tertiary-foreground">{session.sessionId}</TableCell><TableCell className="max-w-48 truncate text-xs">{session.userId}</TableCell><TableCell className="max-w-56 truncate text-xs text-tertiary-foreground">{session.topic}</TableCell><TableCell className="text-xs text-tertiary-foreground">{formatTimestamp(session.lastSeenAt)}</TableCell><TableCell><Badge variant={session.revokedAt ? 'outline' : 'success'}>{translate(language, session.revokedAt ? 'revoked' : 'enabled')}</Badge></TableCell></TableRow>)}</TableBody></Table></div>;
}

function LicenseSkeleton() { return <div className="overflow-hidden rounded-lg border border-border bg-card">{Array.from({ length: 3 }, (_, index) => <div className="flex items-center gap-3 border-b p-4 last:border-b-0" key={index}><Skeleton className="size-8 shrink-0 rounded-lg" /><div className="min-w-0 flex-1 flex flex-col gap-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-7 w-16" /></div>)}</div>; }
function SessionSkeleton() { return <div className="overflow-hidden rounded-lg border border-border bg-card">{Array.from({ length: 4 }, (_, index) => <div className="flex items-center gap-3 border-b p-4 last:border-b-0" key={index}><Skeleton className="h-3.5 w-1/4" /><Skeleton className="h-3.5 w-1/4" /><Skeleton className="h-3.5 w-1/4" /><Skeleton className="h-7 w-16" /></div>)}</div>; }
