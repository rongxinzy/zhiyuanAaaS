import { AlertCircle, ClipboardList, Send, Search } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { JsonObject } from '@aep/sdk-node';

import { AdminConsoleClient, type AdminEventRecord } from './client.js';
import { formatTimestamp } from './format.js';
import { translate, type AdminLanguage } from './i18n.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { Button } from '../ui/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/components/ui/card.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/components/ui/empty.js';
import { Field, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/components/ui/table.js';

const language: AdminLanguage = 'zh';

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
  return <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6"><div className="mx-auto flex w-full max-w-4xl flex-col gap-6"><div><p className="text-xs text-tertiary-foreground">{translate(language, 'workspaceLabel')}</p><h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, 'events')}</h2><p className="mt-1.5 text-sm text-muted-foreground">{translate(language, 'eventsDescription')}</p></div>{status === 'error' ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'eventsFailed')}</AlertDescription></Alert> : null}<div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Card><CardHeader><div className="flex items-center gap-2"><Send className="size-4 text-muted-foreground" aria-hidden="true" /><CardTitle>{translate(language, 'publishEvent')}</CardTitle></div></CardHeader><CardContent><form className="flex flex-col gap-4" onSubmit={publish}><FieldGroup><Field><FieldLabel htmlFor="event-agent">{translate(language, 'agentId')}</FieldLabel><Input id="event-agent" value={agentId} onChange={event => setAgentId(event.target.value)} placeholder={translate(language, 'agentIdPlaceholder')} /></Field></FieldGroup><Button className="self-start" type="submit" disabled={status === 'loading'}>{status === 'loading' ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}{translate(language, 'publish')}</Button>{published ? <p className="text-xs text-success">{translate(language, 'eventCreated')}: {published}</p> : null}</form></CardContent></Card><Card><CardHeader><div className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><CardTitle>{translate(language, 'auditSearch')}</CardTitle></div></CardHeader><CardContent><form className="flex flex-col gap-4" onSubmit={search}><Field><FieldLabel htmlFor="event-type">{translate(language, 'eventType')}</FieldLabel><Input id="event-type" value={type} onChange={event => setType(event.target.value)} placeholder="model.catalog.changed" /></Field><Button className="self-start" type="submit" variant="outline" disabled={status === 'loading'}><Search data-icon="inline-start" />{translate(language, 'search')}</Button></form></CardContent></Card></div><AuditList records={records} eventId={eventId} client={client} /></div></section>;
}

function AuditList({ records, eventId, client }: { readonly records: readonly AdminEventRecord[]; readonly eventId: string; readonly client: AdminConsoleClient }) {
  const [delivery, setDelivery] = useState<unknown>(null);
  if (records.length === 0 && !eventId) return <Empty><EmptyHeader><EmptyMedia><ClipboardList aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'auditEmpty')}</EmptyTitle><EmptyDescription>{translate(language, 'auditEmptyHint')}</EmptyDescription></EmptyHeader></Empty>;
  return <div className="flex flex-col gap-3"><div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'eventType')}</TableHead><TableHead>{translate(language, 'agent')}</TableHead><TableHead className="text-right">{translate(language, 'time')}</TableHead></TableRow></TableHeader><TableBody>{records.map((record, index) => <TableRow key={record.eventId ?? index}><TableCell className="font-normal">{record.type || translate(language, 'unknownEvent')}</TableCell><TableCell className="text-tertiary-foreground">{record.agentId || translate(language, 'allAgents')}</TableCell><TableCell className="text-right text-xs text-tertiary-foreground">{record.receivedAt || record.createdAt ? formatTimestamp(record.receivedAt ?? record.createdAt) : translate(language, 'notProvided')}</TableCell></TableRow>)}</TableBody></Table></div>{eventId ? <Button variant="outline" size="sm" className="self-start" onClick={async () => setDelivery(await client.deliverySummary(eventId))}>{translate(language, 'viewDelivery')}</Button> : null}{delivery ? <pre className="overflow-auto rounded-lg border border-border bg-muted p-3 text-xs">{JSON.stringify(delivery, null, 2)}</pre> : null}</div>;
}
