import { Check, CircleAlert, Cpu, Plus, RefreshCw, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { AdminModel, ModelAssignment, PlatformUser } from '@aep/sdk-node';

import { AdminConsoleClient, AdminModelSubjectType, type AdminModels } from './client.js';
import { translate, type AdminLanguage, type AdminTranslationKey } from './i18n.js';
import { SubjectCell } from './Resources.js';
import { UserMultiPicker } from './UserMultiPicker.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
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
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/components/ui/card.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/components/ui/dialog.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/components/ui/empty.js';
import { Field, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Skeleton } from '../ui/components/ui/skeleton.js';
import { Spinner } from '../ui/components/ui/spinner.js';

const ModelSourceType = { Gateway: 'gateway' } as const;
const ModelProtocol = { OpenAiCompatible: 'openai-compatible' } as const;
const language: AdminLanguage = 'zh';

export function Models({ client }: { readonly client: AdminConsoleClient }) {
  const [state, setState] = useState<AdminModels | null>(null);
  const [users, setUsers] = useState<readonly PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminTranslationKey | null>(null);
  const [granting, setGranting] = useState<AdminModel | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [models, members] = await Promise.all([client.models(), client.users()]);
      setState(models);
      setUsers(members);
    } catch { setError('modelsLoadFailed'); } finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  return <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6"><div className="mx-auto flex w-full max-w-4xl flex-col gap-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-muted-foreground">{translate(language, 'workspaceLabel')}</p><h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, 'models')}</h2><p className="mt-1.5 text-sm text-muted-foreground">{translate(language, 'modelsDescription')}</p></div><Button variant="ghost" size="icon" aria-label={translate(language, 'refresh')} title={translate(language, 'refresh')} disabled={loading} onClick={() => void load()}>{loading ? <Spinner /> : <RefreshCw />}</Button></div>{error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, error)}</AlertDescription></Alert> : null}<ModelCreateForm client={client} onCreated={load} />{loading && !state ? <ModelCatalogSkeleton /> : null}{state ? <ModelList models={state.models} assignments={state.assignments} users={users} client={client} onChanged={load} onError={() => setError('modelsLoadFailed')} onGrant={setGranting} /> : null}{granting ? <ModelGrantDialog client={client} model={granting} users={users} onOpenChange={setGranting} onChanged={load} onError={() => setError('modelsLoadFailed')} /> : null}</div></section>;
}

function ModelCreateForm({ client, onCreated }: { readonly client: AdminConsoleClient; readonly onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [upstreamModel, setUpstreamModel] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id.trim() || !displayName.trim() || !endpoint.trim() || !upstreamModel.trim()) { setError(true); return; }
    setPending(true); setError(false);
    try {
      await client.createModel({ id: id.trim(), displayName: displayName.trim(), sourceType: ModelSourceType.Gateway, protocol: ModelProtocol.OpenAiCompatible, endpoint: endpoint.trim(), upstreamModel: upstreamModel.trim(), capabilities: [], isDefault: false, enabled: true });
      setId(''); setDisplayName(''); setEndpoint(''); setUpstreamModel(''); setOpen(false); await onCreated();
    } catch { setError(true); } finally { setPending(false); }
  };
  return (
    <Dialog open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (!nextOpen) setError(false); }}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="self-start" />}>
        <Plus data-icon="inline-start" />{translate(language, 'addModel')}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(language, 'addModel')}</DialogTitle>
          <DialogDescription>{translate(language, 'addModelDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, 'modelFormFailed')}</AlertDescription></Alert> : null}
          <FieldGroup>
            <Field><FieldLabel htmlFor="model-id">{translate(language, 'modelId')}</FieldLabel><Input id="model-id" value={id} onChange={event => setId(event.target.value)} disabled={pending} /></Field>
            <Field><FieldLabel htmlFor="model-name">{translate(language, 'modelName')}</FieldLabel><Input id="model-name" value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={pending} /></Field>
            <Field><FieldLabel htmlFor="model-endpoint">{translate(language, 'modelEndpoint')}</FieldLabel><Input id="model-endpoint" type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder={translate(language, 'modelEndpointPlaceholder')} disabled={pending} /></Field>
            <Field><FieldLabel htmlFor="model-upstream">{translate(language, 'upstreamModel')}</FieldLabel><Input id="model-upstream" value={upstreamModel} onChange={event => setUpstreamModel(event.target.value)} disabled={pending} /></Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" disabled={pending} />}>{translate(language, 'cancel')}</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}{translate(language, pending ? 'saving' : 'save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModelList({ models, assignments, users, client, onChanged, onError, onGrant }: {
  readonly models: readonly AdminModel[];
  readonly assignments: readonly ModelAssignment[];
  readonly users: readonly PlatformUser[];
  readonly client: AdminConsoleClient;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onGrant: (model: AdminModel) => void;
}) {
  if (models.length === 0) return <Empty><EmptyHeader><EmptyMedia><ShieldCheck aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'modelsEmpty')}</EmptyTitle><EmptyDescription>{translate(language, 'modelsEmptyHint')}</EmptyDescription></EmptyHeader></Empty>;
  return <div className="flex flex-col gap-4">{models.map(model => <ModelRow key={model.id} model={model} assignments={assignments.filter(item => item.resourceId === model.id)} users={users} client={client} onChanged={onChanged} onError={onError} onGrant={() => onGrant(model)} />)}</div>;
}

function ModelRow({ model, assignments, users, client, onChanged, onError, onGrant }: {
  readonly model: AdminModel;
  readonly assignments: readonly ModelAssignment[];
  readonly users: readonly PlatformUser[];
  readonly client: AdminConsoleClient;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onGrant: () => void;
}) {
  const [pending, setPending] = useState(false);
  const run = async (operation: () => Promise<void>) => { setPending(true); try { await operation(); await onChanged(); } catch { onError(); } finally { setPending(false); } };
  const userNames = new Map(users.map(user => [user.id, user]));
  return <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Cpu className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><CardTitle className="truncate">{model.displayName}</CardTitle><p className="break-all text-xs text-muted-foreground">{model.id} / {model.upstreamModel || model.localModelRef || translate(language, 'notProvided')}</p></div></div><div className="flex items-center gap-2"><Badge variant={model.enabled ? 'secondary' : 'outline'}>{translate(language, model.enabled ? 'enabled' : 'disabled')}</Badge>{model.isDefault ? <Badge variant="outline">{translate(language, 'defaultModel')}</Badge> : null}</div></div></CardHeader><CardContent className="flex flex-col gap-4"><dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">{translate(language, 'modelEndpoint')}</dt><dd className="break-all font-medium">{model.endpoint || translate(language, 'notProvided')}</dd></div><div><dt className="text-xs text-muted-foreground">{translate(language, 'assignments')}</dt><dd className="font-medium">{assignments.length}</dd></div></dl><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async () => { await client.updateModel(model.id, { enabled: !model.enabled }); })}>{translate(language, model.enabled ? 'disable' : 'enable')}</Button>{!model.isDefault ? <Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async () => { await client.updateModel(model.id, { isDefault: true }); })}>{translate(language, 'makeDefault')}</Button> : null}<Button size="sm" onClick={onGrant}><UserRound data-icon="inline-start" />{translate(language, 'grantModel')}</Button></div>{assignments.length > 0 ? <div className="flex flex-col gap-2 border-t border-border pt-3">{assignments.map(assignment => <div className="flex items-center justify-between gap-3 text-sm" key={assignment.id}><SubjectCell subjectType={assignment.subject.type} subjectId={assignment.subject.id} user={userNames.get(assignment.subject.id)} /><AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} />}><Trash2 data-icon="inline-start" />{translate(language, 'revoke')}</AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'revokeConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'revokeConfirmDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" disabled={pending} onClick={() => void run(async () => { await client.deleteModelAssignment(assignment.id); })}>{translate(language, 'confirmRevoke')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>)}</div> : null}</CardContent></Card>;
}

function ModelCatalogSkeleton() { return <div className="flex flex-col gap-4">{Array.from({ length: 2 }, (_, index) => <Card key={index}><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Skeleton className="size-4" /><div className="min-w-0 flex flex-col gap-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-64" /></div></div><Skeleton className="h-6 w-14" /></div></CardHeader><CardContent className="flex flex-col gap-3"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Skeleton className="h-9 w-full max-w-xs" /><Skeleton className="h-9 w-full max-w-32" /></div><Skeleton className="h-7 w-24" /></CardContent></Card>)}</div>; }

function ModelGrantDialog({ client, model, users, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly model: AdminModel;
  readonly users: readonly PlatformUser[];
  readonly onOpenChange: (model: AdminModel | null) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (model) { setSelected(new Set()); setFailed(false); } }, [model]);
  const toggleUser = useCallback((userId: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);
  const submit = async () => {
    if (selected.size === 0) return;
    setPending(true);
    setFailed(false);
    try {
      await Promise.all([...selected].map(userId => client.createModelAssignment({ modelId: model.id, subject: { type: AdminModelSubjectType.User, id: userId } })));
      onOpenChange(null);
      await onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open onOpenChange={nextOpen => { if (!pending && !nextOpen) onOpenChange(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(language, 'grantModelTitle')}</DialogTitle>
          <DialogDescription>{translate(language, 'grantModelDescription')} <span className="font-medium text-foreground">{model.displayName}</span></DialogDescription>
        </DialogHeader>
        {failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, 'grantFailed')}</AlertDescription></Alert> : null}
        <Field>
          <UserMultiPicker users={users} selected={selected} onToggle={toggleUser} disabled={pending} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(null)}>{translate(language, 'cancel')}</Button>
          <Button type="button" disabled={pending || selected.size === 0} onClick={() => void submit()}>{pending ? <Spinner data-icon="inline-start" /> : null}{translate(language, pending ? 'granting' : 'grant')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
