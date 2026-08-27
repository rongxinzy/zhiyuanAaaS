import { AlertCircle, ArrowRight, Boxes, Cpu, LayoutDashboard, LogIn, LogOut, RefreshCw, Users } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import {
  AdminConsoleClient,
  AdminConsoleStatus,
  type AdminOverview,
  type AdminSession,
} from './client.js';
import { translate, type AdminLanguage, type AdminTranslationKey } from './i18n.js';
import { Alert, AlertDescription, AlertTitle } from '../ui/components/ui/alert.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import { AdminResourceTab, Resources } from './Resources.js';

const language: AdminLanguage = 'zh';
const AdminPage = { Overview: 'overview', Resources: 'resources' } as const;
type AdminPage = (typeof AdminPage)[keyof typeof AdminPage];

export function AdminApp() {
  const [client] = useState(() => new AdminConsoleClient());
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AdminTranslationKey | null>(null);
  const [page, setPage] = useState<AdminPage>(AdminPage.Overview);

  useEffect(() => {
    void client.restore().then(setSession).catch(() => setSession({ status: AdminConsoleStatus.SignedOut })).finally(() => setLoading(false));
  }, [client]);

  const signIn = async (input: { enterpriseId: string; username: string; password: string }) => {
    setPending(true);
    setError(null);
    try {
      setSession(await client.login(input));
    } catch {
      setError('signInFailed');
    } finally {
      setPending(false);
    }
  };

  const signOut = async () => {
    setPending(true);
    await client.logout();
    setSession({ status: AdminConsoleStatus.SignedOut });
    setPending(false);
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-background"><Spinner /></div>;
  if (!session || session.status === AdminConsoleStatus.SignedOut) {
    return <LoginView pending={pending} error={error} onSubmit={signIn} />;
  }
  if (session.status === AdminConsoleStatus.Forbidden) {
    return session.identity?.user.displayName ? (
      <ForbiddenView identity={session.identity.user.displayName} />
    ) : (
      <ForbiddenView />
    );
  }
  return <ConsoleLayout client={client} identity={session.identity} pending={pending} page={page} setPage={setPage} onSignOut={signOut} />;
}

function ConsoleLayout({ client, identity, pending, page, setPage, onSignOut }: { readonly client: AdminConsoleClient; readonly identity?: AdminSession['identity']; readonly pending: boolean; readonly page: AdminPage; readonly setPage: (page: AdminPage) => void; readonly onSignOut: () => Promise<void> }) {
  const [resourceTab, setResourceTab] = useState<AdminResourceTab>(AdminResourceTab.Users);
  return <main className="flex min-h-full flex-col bg-background"><header className="flex min-h-12 items-center justify-between gap-4 border-b px-4 py-2 sm:px-6"><div className="min-w-0"><div className="text-sm font-semibold">{translate(language, 'brand')}</div><div className="text-xs text-muted-foreground">{translate(language, 'signedInAs')}: {identity?.user.displayName ?? translate(language, 'username')}</div></div><Button variant="ghost" size="sm" disabled={pending} onClick={() => void onSignOut()}><LogOut data-icon="inline-start" />{translate(language, 'signOut')}</Button></header><div className="flex min-h-0 flex-1 flex-col sm:flex-row"><nav className="flex shrink-0 gap-1 border-b p-2 sm:w-52 sm:flex-col sm:border-b-0 sm:border-r sm:p-3" aria-label={translate(language, 'navigation') }><Button variant={page === AdminPage.Overview ? 'secondary' : 'ghost'} size="sm" className="justify-start" onClick={() => setPage(AdminPage.Overview)}><LayoutDashboard data-icon="inline-start" />{translate(language, 'overview')}</Button><Button variant={page === AdminPage.Resources ? 'secondary' : 'ghost'} size="sm" className="justify-start" onClick={() => setPage(AdminPage.Resources)}><Boxes data-icon="inline-start" />{translate(language, 'resources')}</Button></nav>{page === AdminPage.Overview ? <OverviewView client={client} identity={identity} pending={pending} onSignOut={onSignOut} /> : <div className="flex min-h-0 flex-1 flex-col"><div className="flex gap-1 overflow-x-auto border-b px-4 py-2 sm:px-6">{([AdminResourceTab.Users, AdminResourceTab.Agents, AdminResourceTab.Skills, AdminResourceTab.Assignments] as const).map(tab => <Button key={tab} variant={resourceTab === tab ? 'secondary' : 'ghost'} size="sm" onClick={() => setResourceTab(tab)}>{translate(language, tab)}</Button>)}</div><Resources client={client} tab={resourceTab} /></div>}</div></main>;
}

function LoginView({ pending, error, onSubmit }: { readonly pending: boolean; readonly error: AdminTranslationKey | null; readonly onSubmit: (input: { enterpriseId: string; username: string; password: string }) => Promise<void> }) {
  const [enterpriseId, setEnterpriseId] = useState('demo');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<AdminTranslationKey | null>(null);
  const displayedError = validationError ?? error;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enterpriseId.trim() || !username.trim() || !password) {
      setValidationError('requiredFields');
      return;
    }
    setValidationError(null);
    void onSubmit({ enterpriseId: enterpriseId.trim(), username: username.trim(), password });
  };
  return <main className="flex min-h-full items-center justify-center bg-background p-6"><section className="flex w-full max-w-md flex-col gap-6"><header className="flex flex-col gap-2"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg border bg-card"><Boxes className="size-5" /></div><span className="text-base font-semibold">{translate(language, 'brand')}</span></div><h1 className="text-xl font-semibold leading-snug">{translate(language, 'signInTitle')}</h1><p className="text-sm text-muted-foreground">{translate(language, 'signInDescription')}</p></header><form className="flex flex-col gap-5" onSubmit={submit} noValidate>{displayedError ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, displayedError)}</AlertDescription></Alert> : null}<FieldGroup><Field><FieldLabel htmlFor="admin-enterprise-id">{translate(language, 'enterpriseId')}</FieldLabel><Input id="admin-enterprise-id" value={enterpriseId} onChange={event => setEnterpriseId(event.target.value)} placeholder={translate(language, 'enterpriseIdPlaceholder')} disabled={pending} /></Field><Field><FieldLabel htmlFor="admin-username">{translate(language, 'username')}</FieldLabel><Input id="admin-username" value={username} onChange={event => setUsername(event.target.value)} placeholder={translate(language, 'usernamePlaceholder')} autoComplete="username" disabled={pending} /></Field><Field><FieldLabel htmlFor="admin-password">{translate(language, 'password')}</FieldLabel><Input id="admin-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={translate(language, 'passwordPlaceholder')} autoComplete="current-password" disabled={pending} />{validationError ? <FieldError>{translate(language, validationError)}</FieldError> : null}</Field></FieldGroup><Button type="submit" size="lg" disabled={pending} className="w-full">{pending ? <Spinner data-icon="inline-start" /> : <LogIn data-icon="inline-start" />}{translate(language, pending ? 'signingIn' : 'signIn')}</Button></form></section></main>;
}

function ForbiddenView({ identity }: { readonly identity?: string }) {
  return <main className="flex min-h-full items-center justify-center bg-background p-6"><Alert className="max-w-md"><AlertCircle aria-hidden="true" /><AlertTitle>{translate(language, 'accessDeniedTitle')}</AlertTitle><AlertDescription>{translate(language, 'accessDeniedDescription')}{identity ? ` (${identity})` : ''}</AlertDescription></Alert></main>;
}

function OverviewView({ client, identity, pending, onSignOut }: { readonly client: AdminConsoleClient; readonly identity?: AdminSession['identity']; readonly pending: boolean; readonly onSignOut: () => Promise<void> }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(false); try { setOverview(await client.overview()); } catch { setError(true); } finally { setLoading(false); } }, [client]);
  useEffect(() => { void load(); }, [load]);
  const cards = overview ? [
    { key: 'users' as const, value: overview.users, icon: Users },
    { key: 'agents' as const, value: overview.agents, icon: Cpu },
    { key: 'skills' as const, value: overview.skills, icon: Boxes },
    { key: 'models' as const, value: overview.models, icon: ArrowRight },
    { key: 'pendingEvents' as const, value: overview.pendingEvents, icon: RefreshCw },
  ] : [];
  return <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6"><div className="mx-auto flex w-full max-w-5xl flex-col gap-6"><div className="flex items-start justify-between gap-4"><div><h1 className="text-lg font-semibold">{translate(language, 'overview')}</h1><p className="text-sm text-muted-foreground">{translate(language, 'overviewDescription')}</p></div><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>{loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}{translate(language, loading ? 'refreshing' : 'refresh')}</Button></div>{error ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'refreshFailed')}</AlertDescription></Alert> : null}<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(card => <OverviewCard key={card.key} label={translate(language, card.key)} value={card.value} icon={card.icon} loading={loading} />)}</div></div></section>;
}

function OverviewCard({ label, value, icon: Icon, loading }: { readonly label: string; readonly value: number; readonly icon: typeof Users; readonly loading: boolean }) {
  return <article className="flex min-h-28 flex-col justify-between gap-4 rounded-lg border bg-card p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><Badge variant="outline"><Icon className="size-3.5" aria-hidden="true" /></Badge></div><div className="text-2xl font-semibold">{loading ? '—' : value}</div></article>;
}
