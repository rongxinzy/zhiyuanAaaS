import { Bot, Boxes, CircleAlert, KeyRound, RefreshCw, UserRound, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { PlatformUser } from '@aep/sdk-node';
import {
  AdminConsoleClient,
  AdminSubjectType,
  type AdminResources,
  type AdminSkill,
  type AdminSkillAssignment,
} from './client.js';
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
import { UserMultiPicker } from './UserMultiPicker.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/components/ui/dialog.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/components/ui/empty.js';
import { Field, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Skeleton } from '../ui/components/ui/skeleton.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/components/ui/table.js';

const language: AdminLanguage = 'zh';

export const AdminResourceTab = {
  Users: 'users',
  Agents: 'agents',
  Skills: 'skills',
  Assignments: 'assignments',
} as const;
export type AdminResourceTab = (typeof AdminResourceTab)[keyof typeof AdminResourceTab];

interface ResourcesProps {
  readonly client: AdminConsoleClient;
  readonly tab: AdminResourceTab;
}

export function Resources({ client, tab }: ResourcesProps) {
  const [resources, setResources] = useState<AdminResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminTranslationKey | null>(null);
  const [granting, setGranting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResources(await client.resources());
    } catch {
      setError('resourcesLoadFailed');
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  const reportError = useCallback(() => setError('resourcesLoadFailed'), []);

  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs text-muted-foreground">{translate(language, 'workspaceLabel')}</p><h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, resourceTitle(tab))}</h2></div>
          <div className="flex shrink-0 items-center gap-1.5">
            {tab === AdminResourceTab.Assignments && resources ? <Button size="sm" onClick={() => setGranting(true)}><UserRound data-icon="inline-start" />{translate(language, 'grantSkill')}</Button> : null}
            <Button variant="ghost" size="icon" aria-label={translate(language, 'refresh')} title={translate(language, 'refresh')} disabled={loading} onClick={() => void load()}>
              {loading ? <Spinner /> : <RefreshCw />}
            </Button>
          </div>
        </div>
        {error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, error)}</AlertDescription></Alert> : null}
        {loading && !resources ? <ResourceListSkeleton /> : resources ? <>
          <ResourceTable tab={tab} resources={resources} onChanged={load} client={client} onError={reportError} onGrant={() => setGranting(true)} />
          {tab === AdminResourceTab.Assignments ? <SkillGrantDialog client={client} open={granting} users={resources.users} skills={resources.skills} onOpenChange={setGranting} onChanged={load} onError={reportError} /> : null}
        </> : null}
      </div>
    </section>
  );
}

function ResourceTable({ tab, resources, client, onChanged, onError, onGrant }: {
  readonly tab: AdminResourceTab;
  readonly resources: AdminResources;
  readonly client: AdminConsoleClient;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onGrant: () => void;
}) {
  if (tab === AdminResourceTab.Users) return <UsersTable users={resources.users} client={client} onChanged={onChanged} onError={onError} />;
  if (tab === AdminResourceTab.Agents) return <AgentsTable agents={resources.agents} />;
  if (tab === AdminResourceTab.Skills) return <SkillsTable skills={resources.skills} client={client} onChanged={onChanged} onError={onError} />;
  return <AssignmentsTable assignments={resources.assignments} skills={resources.skills} users={resources.users} client={client} onChanged={onChanged} onError={onError} onGrant={onGrant} />;
}

function useRowMutation(onDone: () => Promise<void>, onError: () => void) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const run = useCallback(async (id: string, operation: () => Promise<void>) => {
    setPendingId(id);
    try {
      await operation();
      await onDone();
    } catch {
      onError();
    } finally {
      setPendingId(null);
    }
  }, [onDone, onError]);
  return { pendingId, run };
}

function UsersTable({ users, client, onChanged, onError }: { readonly users: readonly PlatformUser[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (users.length === 0) return <EmptyState label="usersEmpty" hint="usersEmptyHint" icon={UserRound} />;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'user')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{users.map(user => <TableRow key={user.id}><TableCell><div className="flex min-w-0 items-center gap-3"><UserRound className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-normal">{user.displayName}</div><div className="truncate text-xs text-muted-foreground">{user.username}</div></div></div></TableCell><TableCell><Badge variant={user.status === 'active' ? 'secondary' : 'outline'}>{translate(language, user.status === 'active' ? 'active' : 'disabled')}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(user.id, async () => { await client.updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }); })}>{translate(language, user.status === 'active' ? 'disable' : 'enable')}</Button></TableCell></TableRow>)}</TableBody></Table></div>;
}

function AgentsTable({ agents }: { readonly agents: AdminResources['agents'] }) {
  if (agents.length === 0) return <EmptyState label="agentsEmpty" hint="agentsEmptyHint" icon={Bot} />;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'agent')}</TableHead><TableHead className="text-right">{translate(language, 'lastSeen')}</TableHead></TableRow></TableHeader><TableBody>{agents.map(agent => <TableRow key={agent.agentId}><TableCell><div className="flex min-w-0 items-center gap-3"><Bot className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-normal">{agent.agentId}</div><div className="text-xs text-muted-foreground">{agent.platform} · {agent.agentVersion}</div></div></div></TableCell><TableCell className="text-right text-xs text-muted-foreground">{formatTimestamp(agent.lastSeenAt)}</TableCell></TableRow>)}</TableBody></Table></div>;
}

function SkillsTable({ skills, client, onChanged, onError }: { readonly skills: readonly AdminSkill[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (skills.length === 0) return <EmptyState label="skillsEmpty" hint="skillsEmptyHint" icon={Boxes} />;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'skill')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{skills.map(skill => <TableRow key={skill.id}><TableCell><div className="flex min-w-0 items-center gap-3"><Boxes className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-normal">{skill.name}</div><div className="truncate text-xs text-muted-foreground">{skill.description || skill.id}</div></div></div></TableCell><TableCell><Badge variant={skill.enabled ? 'secondary' : 'outline'}>{translate(language, skill.enabled ? 'enabled' : 'disabled')}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(skill.id, async () => { await client.updateSkill(skill.id, { enabled: !skill.enabled }); })}>{translate(language, skill.enabled ? 'disable' : 'enable')}</Button></TableCell></TableRow>)}</TableBody></Table></div>;
}

function AssignmentsTable({ assignments, skills, users, client, onChanged, onError, onGrant }: { readonly assignments: readonly AdminSkillAssignment[]; readonly skills: readonly AdminSkill[]; readonly users: readonly PlatformUser[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void; readonly onGrant: () => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (assignments.length === 0) return <div className="flex flex-col items-center gap-4"><EmptyState label="assignmentsEmpty" hint="assignmentsEmptyHint" icon={KeyRound} /><Button size="sm" onClick={onGrant}><UserRound data-icon="inline-start" />{translate(language, 'grantSkill')}</Button></div>;
  const skillNames = new Map(skills.map(skill => [skill.id, skill.name]));
  const userNames = new Map(users.map(user => [user.id, user]));
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'skill')}</TableHead><TableHead>{translate(language, 'subject')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{assignments.map(assignment => <TableRow key={assignment.id}><TableCell className="font-normal">{skillNames.get(assignment.skillId) || assignment.skillId}</TableCell><TableCell><SubjectCell subjectType={assignment.subjectType} subjectId={assignment.subjectId} user={userNames.get(assignment.subjectId)} /></TableCell><TableCell className="text-right"><AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" disabled={pendingId !== null} />}>{translate(language, 'revoke')}</AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'revokeConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'revokeConfirmDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pendingId !== null}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive-hover" disabled={pendingId !== null} onClick={() => void run(assignment.id, async () => { await client.deleteSkillAssignment(assignment.id); })}>{translate(language, 'confirmRevoke')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></TableCell></TableRow>)}</TableBody></Table></div>;
}

export function SubjectCell({ subjectType, subjectId, user }: { readonly subjectType: string; readonly subjectId: string; readonly user: PlatformUser | undefined }) {
  if (subjectType === 'user' && user) {
    return <div className="min-w-0"><div className="truncate font-normal">{user.displayName}</div><div className="truncate text-xs text-muted-foreground">{user.username}</div></div>;
  }
  return <span className="text-muted-foreground">{subjectType}: {subjectId}</span>;
}

function SkillGrantDialog({ client, open, users, skills, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly users: readonly PlatformUser[];
  readonly skills: readonly AdminSkill[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [skillId, setSkillId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const reset = useCallback(() => { setSkillId(null); setSelected(new Set()); setFailed(false); }, []);
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);
  const toggleUser = useCallback((userId: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);
  const submit = async () => {
    if (!skillId || selected.size === 0) return;
    setPending(true);
    setFailed(false);
    try {
      await Promise.all([...selected].map(userId => client.createSkillAssignment({ skillId, subject: { type: AdminSubjectType.User, id: userId } })));
      onOpenChange(false);
      await onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!pending) onOpenChange(nextOpen); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(language, 'grantSkillTitle')}</DialogTitle>
          <DialogDescription>{translate(language, 'grantSkillDescription')}</DialogDescription>
        </DialogHeader>
        {failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, 'grantFailed')}</AlertDescription></Alert> : null}
        <div className="flex flex-col gap-3">
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel>{translate(language, 'selectSkill')}</FieldLabel>
              <div role="group" aria-label={translate(language, 'selectSkill')} className="flex flex-col gap-1">
                {skills.length === 0 ? <p className="text-sm text-muted-foreground">{translate(language, 'skillsEmpty')}</p> : skills.map(skill => (
                  <Button key={skill.id} type="button" variant="ghost" size="sm" aria-pressed={skillId === skill.id} className="justify-between"
                    onClick={() => setSkillId(current => (current === skill.id ? null : skill.id))}
                  >
                    <span className="flex min-w-0 items-center gap-2"><Boxes className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{skill.name}</span></span>
                    {skill.enabled ? null : <Badge variant="outline">{translate(language, 'disabled')}</Badge>}
                  </Button>
                ))}
              </div>
            </Field>
            <Field>
              <UserMultiPicker users={users} selected={selected} onToggle={toggleUser} disabled={pending} />
            </Field>
          </FieldGroup>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button>
          <Button type="button" disabled={pending || !skillId || selected.size === 0} onClick={() => void submit()}>{pending ? <Spinner data-icon="inline-start" /> : null}{translate(language, pending ? 'granting' : 'grant')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ label, hint, icon: Icon }: { readonly label: AdminTranslationKey; readonly hint: AdminTranslationKey; readonly icon: LucideIcon }) {
  return <Empty><EmptyHeader><EmptyMedia><Icon aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, label)}</EmptyTitle><EmptyDescription>{translate(language, hint)}</EmptyDescription></EmptyHeader></Empty>;
}

function ResourceListSkeleton({ rows = 6 }: { readonly rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card" aria-label={translate(language, 'loadingResources')} role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div className="flex items-center gap-3 border-b p-4 last:border-b-0" key={index}>
          <Skeleton className="size-8 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 flex flex-col gap-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/2" /></div>
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

function resourceTitle(tab: AdminResourceTab): AdminTranslationKey {
  if (tab === AdminResourceTab.Users) return 'users';
  if (tab === AdminResourceTab.Agents) return 'agents';
  if (tab === AdminResourceTab.Skills) return 'skills';
  return 'assignments';
}
