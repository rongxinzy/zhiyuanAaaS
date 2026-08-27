import { Check, CircleAlert, Cpu, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { AdminModel, ModelAssignment } from '@aep/sdk-node';

import { AdminConsoleClient, type AdminModels } from './client.js';
import { translate, type AdminTranslationKey } from './i18n.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { Field, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Skeleton } from '../ui/components/ui/skeleton.js';
import { Spinner } from '../ui/components/ui/spinner.js';

const ModelSourceType = { Gateway: 'gateway' } as const;
const ModelProtocol = { OpenAiCompatible: 'openai-compatible' } as const;

export function Models({ client }: { readonly client: AdminConsoleClient }) {
  const [state, setState] = useState<AdminModels | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminTranslationKey | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setState(await client.models()); } catch { setError('modelsLoadFailed'); } finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  return <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6"><div className="mx-auto flex w-full max-w-6xl flex-col gap-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-muted-foreground">{translate('zh', 'workspaceLabel')}</p><h2 className="mt-1 text-lg font-semibold leading-snug">{translate('zh', 'models')}</h2><p className="mt-2 text-sm text-muted-foreground">{translate('zh', 'modelsDescription')}</p></div><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>{loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}{translate('zh', loading ? 'refreshing' : 'refresh')}</Button></div>{error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate('zh', error)}</AlertDescription></Alert> : null}<ModelCreateForm client={client} onCreated={load} />{loading && !state ? <ModelCatalogSkeleton /> : null}{state ? <div className="flex flex-col gap-4"><ModelList models={state.models} assignments={state.assignments} client={client} onChanged={load} onError={() => setError('modelsLoadFailed')} /></div> : null}</div></section>;
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
  if (!open) return <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}><Plus data-icon="inline-start" />{translate('zh', 'addModel')}</Button>;
  return <form className="flex flex-col gap-4 rounded-lg border bg-background p-5" onSubmit={submit} noValidate><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{translate('zh', 'addModel')}</h2><Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{translate('zh', 'cancel')}</Button></div>{error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate('zh', 'modelFormFailed')}</AlertDescription></Alert> : null}<FieldGroup><Field><FieldLabel htmlFor="model-id">{translate('zh', 'modelId')}</FieldLabel><Input id="model-id" value={id} onChange={event => setId(event.target.value)} disabled={pending} /></Field><Field><FieldLabel htmlFor="model-name">{translate('zh', 'modelName')}</FieldLabel><Input id="model-name" value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={pending} /></Field><Field><FieldLabel htmlFor="model-endpoint">{translate('zh', 'modelEndpoint')}</FieldLabel><Input id="model-endpoint" type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder={translate('zh', 'modelEndpointPlaceholder')} disabled={pending} /></Field><Field><FieldLabel htmlFor="model-upstream">{translate('zh', 'upstreamModel')}</FieldLabel><Input id="model-upstream" value={upstreamModel} onChange={event => setUpstreamModel(event.target.value)} disabled={pending} /></Field></FieldGroup><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}{translate('zh', pending ? 'saving' : 'save')}</Button></form>;
}

function ModelList({ models, assignments, client, onChanged, onError }: { readonly models: readonly AdminModel[]; readonly assignments: readonly ModelAssignment[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  if (models.length === 0) return <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-background p-10 text-center"><div className="flex size-10 items-center justify-center rounded-full border bg-muted/40"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" /></div><div><p className="text-sm font-medium">{translate('zh', 'modelsEmpty')}</p><p className="mt-1 text-xs text-muted-foreground">{translate('zh', 'modelsEmptyHint')}</p></div></div>;
  return <div className="flex flex-col gap-4">{models.map(model => <ModelRow key={model.id} model={model} assignments={assignments.filter(item => item.resourceId === model.id)} client={client} onChanged={onChanged} onError={onError} />)}</div>;
}

function ModelRow({ model, assignments, client, onChanged, onError }: { readonly model: AdminModel; readonly assignments: readonly ModelAssignment[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const [pending, setPending] = useState(false);
  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    try { await operation(); await onChanged(); } catch { onError(); } finally { setPending(false); }
  };
  return <article className="flex flex-col gap-4 rounded-lg border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Cpu className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{model.displayName}</h2><p className="break-all text-xs text-muted-foreground">{model.id} / {model.upstreamModel || model.localModelRef || translate('zh', 'notProvided')}</p></div></div><div className="flex items-center gap-2"><Badge variant={model.enabled ? 'secondary' : 'outline'}>{translate('zh', model.enabled ? 'enabled' : 'disabled')}</Badge>{model.isDefault ? <Badge variant="outline">{translate('zh', 'defaultModel')}</Badge> : null}</div></div><dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">{translate('zh', 'modelEndpoint')}</dt><dd className="break-all font-medium">{model.endpoint || translate('zh', 'notProvided')}</dd></div><div><dt className="text-xs text-muted-foreground">{translate('zh', 'assignments')}</dt><dd className="font-medium">{assignments.length}</dd></div></dl><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async () => { await client.updateModel(model.id, { enabled: !model.enabled }); })}>{translate('zh', model.enabled ? 'disable' : 'enable')}</Button>{!model.isDefault ? <Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async () => { await client.updateModel(model.id, { isDefault: true }); })}>{translate('zh', 'makeDefault')}</Button> : null}</div>{assignments.length > 0 ? <div className="flex flex-col gap-2 border-t pt-3">{assignments.map(assignment => <div className="flex items-center justify-between gap-3 text-sm" key={assignment.id}><span className="truncate text-muted-foreground">{assignment.subject.type}: {assignment.subject.id}</span><Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} onClick={() => void run(async () => { await client.deleteModelAssignment(assignment.id); })}><Trash2 data-icon="inline-start" />{translate('zh', 'revoke')}</Button></div>)}</div> : null}</article>;
}

function ModelCatalogSkeleton() {
  return <div className="flex flex-col gap-4">{Array.from({ length: 2 }, (_, index) => <div key={index} className="flex flex-col gap-4 rounded-lg border bg-background p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Skeleton className="size-4 mt-1" /><div className="min-w-0 space-y-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-64" /></div></div><Skeleton className="h-6 w-14" /></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Skeleton className="h-9 w-full max-w-xs" /><Skeleton className="h-9 w-full max-w-[8rem]" /></div><Skeleton className="h-7 w-24" /></div>)}</div>;
}
