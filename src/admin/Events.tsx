import { AlertCircle, ClipboardList, Send, Search } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { JsonObject } from '@aep/sdk-node';

import { AdminConsoleClient, type AdminEventRecord } from './client.js';
import { translate } from './i18n.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { Button } from '../ui/components/ui/button.js';
import { Field, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Spinner } from '../ui/components/ui/spinner.js';

export function Events({ client }: { readonly client: AdminConsoleClient }) {
  const [agentId, setAgentId] = useState('');
  const [type, setType] = useState('');
  const [records, setRecords] = useState<readonly AdminEventRecord[]>([]);
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [published, setPublished] = useState<string | null>(null);
  const search = async (event?: FormEvent) => {
    event?.preventDefault(); setStatus('loading');
    try { setRecords(await client.searchAudit({ ...(agentId ? { agentId } : {}), ...(type ? { type } : {}) })); setStatus('idle'); } catch { setStatus('error'); }
  };
  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!agentId.trim()) { setStatus('error'); return; }
    setStatus('loading');
    try { const result = await client.publishControlEvent({ type: 'model.catalog.changed', scope: { type: 'agent', id: agentId.trim() }, task: { type: 'model.catalog.refresh' }, expiresAt: new Date(Date.now() + 300_000).toISOString(), supersedesKey: `admin-console:${agentId.trim()}` } as JsonObject); const id = typeof result.eventId === 'string' ? result.eventId : ''; setEventId(id); setPublished(id || 'created'); setStatus('idle'); } catch { setStatus('error'); }
  };
  return <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6"><div className="mx-auto flex w-full max-w-5xl flex-col gap-6"><div><h1 className="text-lg font-semibold">{translate('zh', 'events')}</h1><p className="text-sm text-muted-foreground">{translate('zh', 'eventsDescription')}</p></div>{status === 'error' ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate('zh', 'eventsFailed')}</AlertDescription></Alert> : null}<div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><form className="flex flex-col gap-4 rounded-lg border bg-card p-4" onSubmit={publish}><div className="flex items-center gap-2"><Send className="size-4" aria-hidden="true" /><h2 className="text-base font-semibold">{translate('zh', 'publishEvent')}</h2></div><FieldGroup><Field><FieldLabel htmlFor="event-agent">{translate('zh', 'agentId')}</FieldLabel><Input id="event-agent" value={agentId} onChange={event => setAgentId(event.target.value)} placeholder={translate('zh', 'agentIdPlaceholder')} /></Field></FieldGroup><Button type="submit" disabled={status === 'loading'}>{status === 'loading' ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}{translate('zh', 'publish')}</Button>{published ? <p className="text-xs text-muted-foreground">{translate('zh', 'eventCreated')}: {published}</p> : null}</form><form className="flex flex-col gap-4 rounded-lg border bg-card p-4" onSubmit={search}><div className="flex items-center gap-2"><Search className="size-4" aria-hidden="true" /><h2 className="text-base font-semibold">{translate('zh', 'auditSearch')}</h2></div><Field><FieldLabel htmlFor="event-type">{translate('zh', 'eventType')}</FieldLabel><Input id="event-type" value={type} onChange={event => setType(event.target.value)} placeholder="model.catalog.changed" /></Field><Button type="submit" variant="outline" disabled={status === 'loading'}><Search data-icon="inline-start" />{translate('zh', 'search')}</Button></form></div><AuditList records={records} eventId={eventId} client={client} /></div></section>;
}

function AuditList({ records, eventId, client }: { readonly records: readonly AdminEventRecord[]; readonly eventId: string; readonly client: AdminConsoleClient }) {
  const [delivery, setDelivery] = useState<unknown>(null);
  if (records.length === 0 && !eventId) return <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center"><ClipboardList className="size-8 text-muted-foreground" aria-hidden="true" /><span className="text-sm text-muted-foreground">{translate('zh', 'auditEmpty')}</span></div>;
  return <div className="flex flex-col gap-3"><div className="overflow-hidden rounded-lg border" role="table">{records.map((record, index) => <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0" role="row" key={record.eventId ?? index}><div className="min-w-0"><div className="truncate text-sm font-medium">{record.type || translate('zh', 'unknownEvent')}</div><div className="truncate text-xs text-muted-foreground">{record.agentId || translate('zh', 'allAgents')}</div></div><div className="text-xs text-muted-foreground">{record.receivedAt || record.createdAt || translate('zh', 'notProvided')}</div></div>)}</div>{eventId ? <Button variant="outline" size="sm" className="self-start" onClick={async () => setDelivery(await client.deliverySummary(eventId))}>{translate('zh', 'viewDelivery')}</Button> : null}{delivery ? <pre className="overflow-auto rounded-lg border bg-muted p-3 text-xs">{JSON.stringify(delivery, null, 2)}</pre> : null}</div>;
}
