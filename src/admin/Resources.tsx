import { Boxes, Check, CircleAlert, KeyRound, Pencil, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2, Upload, UserRound, Users, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { JsonObject, Permission, PlatformUser, Role, Team } from '@aep/sdk-node';
import {
  AdminConsoleClient,
  AdminSubjectType,
  type AdminResources,
  type AdminSkill,
  type AdminSkillVersion,
  type AdminSkillAssignment,
} from './client.js';
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
import { Alert, AlertDescription } from '../ui/components/ui/alert.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/components/ui/dialog.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/components/ui/empty.js';
import { Field, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Skeleton } from '../ui/components/ui/skeleton.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/components/ui/table.js';
import { Input } from '../ui/components/ui/input.js';
import { cn } from '../ui/lib/utils.js';

const language: AdminLanguage = 'zh';
type AdminUser = PlatformUser & { readonly email?: string | null };

export const AdminResourceTab = {
  Users: 'users',
  Teams: 'teams',
  Roles: 'roles',
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
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ readonly created: number; readonly rejected: number } | null>(null);
  const [editor, setEditor] = useState<{ readonly kind: 'user' | 'team' | 'role' | 'skill'; readonly id?: string } | null>(null);
  const [versionSkill, setVersionSkill] = useState<AdminSkill | null>(null);
  const [resetUser, setResetUser] = useState<PlatformUser | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await client.resources();
      setResources(next);
      setVersionSkill(current => current ? next.skills.find(item => item.id === current.id) ?? current : null);
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
          <div><p className="text-xs text-tertiary-foreground">{translate(language, 'workspaceLabel')}</p><h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, resourceTitle(tab))}</h2></div>
          <div className="flex shrink-0 items-center gap-1.5">
            {tab === AdminResourceTab.Users ? <Button size="sm" onClick={() => setEditor({ kind: 'user' })}><Plus data-icon="inline-start" />{translate(language, 'addUser')}</Button> : null}
            {tab === AdminResourceTab.Users ? <Button size="sm" variant="outline" onClick={() => { setImportResult(null); setImporting(true); }}><Upload data-icon="inline-start" />{translate(language, 'importUsers')}</Button> : null}
            {tab === AdminResourceTab.Teams ? <Button size="sm" onClick={() => setEditor({ kind: 'team' })}><Plus data-icon="inline-start" />{translate(language, 'addTeam')}</Button> : null}
            {tab === AdminResourceTab.Roles ? <Button size="sm" onClick={() => setEditor({ kind: 'role' })}><Plus data-icon="inline-start" />{translate(language, 'addRole')}</Button> : null}
            {tab === AdminResourceTab.Skills ? <Button size="sm" onClick={() => setEditor({ kind: 'skill' })}><Plus data-icon="inline-start" />{translate(language, 'addSkill')}</Button> : null}
            {tab === AdminResourceTab.Assignments && resources ? <Button size="sm" onClick={() => setGranting(true)}><UserRound data-icon="inline-start" />{translate(language, 'grantSkill')}</Button> : null}
            <Button variant="ghost" size="icon" aria-label={translate(language, 'refresh')} title={translate(language, 'refresh')} disabled={loading} onClick={() => void load()}>
              {loading ? <Spinner /> : <RefreshCw />}
            </Button>
          </div>
        </div>
        {error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, error)}</AlertDescription></Alert> : null}
        {loading && !resources ? <ResourceListSkeleton /> : resources ? <>
          <ResourceTable tab={tab} resources={resources} onChanged={load} client={client} onError={reportError} onGrant={() => setGranting(true)} onEdit={kind => setEditor(kind)} onResetUser={setResetUser} onVersion={setVersionSkill} />
          {importResult ? <Alert><Check aria-hidden="true" /><AlertDescription>{translate(language, 'usersImported')}: {importResult.created} / {translate(language, 'usersRejected')}: {importResult.rejected}</AlertDescription></Alert> : null}
          {tab === AdminResourceTab.Assignments ? <SkillGrantDialog client={client} open={granting} users={resources.users} roles={resources.roles} teams={resources.teams} skills={resources.skills} onOpenChange={setGranting} onChanged={load} onError={reportError} /> : null}
          {tab === AdminResourceTab.Users ? <UserImportDialog client={client} open={importing} onOpenChange={setImporting} onChanged={async result => { setImportResult(result); await load(); }} onError={reportError} /> : null}
          {editor?.kind === 'user' ? <UserEditorDialog client={client} user={editor.id ? resources.users.find(item => item.id === editor.id) : undefined} roles={resources.roles} teams={resources.teams} open onOpenChange={open => { if (!open) setEditor(null); }} onChanged={load} onError={reportError} /> : null}
          {editor?.kind === 'team' ? <TeamEditorDialog client={client} team={editor.id ? resources.teams.find(item => item.id === editor.id) : undefined} open onOpenChange={open => { if (!open) setEditor(null); }} onChanged={load} onError={reportError} /> : null}
          {editor?.kind === 'role' ? <RoleEditorDialog client={client} role={editor.id ? resources.roles.find(item => item.id === editor.id) : undefined} permissions={resources.permissions} open onOpenChange={open => { if (!open) setEditor(null); }} onChanged={load} onError={reportError} /> : null}
          {editor?.kind === 'skill' ? <SkillEditorDialog client={client} skill={editor.id ? resources.skills.find(item => item.id === editor.id) : undefined} open onOpenChange={open => { if (!open) setEditor(null); }} onChanged={load} onError={reportError} /> : null}
          {resetUser ? <PasswordResetDialog client={client} user={resetUser} open onOpenChange={open => { if (!open) setResetUser(null); }} onChanged={load} onError={reportError} /> : null}
          {versionSkill ? <SkillVersionDialog client={client} skill={versionSkill} open onOpenChange={open => { if (!open) setVersionSkill(null); }} onChanged={load} onError={reportError} /> : null}
        </> : null}
      </div>
    </section>
  );
}

function ResourceTable({ tab, resources, client, onChanged, onError, onGrant, onEdit, onResetUser, onVersion }: {
  readonly tab: AdminResourceTab;
  readonly resources: AdminResources;
  readonly client: AdminConsoleClient;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onGrant: () => void;
  readonly onEdit: (editor: { readonly kind: 'user' | 'team' | 'role' | 'skill'; readonly id?: string }) => void;
  readonly onResetUser: (user: PlatformUser) => void;
  readonly onVersion: (skill: AdminSkill) => void;
}) {
  if (tab === AdminResourceTab.Users) return <UsersTable users={resources.users} client={client} onChanged={onChanged} onError={onError} onEdit={onEdit} onResetUser={onResetUser} />;
  if (tab === AdminResourceTab.Teams) return <TeamsTable teams={resources.teams} client={client} onChanged={onChanged} onError={onError} onEdit={onEdit} />;
  if (tab === AdminResourceTab.Roles) return <RolesTable roles={resources.roles} client={client} onChanged={onChanged} onError={onError} onEdit={onEdit} />;
  if (tab === AdminResourceTab.Skills) return <SkillsTable skills={resources.skills} client={client} onChanged={onChanged} onError={onError} onEdit={onEdit} onVersion={onVersion} />;
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

function UsersTable({ users, client, onChanged, onError, onEdit, onResetUser }: { readonly users: readonly PlatformUser[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void; readonly onEdit: (editor: { readonly kind: 'user'; readonly id: string }) => void; readonly onResetUser: (user: PlatformUser) => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (users.length === 0) return <EmptyState label="usersEmpty" hint="usersEmptyHint" icon={UserRound} />;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'user')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{users.map(user => <TableRow key={user.id}><TableCell><div className="flex min-w-0 items-center gap-3"><UserRound className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-normal">{user.displayName}</div><div className="truncate text-xs text-tertiary-foreground">{user.username}</div></div></div></TableCell><TableCell><Badge variant={user.status === 'active' ? 'success' : 'outline'}>{translate(language, user.status === 'active' ? 'active' : 'disabled')}</Badge></TableCell><TableCell><div className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" disabled={pendingId !== null} onClick={() => onEdit({ kind: 'user', id: user.id })}><Pencil data-icon="inline-start" />{translate(language, 'edit')}</Button><Button size="sm" variant="ghost" disabled={pendingId !== null} onClick={() => onResetUser(user)}><RotateCcw data-icon="inline-start" />{translate(language, 'resetPassword')}</Button><Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(user.id, async () => { await client.updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }); })}>{translate(language, user.status === 'active' ? 'disable' : 'enable')}</Button></div></TableCell></TableRow>)}</TableBody></Table></div>;
}

function TeamsTable({ teams, client, onChanged, onError, onEdit }: { readonly teams: AdminResources['teams']; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void; readonly onEdit: (editor: { readonly kind: 'team'; readonly id: string }) => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (teams.length === 0) return <EmptyState label="teamsEmpty" hint="teamsEmptyHint" icon={Users} />;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'team')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead>{translate(language, 'members')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{teams.map(team => <TableRow key={team.id}><TableCell><div className="flex min-w-0 items-center gap-3"><Users className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-normal">{team.name}</div><div className="truncate text-xs text-tertiary-foreground">{team.id}</div></div></div></TableCell><TableCell><Badge variant={team.enabled ? 'success' : 'outline'}>{translate(language, team.enabled ? 'enabled' : 'disabled')}</Badge></TableCell><TableCell className="text-xs text-tertiary-foreground">{team.memberCount}</TableCell><TableCell><div className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" disabled={pendingId !== null} onClick={() => onEdit({ kind: 'team', id: team.id })}><Pencil data-icon="inline-start" />{translate(language, 'edit')}</Button><Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(team.id, async () => { await client.updateTeam(team.id, { enabled: !team.enabled }); })}>{translate(language, team.enabled ? 'disable' : 'enable')}</Button><AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" disabled={pendingId !== null || team.builtIn} />}><Trash2 data-icon="inline-start" />{translate(language, 'delete')}</AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'deleteTeamTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'deleteResourceDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pendingId !== null}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive-hover" disabled={pendingId !== null} onClick={() => void run(team.id, async () => { await client.deleteTeam(team.id); })}>{translate(language, 'delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell></TableRow>)}</TableBody></Table></div>;
}

function RolesTable({ roles, client, onChanged, onError, onEdit }: { readonly roles: readonly Role[]; readonly client: AdminConsoleClient; readonly onChanged: () => Promise<void>; readonly onError: () => void; readonly onEdit: (editor: { readonly kind: 'role'; readonly id: string }) => void }) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (roles.length === 0) return <EmptyState label="rolesEmpty" hint="rolesEmptyHint" icon={ShieldCheck} />;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'role')}</TableHead><TableHead>{translate(language, 'permissions')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{roles.map(role => <TableRow key={role.id}><TableCell><div className="flex min-w-0 items-center gap-3"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-normal">{role.name}</div><div className="truncate text-xs text-tertiary-foreground">{role.id}</div></div>{role.builtIn ? <Badge variant="info">{translate(language, 'builtIn')}</Badge> : null}</div></TableCell><TableCell className="text-xs text-tertiary-foreground">{role.permissions.length}</TableCell><TableCell><Badge variant={role.enabled ? 'success' : 'outline'}>{translate(language, role.enabled ? 'enabled' : 'disabled')}</Badge></TableCell><TableCell><div className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" disabled={pendingId !== null} onClick={() => onEdit({ kind: 'role', id: role.id })}><Pencil data-icon="inline-start" />{translate(language, 'edit')}</Button><Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(role.id, async () => { await client.updateRole(role.id, { enabled: !role.enabled }); })}>{translate(language, role.enabled ? 'disable' : 'enable')}</Button><AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" disabled={pendingId !== null || role.builtIn} />}><Trash2 data-icon="inline-start" />{translate(language, 'delete')}</AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'deleteRoleTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'deleteResourceDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pendingId !== null}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive-hover" disabled={pendingId !== null} onClick={() => void run(role.id, async () => { await client.deleteRole(role.id); })}>{translate(language, 'delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell></TableRow>)}</TableBody></Table></div>;
}

function SkillsTable({ skills, client, onChanged, onError, onEdit, onVersion }: {
  readonly skills: readonly AdminSkill[];
  readonly client: AdminConsoleClient;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onEdit: (editor: { readonly kind: 'skill'; readonly id: string }) => void;
  readonly onVersion: (skill: AdminSkill) => void;
}) {
  const { pendingId, run } = useRowMutation(onChanged, onError);
  if (skills.length === 0) return <EmptyState label="skillsEmpty" hint="skillsEmptyHint" icon={Boxes} />;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>{translate(language, 'skill')}</TableHead><TableHead>{translate(language, 'versions')}</TableHead><TableHead>{translate(language, 'status')}</TableHead><TableHead className="text-right">{translate(language, 'actions')}</TableHead></TableRow></TableHeader><TableBody>{skills.map(skill => <TableRow key={skill.id}><TableCell><div className="flex min-w-0 items-center gap-3"><Boxes className="size-4 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><div className="truncate font-normal">{skill.name}</div><div className="truncate text-xs text-tertiary-foreground">{skill.description || skill.id}</div></div></div></TableCell><TableCell><div className="flex min-w-0 flex-col gap-1">{skill.versions.length === 0 ? <span className="text-xs text-muted-foreground">{translate(language, 'noVersions')}</span> : skill.versions.slice(0, 3).map(version => <SkillVersionRow key={version.version} skillId={skill.id} version={version} disabled={pendingId !== null} onWithdraw={() => void run(`${skill.id}:${version.version}`, async () => { await client.deleteSkillVersion(skill.id, version.version); })} />)}{skill.versions.length > 3 ? <span className="text-xs text-tertiary-foreground">+{skill.versions.length - 3}</span> : null}</div></TableCell><TableCell><Badge variant={skill.enabled ? 'success' : 'outline'}>{translate(language, skill.enabled ? 'enabled' : 'disabled')}</Badge></TableCell><TableCell><div className="flex flex-wrap justify-end gap-1.5"><Button size="sm" variant="ghost" disabled={pendingId !== null} onClick={() => onEdit({ kind: 'skill', id: skill.id })}><Pencil data-icon="inline-start" />{translate(language, 'edit')}</Button><Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => onVersion(skill)}><Upload data-icon="inline-start" />{translate(language, 'uploadVersion')}</Button><Button size="sm" variant="outline" disabled={pendingId !== null} onClick={() => void run(skill.id, async () => { await client.updateSkill(skill.id, { enabled: !skill.enabled }); })}>{translate(language, skill.enabled ? 'disable' : 'enable')}</Button><AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" disabled={pendingId !== null} />}><Trash2 data-icon="inline-start" />{translate(language, 'delete')}</AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'deleteSkillTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'skillDeleteDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pendingId !== null}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive-hover" disabled={pendingId !== null} onClick={() => void run(skill.id, async () => { await client.deleteSkill(skill.id); })}>{translate(language, 'delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell></TableRow>)}</TableBody></Table></div>;
}

function SkillVersionRow({ skillId, version, disabled, onWithdraw }: {
  readonly skillId: string;
  readonly version: AdminSkillVersion;
  readonly disabled: boolean;
  readonly onWithdraw: () => void;
}) {
  return <span className="flex items-center gap-1.5 text-xs"><span className="truncate text-tertiary-foreground">{version.version}</span><Badge variant={version.state === 'published' ? 'success' : 'outline'}>{translate(language, versionStateLabel(version.state))}</Badge><AlertDialog><AlertDialogTrigger render={<Button size="icon-xs" variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" aria-label={translate(language, 'withdrawVersion')} title={translate(language, 'withdrawVersion')} disabled={disabled} />}><Trash2 /></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{translate(language, 'withdrawVersionTitle')}</AlertDialogTitle><AlertDialogDescription>{translate(language, 'withdrawVersionDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={disabled}>{translate(language, 'cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive-hover" disabled={disabled} onClick={onWithdraw}>{translate(language, 'confirmWithdrawVersion')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></span>;
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
    return <div className="min-w-0"><div className="truncate font-normal">{user.displayName}</div><div className="truncate text-xs text-tertiary-foreground">{user.username}</div></div>;
  }
  return <span className="text-tertiary-foreground">{subjectType}: {subjectId}</span>;
}

type SelectionOption = { readonly id: string; readonly label: string; readonly description?: string };

function SelectionList({ label, options, selected, onToggle, disabled }: {
  readonly label: string;
  readonly options: readonly SelectionOption[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly disabled: boolean;
}) {
  return <Field><FieldLabel>{label}</FieldLabel><div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-1" role="group" aria-label={label}>{options.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">{translate(language, 'noOptions')}</p> : options.map(option => <Button key={option.id} type="button" variant="ghost" size="sm" role="checkbox" aria-checked={selected.has(option.id)} disabled={disabled} className="justify-between" onClick={() => onToggle(option.id)}><span className="min-w-0 text-left"><span className="block truncate">{option.label}</span>{option.description ? <span className="block truncate text-xs text-tertiary-foreground">{option.description}</span> : null}</span><span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors', selected.has(option.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{selected.has(option.id) ? <CheckMark /> : null}</span></Button>)}</div></Field>;
}

function CheckMark() {
  return <Check className="size-3" aria-hidden="true" />;
}

function SkillEditorDialog({ client, skill, open, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly skill: AdminSkill | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(skill);
  const [id, setId] = useState(skill?.id ?? '');
  const [name, setName] = useState(skill?.name ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [enabled, setEnabled] = useState(skill?.enabled !== false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setId(skill?.id ?? '');
    setName(skill?.name ?? '');
    setDescription(skill?.description ?? '');
    setEnabled(skill?.enabled !== false);
    setFailed(false);
  }, [skill]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id.trim() || !name.trim()) { setFailed(true); return; }
    setPending(true);
    setFailed(false);
    try {
      if (skill) await client.updateSkill(skill.id, { name: name.trim(), description: description.trim(), enabled });
      else await client.createSkill({ id: id.trim(), name: name.trim(), description: description.trim(), enabled });
      onOpenChange(false);
      await onChanged();
    } catch {
      setFailed(true);
      onError();
    } finally {
      setPending(false);
    }
  };
  return <Dialog open={open} onOpenChange={nextOpen => { if (!pending) onOpenChange(nextOpen); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{translate(language, editing ? 'skillEditTitle' : 'skillEditorTitle')}</DialogTitle><DialogDescription>{translate(language, 'skillEditorDescription')}</DialogDescription></DialogHeader><form onSubmit={submit} noValidate className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, 'skillFormFailed')}</AlertDescription></Alert> : null}<FieldGroup className="gap-4">{editing ? null : <Field><FieldLabel htmlFor="skill-id">{translate(language, 'skillId')}</FieldLabel><Input id="skill-id" value={id} onChange={event => setId(event.target.value)} disabled={pending} /></Field>}<Field><FieldLabel htmlFor="skill-name">{translate(language, 'skillName')}</FieldLabel><Input id="skill-name" value={name} onChange={event => setName(event.target.value)} disabled={pending} /></Field><Field><FieldLabel htmlFor="skill-description">{translate(language, 'description')}</FieldLabel><Input id="skill-description" value={description} onChange={event => setDescription(event.target.value)} placeholder={translate(language, 'descriptionPlaceholder')} disabled={pending} /></Field>{editing ? <Button type="button" variant="outline" role="checkbox" aria-checked={enabled} disabled={pending} onClick={() => setEnabled(value => !value)}>{translate(language, 'status')}: {translate(language, enabled ? 'enabled' : 'disabled')}</Button> : null}</FieldGroup><DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : null}{translate(language, pending ? 'saving' : 'save')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function SkillVersionDialog({ client, skill, open, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly skill: AdminSkill;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [version, setVersion] = useState('');
  const [archive, setArchive] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [failed, setFailed] = useState<AdminTranslationKey | null>(null);
  useEffect(() => {
    if (open) {
      setVersion('');
      setArchive(null);
      setFailed(null);
      setPendingVersion(null);
    }
  }, [open, skill.id]);
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!version.trim() || !archive) { setFailed('skillUploadFailed'); return; }
    setPending(true);
    setFailed(null);
    try {
      await client.uploadSkillVersion(skill.id, version.trim(), new Uint8Array(await archive.arrayBuffer()));
      setVersion('');
      setArchive(null);
      await onChanged();
    } catch {
      setFailed('skillUploadFailed');
      onError();
    } finally {
      setPending(false);
    }
  };
  const publish = async (candidate: string) => {
    setPendingVersion(candidate);
    setFailed(null);
    try {
      await client.publishSkillVersion(skill.id, candidate);
      await onChanged();
    } catch {
      setFailed('skillPublishFailed');
      onError();
    } finally {
      setPendingVersion(null);
    }
  };
  return <Dialog open={open} onOpenChange={nextOpen => { if (!pending && pendingVersion === null) onOpenChange(nextOpen); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{translate(language, 'uploadVersion')}: {skill.name}</DialogTitle><DialogDescription>{translate(language, 'skillEditorDescription')}</DialogDescription></DialogHeader><div className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, failed)}</AlertDescription></Alert> : null}<form onSubmit={upload} noValidate className="flex flex-col gap-4"><FieldGroup className="gap-4"><Field><FieldLabel htmlFor="skill-version">{translate(language, 'skillVersion')}</FieldLabel><Input id="skill-version" value={version} onChange={event => setVersion(event.target.value)} placeholder="1.0.0" disabled={pending || pendingVersion !== null} /></Field><Field><FieldLabel htmlFor="skill-package">{translate(language, 'skillPackage')}</FieldLabel><Input id="skill-package" type="file" accept=".zip,application/zip" onChange={event => setArchive(event.target.files?.[0] ?? null)} disabled={pending || pendingVersion !== null} /></Field></FieldGroup><Button type="submit" className="self-start" disabled={pending || pendingVersion !== null}>{pending ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}{translate(language, pending ? 'saving' : 'uploadVersion')}</Button></form><div className="flex flex-col gap-2"><p className="text-sm font-semibold">{translate(language, 'versions')}</p>{skill.versions.length === 0 ? <p className="text-sm text-muted-foreground">{translate(language, 'noVersions')}</p> : <div className="flex flex-col gap-2">{skill.versions.map(item => <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3" key={item.version}><div className="min-w-0"><p className="truncate text-sm font-normal">{item.version}</p><p className="truncate text-xs text-tertiary-foreground">{item.sha256} · {item.size} {translate(language, 'bytes')}</p></div><div className="flex shrink-0 items-center gap-2"><Badge variant={item.state === 'published' ? 'success' : 'outline'}>{translate(language, versionStateLabel(item.state))}</Badge>{item.state === 'draft' ? <Button type="button" size="sm" variant="outline" disabled={pending || pendingVersion !== null} onClick={() => void publish(item.version)}>{pendingVersion === item.version ? <Spinner data-icon="inline-start" /> : null}{translate(language, pendingVersion === item.version ? 'publishing' : 'publishVersion')}</Button> : null}</div></div>)}</div>}</div></div><DialogFooter><Button type="button" variant="ghost" disabled={pending || pendingVersion !== null} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button></DialogFooter></DialogContent></Dialog>;
}

type UserImportResult = { readonly created: number; readonly rejected: number };

function UserImportDialog({ client, open, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: (result: UserImportResult) => Promise<void>;
  readonly onError: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setPending(false);
      setFailed(false);
    }
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setFailed(true);
      return;
    }
    setPending(true);
    setFailed(false);
    try {
      const payload = normalizeUserImport(JSON.parse(await file.text()));
      const result = await client.importUsers(payload);
      const created = typeof result.created === 'number' ? result.created : 0;
      const rejected = typeof result.rejected === 'number' ? result.rejected : 0;
      onOpenChange(false);
      await onChanged({ created, rejected });
    } catch {
      setFailed(true);
      onError();
    } finally {
      setPending(false);
    }
  };

  return <Dialog open={open} onOpenChange={nextOpen => { if (!pending) onOpenChange(nextOpen); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{translate(language, 'importUsersTitle')}</DialogTitle>
        <DialogDescription>{translate(language, 'importUsersDescription')}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, 'importUsersFailed')}</AlertDescription></Alert> : null}
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="users-import-file">{translate(language, 'importUsersFile')}</FieldLabel>
            <Input id="users-import-file" type="file" accept="application/json,.json" onChange={event => setFile(event.target.files?.[0] ?? null)} disabled={pending} />
          </Field>
          <p className="text-xs text-tertiary-foreground">{translate(language, 'importUsersHint')}</p>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button>
          <Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}{translate(language, pending ? 'importingUsers' : 'importUsers')}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function normalizeUserImport(value: unknown): JsonObject {
  const users = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { readonly users?: unknown }).users) ? (value as { readonly users: unknown[] }).users : null;
  if (!users || users.length === 0 || users.length > 1000) throw new Error('Invalid user import row count.');
  for (const row of users) {
    if (!row || typeof row !== 'object') throw new Error('Invalid user import row.');
    const item = row as Record<string, unknown>;
    for (const key of ['externalRowId', 'username', 'displayName', 'temporaryPassword']) {
      if (typeof item[key] !== 'string' || item[key].trim() === '') throw new Error(`Missing ${key}.`);
    }
    if ((item.temporaryPassword as string).length < 12) throw new Error('Temporary password is too short.');
    for (const key of ['teamIds', 'roleIds']) {
      if (item[key] !== undefined && (!Array.isArray(item[key]) || item[key].some(entry => typeof entry !== 'string'))) throw new Error(`Invalid ${key}.`);
    }
    if (item.requirePasswordChange !== undefined && typeof item.requirePasswordChange !== 'boolean') throw new Error('Invalid requirePasswordChange.');
  }
  return { users } as JsonObject;
}

function UserEditorDialog({ client, user, roles, teams, open, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly user: AdminUser | undefined;
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(user);
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [enabled, setEnabled] = useState(user?.status !== 'disabled');
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [roleIds, setRoleIds] = useState<ReadonlySet<string>>(new Set(user?.roleIds ?? []));
  const [teamIds, setTeamIds] = useState<ReadonlySet<string>>(new Set(user?.teamIds ?? []));
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUsername(user?.username ?? ''); setDisplayName(user?.displayName ?? ''); setEmail(user?.email ?? ''); setTemporaryPassword(''); setEnabled(user?.status !== 'disabled'); setRequirePasswordChange(true); setRoleIds(new Set(user?.roleIds ?? [])); setTeamIds(new Set(user?.teamIds ?? [])); setFailed(false);
  }, [user]);
  const toggleIds = (current: ReadonlySet<string>, id: string): ReadonlySet<string> => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!displayName.trim() || (!editing && (!username.trim() || !temporaryPassword))) { setFailed(true); return; }
    setPending(true); setFailed(false);
    try {
      if (user) {
        await client.updateUser(user.id, { displayName: displayName.trim(), email: email.trim() || null, status: enabled ? 'active' : 'disabled' });
        await client.replaceUserRBAC(user.id, { roleIds: [...roleIds], teamIds: [...teamIds] });
      }
      else await client.createUser({ username: username.trim(), displayName: displayName.trim(), email: email.trim() || null, temporaryPassword, roleIds: [...roleIds], teamIds: [...teamIds], requirePasswordChange });
      onOpenChange(false); await onChanged();
    } catch { setFailed(true); onError(); } finally { setPending(false); }
  };
  return <Dialog open={open} onOpenChange={nextOpen => { if (!pending) onOpenChange(nextOpen); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{translate(language, editing ? 'userEditTitle' : 'userEditorTitle')}</DialogTitle><DialogDescription>{translate(language, editing ? 'userEditDescription' : 'userEditorDescription')}</DialogDescription></DialogHeader><form onSubmit={submit} noValidate className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, 'editorFailed')}</AlertDescription></Alert> : null}<FieldGroup className="gap-4">{editing ? null : <Field><FieldLabel htmlFor="user-username">{translate(language, 'username')}</FieldLabel><Input id="user-username" value={username} onChange={event => setUsername(event.target.value)} disabled={pending} /></Field>}<Field><FieldLabel htmlFor="user-display-name">{translate(language, 'displayName')}</FieldLabel><Input id="user-display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={pending} /></Field><Field><FieldLabel htmlFor="user-email">{translate(language, 'email')}</FieldLabel><Input id="user-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={translate(language, 'emailPlaceholder')} disabled={pending} /></Field>{editing ? null : <Field><FieldLabel htmlFor="user-temp-password">{translate(language, 'temporaryPassword')}</FieldLabel><Input id="user-temp-password" type="password" value={temporaryPassword} onChange={event => setTemporaryPassword(event.target.value)} placeholder={translate(language, 'temporaryPasswordPlaceholder')} disabled={pending} /></Field>}<SelectionList label={translate(language, 'selectRoles')} options={roles.map(role => ({ id: role.id, label: role.name, description: role.description }))} selected={roleIds} onToggle={id => setRoleIds(current => toggleIds(current, id))} disabled={pending} /><SelectionList label={translate(language, 'selectTeams')} options={teams.map(team => ({ id: team.id, label: team.name, description: team.description }))} selected={teamIds} onToggle={id => setTeamIds(current => toggleIds(current, id))} disabled={pending} />{editing ? <Button type="button" variant={enabled ? 'outline' : 'secondary'} role="checkbox" aria-checked={enabled} disabled={pending} onClick={() => setEnabled(value => !value)}>{translate(language, 'accountEnabled')}: {translate(language, enabled ? 'enabled' : 'disabled')}</Button> : <Button type="button" variant={requirePasswordChange ? 'outline' : 'ghost'} role="checkbox" aria-checked={requirePasswordChange} disabled={pending} onClick={() => setRequirePasswordChange(value => !value)}>{translate(language, 'requirePasswordChange')}</Button>}</FieldGroup><DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : null}{translate(language, pending ? 'saving' : 'save')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function TeamEditorDialog({ client, team, open, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly team: Team | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(team);
  const [id, setId] = useState(team?.id ?? '');
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [enabled, setEnabled] = useState(team?.enabled !== false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setId(team?.id ?? ''); setName(team?.name ?? ''); setDescription(team?.description ?? ''); setEnabled(team?.enabled !== false); setFailed(false); }, [team]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!name.trim() || (!editing && !id.trim())) { setFailed(true); return; } setPending(true); setFailed(false);
    try { if (team) await client.updateTeam(team.id, { name: name.trim(), description: description.trim(), enabled }); else await client.createTeam({ id: id.trim(), name: name.trim(), description: description.trim() }); onOpenChange(false); await onChanged(); } catch { setFailed(true); onError(); } finally { setPending(false); }
  };
  return <Dialog open={open} onOpenChange={nextOpen => { if (!pending) onOpenChange(nextOpen); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{translate(language, editing ? 'teamEditTitle' : 'teamEditorTitle')}</DialogTitle><DialogDescription>{translate(language, 'teamEditorDescription')}</DialogDescription></DialogHeader><form onSubmit={submit} noValidate className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, 'editorFailed')}</AlertDescription></Alert> : null}<FieldGroup className="gap-4">{editing ? null : <Field><FieldLabel htmlFor="team-id">{translate(language, 'teamId')}</FieldLabel><Input id="team-id" value={id} onChange={event => setId(event.target.value)} disabled={pending} /></Field>}<Field><FieldLabel htmlFor="team-name">{translate(language, 'teamName')}</FieldLabel><Input id="team-name" value={name} onChange={event => setName(event.target.value)} disabled={pending} /></Field><Field><FieldLabel htmlFor="team-description">{translate(language, 'description')}</FieldLabel><Input id="team-description" value={description} onChange={event => setDescription(event.target.value)} placeholder={translate(language, 'descriptionPlaceholder')} disabled={pending} /></Field>{editing ? <Button type="button" variant="outline" role="checkbox" aria-checked={enabled} disabled={pending} onClick={() => setEnabled(value => !value)}>{translate(language, 'status')}: {translate(language, enabled ? 'enabled' : 'disabled')}</Button> : null}</FieldGroup><DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : null}{translate(language, pending ? 'saving' : 'save')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function RoleEditorDialog({ client, role, permissions, open, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly role: Role | undefined;
  readonly permissions: readonly Permission[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(role);
  const [id, setId] = useState(role?.id ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [enabled, setEnabled] = useState(role?.enabled !== false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(role?.permissions ?? []));
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setId(role?.id ?? ''); setName(role?.name ?? ''); setDescription(role?.description ?? ''); setEnabled(role?.enabled !== false); setSelected(new Set(role?.permissions ?? [])); setFailed(false); }, [role]);
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!name.trim() || (!editing && !id.trim())) { setFailed(true); return; } setPending(true); setFailed(false);
    try { if (role) await client.updateRole(role.id, { name: name.trim(), description: description.trim(), enabled, permissions: [...selected] }); else await client.createRole({ id: id.trim(), name: name.trim(), description: description.trim(), permissions: [...selected] }); onOpenChange(false); await onChanged(); } catch { setFailed(true); onError(); } finally { setPending(false); }
  };
  return <Dialog open={open} onOpenChange={nextOpen => { if (!pending) onOpenChange(nextOpen); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{translate(language, editing ? 'roleEditTitle' : 'roleEditorTitle')}</DialogTitle><DialogDescription>{translate(language, 'roleEditorDescription')}</DialogDescription></DialogHeader><form onSubmit={submit} noValidate className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, 'editorFailed')}</AlertDescription></Alert> : null}<FieldGroup className="gap-4">{editing ? null : <Field><FieldLabel htmlFor="role-id">{translate(language, 'roleId')}</FieldLabel><Input id="role-id" value={id} onChange={event => setId(event.target.value)} disabled={pending} /></Field>}<Field><FieldLabel htmlFor="role-name">{translate(language, 'roleName')}</FieldLabel><Input id="role-name" value={name} onChange={event => setName(event.target.value)} disabled={pending} /></Field><Field><FieldLabel htmlFor="role-description">{translate(language, 'description')}</FieldLabel><Input id="role-description" value={description} onChange={event => setDescription(event.target.value)} placeholder={translate(language, 'descriptionPlaceholder')} disabled={pending} /></Field><SelectionList label={translate(language, 'permissions')} options={permissions.map(permission => ({ id: permission.id, label: permission.id, description: permission.description }))} selected={selected} onToggle={toggle} disabled={pending} />{editing ? <Button type="button" variant="outline" role="checkbox" aria-checked={enabled} disabled={pending} onClick={() => setEnabled(value => !value)}>{translate(language, 'status')}: {translate(language, enabled ? 'enabled' : 'disabled')}</Button> : null}</FieldGroup><DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : null}{translate(language, pending ? 'saving' : 'save')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function PasswordResetDialog({ client, user, open, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly user: PlatformUser;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!temporaryPassword) { setFailed(true); return; } setPending(true); setFailed(false); try { await client.resetUserPassword(user.id, { temporaryPassword, requirePasswordChange }); onOpenChange(false); setTemporaryPassword(''); await onChanged(); } catch { setFailed(true); onError(); } finally { setPending(false); } };
  return <Dialog open={open} onOpenChange={nextOpen => { if (!pending) onOpenChange(nextOpen); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{translate(language, 'resetPasswordTitle')}</DialogTitle><DialogDescription>{translate(language, 'resetPasswordDescription')} <span className="font-normal text-foreground">{user.displayName}</span></DialogDescription></DialogHeader><form onSubmit={submit} noValidate className="flex flex-col gap-4">{failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{translate(language, 'resetPasswordFailed')}</AlertDescription></Alert> : null}<FieldGroup><Field><FieldLabel htmlFor="reset-temp-password">{translate(language, 'temporaryPassword')}</FieldLabel><Input id="reset-temp-password" type="password" value={temporaryPassword} onChange={event => setTemporaryPassword(event.target.value)} placeholder={translate(language, 'temporaryPasswordPlaceholder')} disabled={pending} /></Field><Button type="button" variant="outline" role="checkbox" aria-checked={requirePasswordChange} disabled={pending} onClick={() => setRequirePasswordChange(value => !value)}>{translate(language, 'requirePasswordChange')}</Button></FieldGroup><DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{translate(language, 'cancel')}</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : null}{translate(language, pending ? 'saving' : 'save')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function SkillGrantDialog({ client, open, users, roles, teams, skills, onOpenChange, onChanged, onError }: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
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
  const toggleSubject = useCallback((subjectKey: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(subjectKey)) next.delete(subjectKey);
      else next.add(subjectKey);
      return next;
    });
  }, []);
  const submit = async () => {
    if (!skillId || selected.size === 0) return;
    setPending(true);
    setFailed(false);
    try {
      await Promise.all([...selected].map(subjectKey => {
        const separator = subjectKey.indexOf(':');
        const type = subjectKey.slice(0, separator) as AdminSubjectType;
        const id = subjectKey.slice(separator + 1);
        return client.createSkillAssignment({ skillId, subject: { type, id } });
      }));
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
            <Field><SubjectMultiPicker users={users} roles={roles} teams={teams} selected={selected} onToggle={toggleSubject} disabled={pending} /></Field>
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

export function SubjectMultiPicker({ users, roles, teams, selected, onToggle, disabled }: {
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly disabled: boolean;
}) {
  const options = [
    ...users.map(user => ({ key: `${AdminSubjectType.User}:${user.id}`, label: user.displayName, description: user.username, type: translate(language, 'user') })),
    ...roles.map(role => ({ key: `${AdminSubjectType.Role}:${role.id}`, label: role.name, description: role.id, type: translate(language, 'role') })),
    ...teams.map(team => ({ key: `${AdminSubjectType.Team}:${team.id}`, label: team.name, description: team.id, type: translate(language, 'team') })),
  ];
  return <><FieldLabel>{translate(language, 'selectSubjects')}</FieldLabel><div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-1">{options.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">{translate(language, 'noMatchingSubjects')}</p> : options.map(option => <Button key={option.key} type="button" variant="ghost" size="sm" role="checkbox" aria-checked={selected.has(option.key)} disabled={disabled} className="justify-between" onClick={() => onToggle(option.key)}><span className="flex min-w-0 items-center gap-2"><UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 text-left"><span className="block truncate">{option.label} <span className="text-xs text-tertiary-foreground">({option.type})</span></span><span className="block truncate text-xs text-tertiary-foreground">{option.description}</span></span></span><span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors', selected.has(option.key) ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{selected.has(option.key) ? <CheckMark /> : null}</span></Button>)}</div><p className="flex items-center gap-1.5 text-xs text-tertiary-foreground">{translate(language, 'selectedSubjectsLabel')}<Badge variant="secondary">{selected.size}</Badge></p></>;
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
  if (tab === AdminResourceTab.Teams) return 'teams';
  if (tab === AdminResourceTab.Roles) return 'roles';
  if (tab === AdminResourceTab.Skills) return 'skills';
  return 'assignments';
}

function versionStateLabel(state: AdminSkillVersion['state']): AdminTranslationKey {
  if (state === 'published') return 'versionPublished';
  if (state === 'withdrawn') return 'versionWithdrawn';
  return 'versionDraft';
}
