import { Bot, Boxes, CircleAlert, KeyRound, RefreshCw, UserRound, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { PlatformUser } from '@aep/sdk-node';
import {
  AdminConsoleClient,
  type AdminResources,
  type AdminSkill,
  type AdminSkillAssignment,
} from './client.js';
import { formatTimestamp } from './format.js';
import { translate, type AdminLanguage, type AdminTranslationKey } from './i18n.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/components/ui/empty.js';
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
          <Button variant="ghost" size="icon" aria-label={translate(language, 'refresh')} title={translate(language, 'refresh')} disabled={loading} onClick={() => void load()}>
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
        {error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, error)}</AlertDescription></Alert> : null}
        {loading && !resources ? <ResourceListSkeleton /> : resources ? <ResourceTable tab={tab} resources={resources} onChanged={load} client={client} onError={reportError} /> : null}
      </div>
    </section>
  );
}

function ResourceTable({ tab, resources, client, onChanged, onError }: {
  readonly tab: AdminResourceTab;
  readonly resources: AdminResources;
  readonly client: AdminConsoleClient;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  if (tab === AdminResourceTab.Users) return <UsersTable users={resources.users} client={client} onChanged={onChanged} onError={onError} />;
  if (tab === AdminResourceTab.Agents) return <AgentsTable agents={resources.agents} />;
  if (tab === AdminResourceTab.Skills) return <SkillsTable skills={resources.skills} client={client} onChanged={onChanged} onError={onError} />;
  return <AssignmentsTable assignments={resources.assignments} skills={resources.skills} client={client} onChanged={onChanged} onError={onError} />;
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
  return <div className="overflow-hidden rounded-lg border bg-background"><Table><TableHeader><TableRow><TableHead>{translate(language, 'user')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{users.map(user => <TableRow key={user.id}><TableCell><div className="flex min-w-0 items-center gap-3"><UserRound className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-medium">{user.displayName}</div><div className="truncate text-xs text-muted-foreground">{user.username}</div></div></div></TableCell><TableCell><Badge variant={user.status === 'active' ? 'secondary' : 'outline'}>{translate(language, user.status === 'active' ? 'active' : 'disabled')}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(user.id, async () => { await client.updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }); })}>{translate(language, user.status === 'active' ? 'disable' : 'enable')}</Button></TableCell></TableRow>)}</TableBody></Table></div>;
}

function AgentsTable({ agents }: { readonly agents: AdminResources['agents'] }) {
  if (agents.length === 0) return <EmptyState label="agentsEmpty" hint="agentsEmptyHint" icon={Bot} />;
  return <div className="overflow-hidden rounded-lg border bg-background"><Table><TableHeader><TableRow><TableHead>{translate(language, 'agent')}</TableHead><TableHead className="text-right">{translate(language, 'lastSeen')}</TableHead></TableRow></TableHeader><TableBody>{agents.map(agent => <TableRow key={agent.agentId}><TableCell><div className="flex min-w-0 items-center gap-3"><Bot className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-medium">{agent.agentId}</div><div className="text-xs text-muted-foreground">{agent.platform} · {agent.agentVersion}</div></div></div></TableCell><TableCell className="text-right text-xs text-muted-foreground">{formatTimestamp(agent.lastSeenAt)}</TableCell></TableRow>)}</TableBody></Table></div>;
}

function SkillsTable({ skills, client, onChanged, onError }: { readonly skills: readonly AdminSkill[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (skills.length === 0) return <EmptyState label="skillsEmpty" hint="skillsEmptyHint" icon={Boxes} />;
  return <div className="overflow-hidden rounded-lg border bg-background"><Table><TableHeader><TableRow><TableHead>{translate(language, 'skill')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{skills.map(skill => <TableRow key={skill.id}><TableCell><div className="flex min-w-0 items-center gap-3"><Boxes className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-medium">{skill.name}</div><div className="truncate text-xs text-muted-foreground">{skill.description || skill.id}</div></div></div></TableCell><TableCell><Badge variant={skill.enabled ? 'secondary' : 'outline'}>{translate(language, skill.enabled ? 'enabled' : 'disabled')}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(skill.id, async () => { await client.updateSkill(skill.id, { enabled: !skill.enabled }); })}>{translate(language, skill.enabled ? 'disable' : 'enable')}</Button></TableCell></TableRow>)}</TableBody></Table></div>;
}

function AssignmentsTable({ assignments, skills, client, onChanged, onError }: { readonly assignments: readonly AdminSkillAssignment[]; readonly skills: readonly AdminSkill[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (assignments.length === 0) return <EmptyState label="assignmentsEmpty" hint="assignmentsEmptyHint" icon={KeyRound} />;
  const names = new Map(skills.map(skill => [skill.id, skill.name]));
  return <div className="overflow-hidden rounded-lg border bg-background"><Table><TableHeader><TableRow><TableHead>{translate(language, 'skill')}</TableHead><TableHead>{translate(language, 'subject')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{assignments.map(assignment => <TableRow key={assignment.id}><TableCell className="font-medium">{names.get(assignment.skillId) || assignment.skillId}</TableCell><TableCell className="text-muted-foreground">{assignment.subjectType}: {assignment.subjectId}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pendingId !== null} onClick={() => void run(assignment.id, async () => { await client.deleteSkillAssignment(assignment.id); })}>{translate(language, 'revoke')}</Button></TableCell></TableRow>)}</TableBody></Table></div>;
}

function EmptyState({ label, hint, icon: Icon }: { readonly label: AdminTranslationKey; readonly hint: AdminTranslationKey; readonly icon: LucideIcon }) {
  return <Empty><EmptyHeader><EmptyMedia><Icon aria-hidden="true" /></EmptyMedia><EmptyTitle>{translate(language, label)}</EmptyTitle><EmptyDescription>{translate(language, hint)}</EmptyDescription></EmptyHeader></Empty>;
}

function ResourceListSkeleton({ rows = 6 }: { readonly rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background" aria-label={translate(language, 'loadingResources')} role="status">
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
