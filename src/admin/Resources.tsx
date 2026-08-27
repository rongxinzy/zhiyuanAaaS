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
import { Skeleton } from '../ui/components/ui/skeleton.js';
import { Spinner } from '../ui/components/ui/spinner.js';

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs text-muted-foreground">{translate(language, 'workspaceLabel')}</p><h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, resourceTitle(tab))}</h2></div>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            {translate(language, loading ? 'refreshing' : 'refresh')}
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
  return (
    <div className="overflow-hidden rounded-lg border bg-background" role="table">
      {users.map(user => (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0" role="row" key={user.id}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50"><UserRound className="size-4 text-muted-foreground" aria-hidden="true" /></div>
            <div className="min-w-0"><div className="truncate text-sm font-medium">{user.displayName}</div><div className="truncate text-xs text-muted-foreground">{user.username}</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={user.status === 'active' ? 'secondary' : 'outline'}>{translate(language, user.status === 'active' ? 'active' : 'disabled')}</Badge>
            <Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(user.id, async () => { await client.updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }); })}>{translate(language, user.status === 'active' ? 'disable' : 'enable')}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentsTable({ agents }: { readonly agents: AdminResources['agents'] }) {
  if (agents.length === 0) return <EmptyState label="agentsEmpty" hint="agentsEmptyHint" icon={Bot} />;
  return (
    <div className="overflow-hidden rounded-lg border bg-background" role="table">
      {agents.map(agent => (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0" role="row" key={agent.agentId}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50"><Bot className="size-4 text-muted-foreground" aria-hidden="true" /></div>
            <div className="min-w-0"><div className="truncate text-sm font-medium">{agent.agentId}</div><div className="text-xs text-muted-foreground">{agent.platform} · {agent.agentVersion}</div></div>
          </div>
          <div className="text-right text-xs text-muted-foreground"><div>{translate(language, 'lastSeen')}</div><div>{formatTimestamp(agent.lastSeenAt)}</div></div>
        </div>
      ))}
    </div>
  );
}

function SkillsTable({ skills, client, onChanged, onError }: { readonly skills: readonly AdminSkill[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (skills.length === 0) return <EmptyState label="skillsEmpty" hint="skillsEmptyHint" icon={Boxes} />;
  return (
    <div className="overflow-hidden rounded-lg border bg-background" role="table">
      {skills.map(skill => (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0" role="row" key={skill.id}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50"><Boxes className="size-4 text-muted-foreground" aria-hidden="true" /></div>
            <div className="min-w-0"><div className="truncate text-sm font-medium">{skill.name}</div><div className="truncate text-xs text-muted-foreground">{skill.description || skill.id}</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={skill.enabled ? 'secondary' : 'outline'}>{translate(language, skill.enabled ? 'enabled' : 'disabled')}</Badge>
            <Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(skill.id, async () => { await client.updateSkill(skill.id, { enabled: !skill.enabled }); })}>{translate(language, skill.enabled ? 'disable' : 'enable')}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AssignmentsTable({ assignments, skills, client, onChanged, onError }: { readonly assignments: readonly AdminSkillAssignment[]; readonly skills: readonly AdminSkill[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (assignments.length === 0) return <EmptyState label="assignmentsEmpty" hint="assignmentsEmptyHint" icon={KeyRound} />;
  const names = new Map(skills.map(skill => [skill.id, skill.name]));
  return (
    <div className="overflow-hidden rounded-lg border bg-background" role="table">
      {assignments.map(assignment => (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0" role="row" key={assignment.id}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50"><KeyRound className="size-4 text-muted-foreground" aria-hidden="true" /></div>
            <div className="min-w-0"><div className="truncate text-sm font-medium">{names.get(assignment.skillId) || assignment.skillId}</div><div className="truncate text-xs text-muted-foreground">{assignment.subjectType}: {assignment.subjectId}</div></div>
          </div>
          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pendingId !== null} onClick={() => void run(assignment.id, async () => { await client.deleteSkillAssignment(assignment.id); })}>{translate(language, 'revoke')}</Button>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label, hint, icon: Icon }: { readonly label: AdminTranslationKey; readonly hint: AdminTranslationKey; readonly icon: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-background p-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border bg-muted/40"><Icon className="size-4 text-muted-foreground" aria-hidden="true" /></div>
      <div><p className="text-sm font-medium">{translate(language, label)}</p><p className="mt-1 text-xs text-muted-foreground">{translate(language, hint)}</p></div>
    </div>
  );
}

function ResourceListSkeleton({ rows = 6 }: { readonly rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background" aria-label={translate(language, 'loadingResources')} role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div className="flex items-center gap-3 border-b p-4 last:border-b-0" key={index}>
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/2" /></div>
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
