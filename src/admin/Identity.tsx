import {
  ArrowLeft,
  CircleAlert,
  IdCard,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Check,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { PlatformUser } from '@aep/sdk-node';

import {
  AdminConsoleClient,
  AdminIdentityMappingStatus,
  AdminIdentitySourceKind,
  AdminIdentitySubjectType,
  AdminPermission,
  hasAdminPermission,
  type AdminIdentity,
  type AdminIdentityMapping,
  type AdminIdentitySource,
} from './client.js';
import { translate, type AdminLanguage, type AdminTranslationKey } from './i18n.js';
import { UserMultiPicker } from './UserMultiPicker.js';
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
import { BooleanSwitch } from './BooleanSwitch.js';
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
import { Skeleton } from '../ui/components/ui/skeleton.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/components/ui/table.js';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '../ui/components/ui/toggle-group.js';
import { AdminNotificationKind, notify } from './notifications.js';

const language: AdminLanguage = 'zh';

const IdentitySourceKindOrder = [
  AdminIdentitySourceKind.Directory,
  AdminIdentitySourceKind.Ldap,
  AdminIdentitySourceKind.Oidc,
] as const;

const IDENTITY_SOURCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export function Identity({ client, identity }: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const canWrite = hasAdminPermission(identity, AdminPermission.IdentityWrite);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const selectedSource = selectedSourceId;
  return selectedSource ? (
    <MappingPanel
      key={selectedSource}
      client={client}
      sourceId={selectedSource}
      canWrite={canWrite}
      identity={identity}
      onBack={() => setSelectedSourceId(null)}
    />
  ) : (
    <SourcePanel client={client} canWrite={canWrite} onSelected={setSelectedSourceId} />
  );
}

function SourcePanel({ client, canWrite, onSelected }: {
  readonly client: AdminConsoleClient;
  readonly canWrite: boolean;
  readonly onSelected: (sourceId: string) => void;
}) {
  const [sources, setSources] = useState<readonly AdminIdentitySource[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminTranslationKey | null>(null);
  const [creating, setCreating] = useState(false);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSources((await client.identitySources()).items);
    } catch {
      setError('identityLoadFailed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [client]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <IdCard className="size-4 text-muted-foreground" aria-hidden="true" />
          {translate(language, 'identitySourcesList')}
        </div>
        <div className="flex items-center gap-1.5">
          {canWrite ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" />
              {translate(language, 'addIdentitySource')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={translate(language, 'refresh')}
            title={translate(language, 'refresh')}
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{translate(language, error)}</AlertDescription>
        </Alert>
      ) : null}
      {loading && !sources ? (
        <IdentitySkeleton />
      ) : sources && sources.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia><IdCard aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>{translate(language, 'identitySourcesEmpty')}</EmptyTitle>
            <EmptyDescription>{translate(language, 'identitySourcesEmptyHint')}</EmptyDescription>
            {canWrite ? (
              <EmptyContent>
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus data-icon="inline-start" />
                  {translate(language, 'addIdentitySource')}
                </Button>
              </EmptyContent>
            ) : null}
          </EmptyHeader>
        </Empty>
      ) : sources ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translate(language, 'identitySourceName')}</TableHead>
                <TableHead>{translate(language, 'identitySourceKind')}</TableHead>
                <TableHead>{translate(language, 'status')}</TableHead>
                <TableHead className="text-right">{translate(language, 'actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map(source => (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <div className="truncate font-normal">{source.displayName}</div>
                      <div className="truncate text-xs text-tertiary-foreground">{source.id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="info">{identityKindLabel(source.kind)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={source.enabled ? 'success' : 'outline'}>
                      {translate(language, source.enabled ? 'enabled' : 'disabled')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" aria-label={source.displayName} title={source.displayName} onClick={() => onSelected(source.id)}>
                      {translate(language, 'identityMappings')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {canWrite && creating ? (
        <SourceCreateDialog
          client={client}
          open
          onOpenChange={setCreating}
          onChanged={load}
          onCreated={onSelected}
        />
      ) : null}
    </div>
  );
}

function SourceCreateDialog({ client, open, onOpenChange, onChanged, onCreated }: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onCreated: (sourceId: string) => void;
}) {
  const [sourceId, setSourceId] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AdminIdentitySourceKind>(AdminIdentitySourceKind.Directory);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<AdminTranslationKey | null>(null);
  useEffect(() => {
    if (open) { setSourceId(''); setName(''); setKind(AdminIdentitySourceKind.Directory); setFailed(null); }
  }, [open]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!IDENTITY_SOURCE_ID_PATTERN.test(sourceId.trim())) { setFailed('identitySourceIdRequired'); return; }
    if (!name.trim()) { setFailed('identitySourceNameRequired'); return; }
    setPending(true);
    setFailed(null);
    try {
      await client.createIdentitySource({ id: sourceId.trim(), kind, displayName: name.trim() });
      notify(AdminNotificationKind.Success, translate(language, 'identitySourceCreated'));
      onOpenChange(false);
      await onChanged();
      onCreated(sourceId.trim());
    } catch {
      setFailed('identitySourceFormFailed');
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(language, 'identitySourceEditorTitle')}</DialogTitle>
          <DialogDescription>{translate(language, 'identitySourceEditorDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {failed ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{translate(language, failed)}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="identity-source-id">{translate(language, 'identitySourceId')}</FieldLabel>
              <Input
                id="identity-source-id"
                value={sourceId}
                onChange={event => setSourceId(event.target.value)}
                placeholder={translate(language, 'identitySourceIdPlaceholder')}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="identity-source-name">{translate(language, 'identitySourceName')}</FieldLabel>
              <Input
                id="identity-source-name"
                value={name}
                onChange={event => setName(event.target.value)}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel>{translate(language, 'identitySourceKind')}</FieldLabel>
              <ToggleGroup
                value={[kind]}
                onValueChange={next => { if (next[0]) setKind(next[0] as AdminIdentitySourceKind); }}
                variant="outline"
                className="flex-wrap"
                aria-label={translate(language, 'identitySourceKind')}
              >
                {IdentitySourceKindOrder.map(candidate => (
                  <ToggleGroupItem key={candidate} value={candidate}>
                    {identityKindLabel(candidate)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              {translate(language, 'cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
              {translate(language, pending ? 'saving' : 'save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MappingPanel({ client, sourceId, canWrite, identity, onBack }: {
  readonly client: AdminConsoleClient;
  readonly sourceId: string;
  readonly canWrite: boolean;
  readonly identity?: AdminIdentity | undefined;
  readonly onBack: () => void;
}) {
  const [mappings, setMappings] = useState<readonly AdminIdentityMapping[] | null>(null);
  const [users, setUsers] = useState<readonly PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminTranslationKey | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [page, resources] = await Promise.all([
        client.identityMappings(sourceId),
        client.users().catch(() => [] as readonly PlatformUser[]),
      ]);
      setMappings(page.items);
      setUsers(resources);
    } catch {
      setError('identityLoadFailed');
    } finally {
      setLoading(false);
    }
  }, [client, sourceId]);
  useEffect(() => { void load(); }, [load]);
  const [editing, setEditing] = useState<AdminIdentityMapping | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IdCard className="size-4 text-muted-foreground" aria-hidden="true" />
            {translate(language, 'identityMappings')}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{translate(language, 'identityMappingsDescription')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {canWrite ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus data-icon="inline-start" />
              {translate(language, 'addIdentityMapping')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={translate(language, 'refresh')}
            title={translate(language, 'refresh')}
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
      </div>
      <div>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {translate(language, 'backToSources')}
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{translate(language, error)}</AlertDescription>
        </Alert>
      ) : null}
      {loading && !mappings ? (
        <IdentitySkeleton />
      ) : mappings && mappings.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia><IdCard aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>{translate(language, 'identityMappingsEmpty')}</EmptyTitle>
            <EmptyDescription>{translate(language, 'identityMappingsEmptyHint')}</EmptyDescription>
            {canWrite ? (
              <EmptyContent>
                <Button size="sm" onClick={() => setEditing('new')}>
                  <Plus data-icon="inline-start" />
                  {translate(language, 'addIdentityMapping')}
                </Button>
              </EmptyContent>
            ) : null}
          </EmptyHeader>
        </Empty>
      ) : mappings ? (
        <MappingTable
          mappings={mappings}
          canWrite={canWrite}
          client={client}
          onChanged={load}
          onEdit={setEditing}
          onError={() => setError('identityMappingDeleteFailed')}
        />
      ) : null}
      {canWrite && editing ? (
        <MappingDialog
          client={client}
          sourceId={sourceId}
          {...(editing === 'new' ? {} : { mapping: editing })}
          users={users}
          open
          onOpenChange={open => { if (!open) setEditing(null); }}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

function MappingTable({ mappings, canWrite, client, onChanged, onEdit, onError }: {
  readonly mappings: readonly AdminIdentityMapping[];
  readonly canWrite: boolean;
  readonly client: AdminConsoleClient;
  readonly onChanged: () => Promise<void>;
  readonly onEdit: (mapping: AdminIdentityMapping) => void;
  readonly onError: () => void;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const remove = async (mapping: AdminIdentityMapping) => {
    const key = mapping.externalId;
    setPendingKey(key);
    try {
      await client.deleteIdentityMapping(mapping.sourceId, mapping.externalId);
      await onChanged();
    } catch {
      onError();
    } finally {
      setPendingKey(null);
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{translate(language, 'identityExternalId')}</TableHead>
            <TableHead>{translate(language, 'identityLocalUserId')}</TableHead>
            <TableHead>{translate(language, 'status')}</TableHead>
            {canWrite ? <TableHead className="text-right">{translate(language, 'actions')}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map(mapping => (
            <TableRow key={`${mapping.externalSubjectType}/${mapping.externalId}`}>
              <TableCell className="max-w-64 truncate text-xs">{mapping.externalId}</TableCell>
              <TableCell className="max-w-64 truncate text-xs text-tertiary-foreground">{mapping.localSubjectId}</TableCell>
              <TableCell>
                <Badge variant={mapping.status === 'active' ? 'success' : 'outline'}>
                  {translate(language, mapping.status === 'active' ? 'active' : 'disabled')}
                </Badge>
              </TableCell>
              {canWrite ? (
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" disabled={pendingKey !== null} onClick={() => onEdit(mapping)}>
                      <Pencil data-icon="inline-start" />
                      {translate(language, 'edit')}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                            disabled={pendingKey !== null}
                          />
                        }
                      >
                        <Trash2 data-icon="inline-start" />
                        {translate(language, 'delete')}
                      </AlertDialogTrigger>
                      <AlertDialogContent size="sm">
                        <AlertDialogHeader>
                          <AlertDialogTitle>{translate(language, 'deleteIdentityMappingTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>{translate(language, 'deleteIdentityMappingDescription')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={pendingKey !== null}>{translate(language, 'cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-primary-foreground hover:bg-destructive-hover"
                            disabled={pendingKey !== null}
                            onClick={() => void remove(mapping)}
                          >
                            {translate(language, 'confirmDeleteIdentityMapping')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MappingDialog({ client, sourceId, mapping, users, open, onOpenChange, onChanged }: {
  readonly client: AdminConsoleClient;
  readonly sourceId: string;
  readonly mapping?: AdminIdentityMapping;
  readonly users: readonly PlatformUser[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
}) {
  const editing = Boolean(mapping);
  const [externalId, setExternalId] = useState(mapping?.externalId ?? '');
  const [localUserId, setLocalUserId] = useState(mapping?.localSubjectId ?? '');
  const [active, setActive] = useState(mapping?.status !== 'disabled');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<AdminTranslationKey | null>(null);
  useEffect(() => {
    if (open) {
      setExternalId(mapping?.externalId ?? '');
      setLocalUserId(mapping?.localSubjectId ?? '');
      setActive(mapping?.status !== 'disabled');
      setFailed(null);
    }
  }, [open, mapping]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!externalId.trim()) { setFailed('identityExternalIdRequired'); return; }
    if (!localUserId.trim()) { setFailed('identityLocalUserIdRequired'); return; }
    setPending(true);
    setFailed(null);
    try {
      await client.upsertIdentityMapping(sourceId, {
        externalSubjectType: AdminIdentitySubjectType.User,
        externalId: externalId.trim(),
        localSubjectId: localUserId.trim(),
      });
      notify(AdminNotificationKind.Success, translate(language, 'identityMappingSaved'));
      onOpenChange(false);
      await onChanged();
    } catch {
      setFailed('identityMappingFormFailed');
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(language, editing ? 'identityMappingEditTitle' : 'identityMappingEditorTitle')}</DialogTitle>
          <DialogDescription>{translate(language, 'identityMappingEditorDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {failed ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{translate(language, failed)}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="identity-external-id">{translate(language, 'identityExternalId')}</FieldLabel>
              <Input
                id="identity-external-id"
                value={externalId}
                onChange={event => setExternalId(event.target.value)}
                placeholder={translate(language, 'identityExternalIdPlaceholder')}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="identity-local-user-id">{translate(language, 'identityLocalUserId')}</FieldLabel>
              <Input
                id="identity-local-user-id"
                value={localUserId}
                onChange={event => setLocalUserId(event.target.value)}
                placeholder={translate(language, 'identityLocalUserIdPlaceholder')}
                disabled={pending}
              />
            </Field>
            {users.length > 0 ? (
              <Field>
                <UserMultiPicker
                  users={users}
                  selected={new Set(localUserId ? [localUserId] : [])}
                  onToggle={userId => setLocalUserId(current => (current === userId ? '' : userId))}
                  disabled={pending}
                />
              </Field>
            ) : null}
            <BooleanSwitch
              id="identity-mapping-active"
              label={`${translate(language, 'identityMappingStatus')}: ${translate(language, active ? 'active' : 'disabled')}`}
              checked={active}
              onCheckedChange={setActive}
              disabled={pending}
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              {translate(language, 'cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              {translate(language, pending ? 'saving' : 'save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function identityKindLabel(kind: string): string {
  if (kind === AdminIdentitySourceKind.Directory) return translate(language, 'identityKindDirectory');
  if (kind === AdminIdentitySourceKind.Ldap) return translate(language, 'identityKindLdap');
  if (kind === AdminIdentitySourceKind.Oidc) return translate(language, 'identityKindOidc');
  return kind;
}

function IdentitySkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card" role="status">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="flex items-center gap-3 border-b p-4 last:border-b-0" key={index}>
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
