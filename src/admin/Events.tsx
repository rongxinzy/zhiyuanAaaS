import { AlertCircle, ClipboardList, Eye, Search, Send, ShieldAlert } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { AdminControlEvent, JsonObject } from '@aep/sdk-node';

import { AdminConsoleClient, type AdminEventRecord } from './client.js';
import { formatTimestamp } from './format.js';
import { translate, type AdminLanguage, type AdminTranslationKey } from './i18n.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/components/ui/alert-dialog.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/components/ui/card.js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/components/ui/dialog.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/components/ui/empty.js';
import { Field, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/components/ui/table.js';

const language: AdminLanguage = 'zh';

export function Events({ client }: { readonly client: AdminConsoleClient }) {
  const [type, setType] = useState('');
  const [records, setRecords] = useState<readonly AdminEventRecord[]>([]);
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [published, setPublished] = useState<string | null>(null);
  const [controlEvents, setControlEvents] = useState<readonly AdminControlEvent[]>([]);
  const [controlEventsLoading, setControlEventsLoading] = useState(true);
  const [controlEventsError, setControlEventsError] = useState(false);
  const loadControlEvents = useCallback(async () => {
    setControlEventsLoading(true);
    setControlEventsError(false);
    try {
      setControlEvents((await client.controlEvents({ limit: 100 })).items);
    } catch {
      setControlEventsError(true);
    } finally {
      setControlEventsLoading(false);
    }
  }, [client]);
  useEffect(() => { void loadControlEvents(); }, [loadControlEvents]);
  const search = async (event?: FormEvent) => {
    event?.preventDefault();
    setStatus('loading');
    try {
      setRecords(await client.searchAudit({ ...(type ? { type } : {}) }));
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };
  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('loading');
    try {
      const result = await client.publishControlEvent({ type: 'model.catalog.changed', scope: { type: 'global' }, task: { type: 'model.reconcile' }, expiresAt: new Date(Date.now() + 300_000).toISOString(), supersedesKey: 'admin-console:model-catalog' } as JsonObject);
      const id = typeof result.eventId === 'string' ? result.eventId : '';
      setEventId(id);
      setPublished(id || 'created');
      await loadControlEvents();
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };
  return <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6"><div className="mx-auto flex w-full max-w-4xl flex-col gap-6"><div><p className="text-xs text-tertiary-foreground">{translate(language, 'workspaceLabel')}</p><h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, 'events')}</h2><p className="mt-1.5 text-sm text-muted-foreground">{translate(language, 'eventsDescription')}</p></div>{status === 'error' || controlEventsError ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'eventsFailed')}</AlertDescription></Alert> : null}<div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Card><CardHeader><div className="flex items-center gap-2"><Send className="size-4 text-muted-foreground" aria-hidden="true" /><CardTitle>{translate(language, 'publishEvent')}</CardTitle></div></CardHeader><CardContent><form className="flex flex-col gap-4" onSubmit={publish}><p className="text-sm text-muted-foreground">{translate(language, 'globalEventDescription')}</p><Button className="self-start" type="submit" disabled={status === 'loading'}>{status === 'loading' ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}{translate(language, 'publish')}</Button>{published ? <p className="text-xs text-success">{translate(language, 'eventCreated')}: {published}</p> : null}</form></CardContent></Card><Card><CardHeader><div className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><CardTitle>{translate(language, 'auditSearch')}</CardTitle></div></CardHeader><CardContent><form className="flex flex-col gap-4" onSubmit={search}><Field><FieldLabel htmlFor="event-type">{translate(language, 'eventType')}</FieldLabel><Input id="event-type" value={type} onChange={event => setType(event.target.value)} placeholder={translate(language, 'eventTypePlaceholder')} /></Field><Button className="self-start" type="submit" variant="outline" disabled={status === 'loading'}><Search data-icon="inline-start" />{translate(language, 'search')}</Button></form></CardContent></Card></div><ControlEventList events={controlEvents} loading={controlEventsLoading} client={client} onChanged={loadControlEvents} onError={() => setControlEventsError(true)} /><AuditList records={records} eventId={eventId} client={client} /></div></section>;
}

function ControlEventList({ events, loading, client, onChanged, onError }: { readonly events: readonly AdminControlEvent[]; readonly loading: boolean; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  if (loading) return <Card><CardHeader><CardTitle>{translate(language, 'controlEvents')}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{translate(language, 'loading')}</p></CardContent></Card>;
  if (events.length === 0) return <Empty><EmptyHeader><EmptyMedia><ClipboardList aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'controlEventsEmpty')}</EmptyTitle><EmptyDescription>{translate(language, 'controlEventsEmptyHint')}</EmptyDescription></EmptyHeader></Empty>;
  return <Card><CardHeader><div className="flex items-center gap-2"><ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" /><CardTitle>{translate(language, 'controlEvents')}</CardTitle></div></CardHeader><CardContent><div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'eventType')}</TableHead><TableHead>{translate(language, 'scope')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead>{translate(language, 'time')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{events.map(event => <ControlEventRow key={event.eventId} event={event} client={client} onChanged={onChanged} onError={onError} />)}</TableBody></Table></div></CardContent></Card>;
}

function ControlEventRow({ event, client, onChanged, onError }: { readonly event: AdminControlEvent; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const [pending, setPending] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<AdminControlEvent | null>(null);
  const inspect = async () => { setPending(true); try { setDetail(await client.getControlEvent(event.eventId)); setDetailOpen(true); } catch { onError(); } finally { setPending(false); } };
  const cancel = async () => { setPending(true); try { await client.cancelControlEvent(event.eventId); await onChanged(); } catch { onError(); } finally { setPending(false); } };
  return <><TableRow><TableCell className="max-w-48 truncate font-normal">{event.type}</TableCell><TableCell className="text-xs text-tertiary-foreground">{scopeLabel(event)}</TableCell><TableCell><Badge variant={event.state === 'active' ? 'success' : event.state === 'cancelled' ? 'outline' : 'warning'}>{translate(language, eventStateLabel(event.state))}</Badge></TableCell><TableCell className="text-xs text-tertiary-foreground">{formatTimestamp(event.createdAt)}</TableCell><TableCell><div className="flex justify-end gap-1.5"><Button size="icon-xs" variant="ghost" aria-label={translate(language, 'viewDetails')} title={translate(language, 'viewDetails')} disabled={pending} onClick={() => void inspect()}><Eye /></Button>{event.state === 'active' ? <AlertDialog><AlertDialogTrigger render={<Button size="icon-xs" variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" aria-label={translate(language, 'cancelEvent')} title={translate(language, 'cancelEvent')} disabled={pending} />}><ShieldAlert /></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'cancelEventTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'cancelEventDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive-hover" disabled={pending} onClick={() => void cancel()}>{translate(language, 'confirmCancelEvent')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div></TableCell></TableRow><Dialog open={detailOpen} onOpenChange={setDetailOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{translate(language, 'eventDetails')}</DialogTitle><DialogDescription>{translate(language, 'eventDetailsDescription')}</DialogDescription></DialogHeader><pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted p-3 text-xs">{detail ? JSON.stringify(detail, null, 2) : ''}</pre><DialogFooter><Button variant="ghost" onClick={() => setDetailOpen(false)}>{translate(language, 'close')}</Button></DialogFooter></DialogContent></Dialog></>;
}

function scopeLabel(event: AdminControlEvent): string {
  const scopeId = 'id' in event.scope ? event.scope.id : null;
  return `${event.scope.type}${scopeId ? ` / ${scopeId}` : ''}`;
}

function eventStateLabel(state: AdminControlEvent['state']): AdminTranslationKey {
  if (state === 'active') return 'active';
  if (state === 'cancelled') return 'cancelled';
  if (state === 'expired') return 'expired';
  return 'superseded';
}

function AuditList({ records, eventId, client }: { readonly records: readonly AdminEventRecord[]; readonly eventId: string; readonly client: AdminConsoleClient }) {
  const [delivery, setDelivery] = useState<unknown>(null);
  if (records.length === 0 && !eventId) return <Empty><EmptyHeader><EmptyMedia><ClipboardList aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'auditEmpty')}</EmptyTitle><EmptyDescription>{translate(language, 'auditEmptyHint')}</EmptyDescription></EmptyHeader></Empty>;
  return <div className="flex flex-col gap-3"><div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'eventType')}</TableHead><TableHead>{translate(language, 'scope')}</TableHead><TableHead className="text-right">{translate(language, 'time')}</TableHead></TableRow></TableHeader><TableBody>{records.map((record, index) => <TableRow key={record.eventId ?? index}><TableCell className="font-normal">{record.type || translate(language, 'unknownEvent')}</TableCell><TableCell className="text-tertiary-foreground">{record.scopeType ? `${record.scopeType}${record.scopeId ? ` / ${record.scopeId}` : ''}` : translate(language, 'global')}</TableCell><TableCell className="text-right text-xs text-tertiary-foreground">{record.receivedAt || record.createdAt ? formatTimestamp(record.receivedAt ?? record.createdAt) : translate(language, 'notProvided')}</TableCell></TableRow>)}</TableBody></Table></div>{eventId ? <Button variant="outline" size="sm" className="self-start" onClick={async () => setDelivery(await client.deliverySummary(eventId))}>{translate(language, 'viewDelivery')}</Button> : null}{delivery ? <pre className="overflow-auto rounded-lg border border-border bg-muted p-3 text-xs">{JSON.stringify(delivery, null, 2)}</pre> : null}</div>;
}
