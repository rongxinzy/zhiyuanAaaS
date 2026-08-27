import { Bot, Boxes, CircleAlert, KeyRound, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { PlatformUser } from '@aep/sdk-node';
import {
  AdminConsoleClient,
  type AdminResources,
  type AdminSkill,
  type AdminSkillAssignment,
} from './client.js';
import { translate, type AdminTranslationKey } from './i18n.js';
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { Spinner } from '../ui/components/ui/spinner.js';

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

  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm text-muted-foreground">{translate('zh', 'resources')}</p><h2 className="mt-1 text-xl font-semibold leading-snug">{translate('zh', resourceTitle(tab))}</h2></div>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            {translate('zh', loading ? 'refreshing' : 'refresh')}
          </Button>
        </div>
        {error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate('zh', error)}</AlertDescription></Alert> : null}
        {loading && !resources ? <div className="flex items-center gap-2 rounded-lg border bg-background p-6 text-sm text-muted-foreground"><Spinner />{translate('zh', 'loadingResources')}</div> : null}
        {resources ? <ResourceTable tab={tab} resources={resources} onChanged={load} client={client} /> : null}
      </div>
    </section>
  );
}

function ResourceTable({ tab, resources, client, onChanged }: { readonly tab: AdminResourceTab; readonly resources: AdminResources; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void> }) {
  if (tab === AdminResourceTab.Users) return <UsersTable users={resources.users} client={client} onChanged={onChanged} />;
  if (tab === AdminResourceTab.Agents) return <AgentsTable agents={resources.agents} />;
  if (tab === AdminResourceTab.Skills) return <SkillsTable skills={resources.skills} client={client} onChanged={onChanged} />;
  return <AssignmentsTable assignments={resources.assignments} skills={resources.skills} client={client} onChanged={onChanged} />;
}

function UsersTable({ users, client, onChanged }: { readonly users: readonly PlatformUser[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void> }) {
  if (users.length === 0) return <EmptyState label="usersEmpty" />;
  return <div className="overflow-hidden rounded-lg border bg-background" role="table">{users.map(user => <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0" role="row" key={user.id}><div className="flex min-w-0 items-center gap-3"><UserRound className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate text-sm font-medium">{user.displayName}</div><div className="truncate text-xs text-muted-foreground">{user.username}</div></div></div><div className="flex items-center gap-2"><Badge variant={user.status === 'active' ? 'default' : 'outline'}>{translate('zh', user.status === 'active' ? 'active' : 'disabled')}</Badge><Button size="sm" variant="outline" onClick={async () => { await client.updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }); await onChanged(); }}>{translate('zh', user.status === 'active' ? 'disable' : 'enable')}</Button></div></div>)}</div>;
}

function AgentsTable({ agents }: { readonly agents: AdminResources['agents'] }) {
  if (agents.length === 0) return <EmptyState label="agentsEmpty" />;
  return <div className="overflow-hidden rounded-lg border bg-background" role="table">{agents.map(agent => <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0" role="row" key={agent.agentId}><div className="flex min-w-0 items-center gap-3"><Bot className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate text-sm font-medium">{agent.agentId}</div><div className="text-xs text-muted-foreground">{agent.platform} · {agent.agentVersion}</div></div></div><div className="text-right text-xs text-muted-foreground"><div>{translate('zh', 'lastSeen')}</div><div>{formatDate(agent.lastSeenAt)}</div></div></div>)}</div>;
}

function SkillsTable({ skills, client, onChanged }: { readonly skills: readonly AdminSkill[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void> }) {
  if (skills.length === 0) return <EmptyState label="skillsEmpty" />;
  return <div className="overflow-hidden rounded-lg border bg-background" role="table">{skills.map(skill => <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0" role="row" key={skill.id}><div className="flex min-w-0 items-center gap-3"><Boxes className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate text-sm font-medium">{skill.name}</div><div className="truncate text-xs text-muted-foreground">{skill.description || skill.id}</div></div></div><div className="flex items-center gap-2"><Badge variant={skill.enabled ? 'default' : 'outline'}>{translate('zh', skill.enabled ? 'enabled' : 'disabled')}</Badge><Button size="sm" variant="outline" onClick={async () => { await client.updateSkill(skill.id, { enabled: !skill.enabled }); await onChanged(); }}>{translate('zh', skill.enabled ? 'disable' : 'enable')}</Button></div></div>)}</div>;
}

function AssignmentsTable({ assignments, skills, client, onChanged }: { readonly assignments: readonly AdminSkillAssignment[]; readonly skills: readonly AdminSkill[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void> }) {
  if (assignments.length === 0) return <EmptyState label="assignmentsEmpty" />;
  const names = new Map(skills.map(skill => [skill.id, skill.name]));
  return <div className="overflow-hidden rounded-lg border bg-background" role="table">{assignments.map(assignment => <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0" role="row" key={assignment.id}><div className="flex min-w-0 items-center gap-3"><KeyRound className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate text-sm font-medium">{names.get(assignment.skillId) || assignment.skillId}</div><div className="truncate text-xs text-muted-foreground">{assignment.subjectType}: {assignment.subjectId}</div></div></div><Button size="sm" variant="destructive" onClick={async () => { await client.deleteSkillAssignment(assignment.id); await onChanged(); }}>{translate('zh', 'revoke')}</Button></div>)}</div>;
}

function EmptyState({ label }: { readonly label: AdminTranslationKey }) {
  return <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center"><ShieldCheck className="size-8 text-muted-foreground" aria-hidden="true" /><span className="text-sm text-muted-foreground">{translate('zh', label)}</span></div>;
}

function resourceTitle(tab: AdminResourceTab): AdminTranslationKey {
  if (tab === AdminResourceTab.Users) return 'users';
  if (tab === AdminResourceTab.Agents) return 'agents';
  if (tab === AdminResourceTab.Skills) return 'skills';
  return 'assignments';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
