import { AlertCircle, ClipboardList, Eye, Search, Send, ShieldAlert } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { AdminControlEvent, JsonObject } from '@aep/sdk-node';

import { AdminConsoleClient, type AdminDeliveryPage, type AdminEventPage, type AdminEventRecord } from './client.js';
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
type EventFilters = Record<string, string | number>;

function withoutEmpty(filters: Record<string, string>): EventFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim() !== ''));
}

function dateTimeInputValue(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
}

export function Events({ client }: { readonly client: AdminConsoleClient }) {
  const [type, setType] = useState('');
  const [records, setRecords] = useState<readonly AdminEventRecord[]>([]);
  const [auditNextCursor, setAuditNextCursor] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState<EventFilters>({});
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [published, setPublished] = useState<string | null>(null);
  const [controlEvents, setControlEvents] = useState<readonly AdminControlEvent[]>([]);
  const [controlNextCursor, setControlNextCursor] = useState<string | null>(null);
  const [controlFilters, setControlFilters] = useState<EventFilters>({});
  const [controlEventsLoading, setControlEventsLoading] = useState(true);
  const [controlEventsError, setControlEventsError] = useState(false);
  const loadControlEvents = useCallback(async (filters: EventFilters = {}, append = false) => {
    setControlEventsLoading(true);
    setControlEventsError(false);
    try {
      const page = await client.controlEvents({ ...filters, limit: 100 });
      setControlEvents(current => append ? [...current, ...page.items] : page.items);
      setControlNextCursor(page.nextCursor);
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
      const filters = withoutEmpty({ ...auditFilters, type });
      setAuditFilters(filters);
      const page = await client.searchAudit({ ...filters, limit: 100 });
      setRecords(page.items);
      setAuditNextCursor(page.nextCursor);
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
      await loadControlEvents(controlFilters);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };
  const loadMoreAudit = async () => {
    if (!auditNextCursor) return;
    setStatus('loading');
    try {
      const page = await client.searchAudit({ ...auditFilters, cursor: auditNextCursor, limit: 100 });
      setRecords(current => [...current, ...page.items]);
      setAuditNextCursor(page.nextCursor);
      setStatus('idle');
    } catch { setStatus('error'); }
  };
  const searchControlEvents = async (filters: EventFilters) => {
    setControlFilters(filters);
    await loadControlEvents(filters);
  };
  return <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6"><div className="mx-auto flex w-full max-w-4xl flex-col gap-6"><div><p className="text-xs text-tertiary-foreground">{translate(language, 'workspaceLabel')}</p><h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, 'events')}</h2><p className="mt-1.5 text-sm text-muted-foreground">{translate(language, 'eventsDescription')}</p></div>{status === 'error' || controlEventsError ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'eventsFailed')}</AlertDescription></Alert> : null}<div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Card><CardHeader><div className="flex items-center gap-2"><Send className="size-4 text-muted-foreground" aria-hidden="true" /><CardTitle>{translate(language, 'publishEvent')}</CardTitle></div></CardHeader><CardContent><form className="flex flex-col gap-4" onSubmit={publish}><p className="text-sm text-muted-foreground">{translate(language, 'globalEventDescription')}</p><Button className="self-start" type="submit" disabled={status === 'loading'}>{status === 'loading' ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}{translate(language, 'publish')}</Button>{published ? <p className="text-xs text-success">{translate(language, 'eventCreated')}: {published}</p> : null}</form></CardContent></Card><AuditSearchCard type={type} onTypeChange={setType} filters={auditFilters} onFiltersChange={setAuditFilters} onSubmit={search} loading={status === 'loading'} /></div><ControlEventList events={controlEvents} loading={controlEventsLoading} nextCursor={controlNextCursor} client={client} onChanged={() => loadControlEvents(controlFilters)} onLoadMore={() => loadControlEvents({ ...controlFilters, cursor: controlNextCursor ?? '' }, true)} onSearch={searchControlEvents} onError={() => setControlEventsError(true)} /><AuditList records={records} nextCursor={auditNextCursor} loading={status === 'loading'} eventId={eventId} client={client} onLoadMore={loadMoreAudit} /></div></section>;
}

function AuditSearchCard({ type, onTypeChange, filters, onFiltersChange, onSubmit, loading }: { readonly type: string; readonly onTypeChange: (value: string) => void; readonly filters: EventFilters; readonly onFiltersChange: (filters: EventFilters) => void; readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void; readonly loading: boolean }) {
  const update = (key: string, value: string) => onFiltersChange({ ...filters, [key]: value });
  return <Card><CardHeader><div className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><CardTitle>{translate(language, 'auditSearch')}</CardTitle></div></CardHeader><CardContent><form className="flex flex-col gap-4" onSubmit={onSubmit}><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="event-type">{translate(language, 'eventType')}</FieldLabel><Input id="event-type" value={type} onChange={event => onTypeChange(event.target.value)} placeholder={translate(language, 'eventTypePlaceholder')} /></Field><Field><FieldLabel htmlFor="event-user-id">{translate(language, 'eventUserId')}</FieldLabel><Input id="event-user-id" value={String(filters.userId ?? '')} onChange={event => update('userId', event.target.value)} /></Field><Field><FieldLabel htmlFor="event-resource-type">{translate(language, 'eventResourceType')}</FieldLabel><Input id="event-resource-type" value={String(filters.resourceType ?? '')} onChange={event => update('resourceType', event.target.value)} /></Field><Field><FieldLabel htmlFor="event-resource-id">{translate(language, 'eventResourceId')}</FieldLabel><Input id="event-resource-id" value={String(filters.resourceId ?? '')} onChange={event => update('resourceId', event.target.value)} /></Field><Field><FieldLabel htmlFor="event-result">{translate(language, 'eventResult')}</FieldLabel><Input id="event-result" value={String(filters.result ?? '')} onChange={event => update('result', event.target.value)} /></Field><Field><FieldLabel htmlFor="event-occurred-after">{translate(language, 'occurredAfter')}</FieldLabel><Input id="event-occurred-after" type="datetime-local" value={dateTimeInputValue(filters.occurredAfter)} onChange={event => update('occurredAfter', event.target.value ? new Date(event.target.value).toISOString() : '')} /></Field><Field><FieldLabel htmlFor="event-occurred-before">{translate(language, 'occurredBefore')}</FieldLabel><Input id="event-occurred-before" type="datetime-local" value={dateTimeInputValue(filters.occurredBefore)} onChange={event => update('occurredBefore', event.target.value ? new Date(event.target.value).toISOString() : '')} /></Field></div><Button className="self-start" type="submit" variant="outline" disabled={loading}><Search data-icon="inline-start" />{translate(language, 'search')}</Button></form></CardContent></Card>;
}

function ControlEventList({ events, loading, nextCursor, client, onChanged, onLoadMore, onSearch, onError }: { readonly events: readonly AdminControlEvent[]; readonly loading: boolean; readonly nextCursor: string | null; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onLoadMore: () => Promise<void>; readonly onSearch: (filters: EventFilters) => Promise<void>; readonly onError: () => void }) {
  if (loading) return <Card><CardHeader><CardTitle>{translate(language, 'controlEvents')}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{translate(language, 'loading')}</p></CardContent></Card>;
  if (events.length === 0) return <Empty><EmptyHeader><EmptyMedia><ClipboardList aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'controlEventsEmpty')}</EmptyTitle><EmptyDescription>{translate(language, 'controlEventsEmptyHint')}</EmptyDescription></EmptyHeader></Empty>;
  return <Card><CardHeader><div className="flex flex-col gap-3"><div className="flex items-center gap-2"><ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" /><CardTitle>{translate(language, 'controlEvents')}</CardTitle></div><ControlEventFilter onSearch={onSearch} disabled={loading} /></div></CardHeader><CardContent><div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'eventType')}</TableHead><TableHead>{translate(language, 'scope')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead>{translate(language, 'time')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{events.map(event => <ControlEventRow key={event.eventId} event={event} client={client} onChanged={onChanged} onError={onError} />)}</TableBody></Table></div>{nextCursor ? <Button className="mt-3" size="sm" variant="outline" disabled={loading} onClick={() => void onLoadMore()}>{translate(language, 'loadMore')}</Button> : null}</CardContent></Card>;
}

function ControlEventFilter({ onSearch, disabled }: { readonly onSearch: (filters: EventFilters) => Promise<void>; readonly disabled: boolean }) {
  const [filters, setFilters] = useState({ type: '', scopeType: '', scopeId: '', createdAfter: '', createdBefore: '' });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void onSearch(withoutEmpty(filters)); };
  const update = (key: keyof typeof filters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  return <form className="grid grid-cols-1 gap-2 sm:grid-cols-2" onSubmit={submit}><Field><FieldLabel htmlFor="control-event-type">{translate(language, 'eventType')}</FieldLabel><Input id="control-event-type" value={String(filters.type ?? '')} onChange={event => update('type', event.target.value)} /></Field><Field><FieldLabel htmlFor="control-scope-type">{translate(language, 'scopeType')}</FieldLabel><Input id="control-scope-type" value={String(filters.scopeType ?? '')} onChange={event => update('scopeType', event.target.value)} /></Field><Field><FieldLabel htmlFor="control-scope-id">{translate(language, 'scopeId')}</FieldLabel><Input id="control-scope-id" value={String(filters.scopeId ?? '')} onChange={event => update('scopeId', event.target.value)} /></Field><Field><FieldLabel htmlFor="control-created-after">{translate(language, 'createdAfter')}</FieldLabel><Input id="control-created-after" type="datetime-local" value={dateTimeInputValue(filters.createdAfter)} onChange={event => update('createdAfter', event.target.value ? new Date(event.target.value).toISOString() : '')} /></Field><Field><FieldLabel htmlFor="control-created-before">{translate(language, 'createdBefore')}</FieldLabel><Input id="control-created-before" type="datetime-local" value={dateTimeInputValue(filters.createdBefore)} onChange={event => update('createdBefore', event.target.value ? new Date(event.target.value).toISOString() : '')} /></Field><Button className="self-end" type="submit" variant="outline" size="sm" disabled={disabled}>{translate(language, 'search')}</Button></form>;
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

function AuditList({ records, nextCursor, loading, eventId, client, onLoadMore }: { readonly records: readonly AdminEventRecord[]; readonly nextCursor: string | null; readonly loading: boolean; readonly eventId: string; readonly client: AdminConsoleClient; readonly onLoadMore: () => Promise<void> }) {
  const [delivery, setDelivery] = useState<AdminDeliveryPage | null>(null);
  const [deliveryCursor, setDeliveryCursor] = useState<string | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const loadDelivery = async (cursor?: string, append = false) => {
    setDeliveryLoading(true);
    try {
      const page = await client.deliverySummary(eventId, cursor ? { cursor, limit: 100 } : { limit: 100 });
      setDelivery(current => append && current ? { items: [...current.items, ...page.items], nextCursor: page.nextCursor } : page);
      setDeliveryCursor(page.nextCursor);
    } finally { setDeliveryLoading(false); }
  };
  if (records.length === 0 && !eventId) return <Empty><EmptyHeader><EmptyMedia><ClipboardList aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, 'auditEmpty')}</EmptyTitle><EmptyDescription>{translate(language, 'auditEmptyHint')}</EmptyDescription></EmptyHeader></Empty>;
  return <div className="flex flex-col gap-3"><div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'eventType')}</TableHead><TableHead>{translate(language, 'scope')}</TableHead><TableHead>{translate(language, 'userId')}</TableHead><TableHead>{translate(language, 'result')}</TableHead><TableHead className="text-right">{translate(language, 'time')}</TableHead></TableRow></TableHeader><TableBody>{records.map((record, index) => <TableRow key={record.eventId ?? index}><TableCell className="font-normal">{record.type || translate(language, 'unknownEvent')}</TableCell><TableCell className="text-tertiary-foreground">{record.scopeType ? `${record.scopeType}${record.scopeId ? ` / ${record.scopeId}` : ''}` : translate(language, 'global')}</TableCell><TableCell className="max-w-40 truncate text-xs text-tertiary-foreground">{record.userId || translate(language, 'notProvided')}</TableCell><TableCell><Badge variant={record.result === 'success' ? 'success' : record.result === 'failure' ? 'destructive' : 'outline'}>{record.result || translate(language, 'notProvided')}</Badge></TableCell><TableCell className="text-right text-xs text-tertiary-foreground">{record.receivedAt || record.createdAt ? formatTimestamp(record.receivedAt ?? record.createdAt) : translate(language, 'notProvided')}</TableCell></TableRow>)}</TableBody></Table></div>{nextCursor ? <Button variant="outline" size="sm" className="self-start" disabled={loading} onClick={() => void onLoadMore()}>{translate(language, 'loadMore')}</Button> : null}{eventId ? <Button variant="outline" size="sm" className="self-start" disabled={deliveryLoading} onClick={() => void loadDelivery()}>{deliveryLoading ? <Spinner data-icon="inline-start" /> : null}{translate(language, 'viewDelivery')}</Button> : null}{delivery ? <div className="flex flex-col gap-2"><div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'sessionId')}</TableHead><TableHead>{translate(language, 'deliveryState')}</TableHead><TableHead>{translate(language, 'attempts')}</TableHead><TableHead>{translate(language, 'deliveryError')}</TableHead></TableRow></TableHeader><TableBody>{delivery.items.map(item => <TableRow key={item.deliveryId}><TableCell className="max-w-48 truncate text-xs">{item.sessionId || item.deliveryId}</TableCell><TableCell><Badge variant={item.state === 'succeeded' ? 'success' : item.state === 'failed' ? 'destructive' : 'outline'}>{item.state}</Badge></TableCell><TableCell className="text-xs text-tertiary-foreground">{item.attemptCount ?? 0}</TableCell><TableCell className="max-w-64 truncate text-xs text-destructive">{item.errorCode || item.message || translate(language, 'notProvided')}</TableCell></TableRow>)}</TableBody></Table></div>{deliveryCursor ? <Button variant="outline" size="sm" className="self-start" disabled={deliveryLoading} onClick={() => void loadDelivery(deliveryCursor, true)}>{translate(language, 'loadMore')}</Button> : null}</div> : null}</div>;
}
