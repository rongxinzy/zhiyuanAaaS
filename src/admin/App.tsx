import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  CircleGauge,
  ClipboardList,
  Cpu,
  LayoutDashboard,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useState, type FormEvent, type ReactNode } from 'react';

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
import { Card, CardContent, CardHeader, CardTitle } from '../ui/components/ui/card.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { Skeleton } from '../ui/components/ui/skeleton.js';
import { Spinner } from '../ui/components/ui/spinner.js';
import { cn } from '../ui/lib/utils.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../ui/components/ui/dropdown-menu.js';
import { Tabs, TabsIndicator, TabsList, TabsTrigger } from '../ui/components/ui/tabs.js';
import {
  AdminThemeMode,
  applyAdminTheme,
  initialAdminTheme,
  persistAdminTheme,
  subscribeToSystemTheme,
} from './theme.js';
import { AdminResourceTab, Resources } from './Resources.js';
import { Models } from './Models.js';
import { Events } from './Events.js';

const language: AdminLanguage = 'zh';
const AdminPage = { Overview: 'overview', Resources: 'resources', Models: 'models', Events: 'events' } as const;
type AdminPage = (typeof AdminPage)[keyof typeof AdminPage];

const navigation = [
  { page: AdminPage.Overview, label: 'overview', icon: LayoutDashboard },
  { page: AdminPage.Resources, label: 'resources', icon: Boxes },
  { page: AdminPage.Models, label: 'models', icon: Cpu },
  { page: AdminPage.Events, label: 'events', icon: ClipboardList },
] as const;

const OVERVIEW_CARDS = [
  { key: 'users', icon: Users },
  { key: 'teams', icon: Users },
  { key: 'skills', icon: Boxes },
  { key: 'models', icon: Cpu },
  { key: 'pendingEvents', icon: ClipboardList },
] as const;

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

  const signIn = async (input: { deploymentId: string; username: string; password: string }) => {
    setPending(true);
    setError(null);
    try {
      setSession(await client.login(input));
    } catch (cause) {
      console.error('[ZhiyuanAdmin] login failed before session creation', cause);
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

  if (loading) return <LoadingView />;
  if (!session || session.status === AdminConsoleStatus.SignedOut) return <LoginView pending={pending} error={error} onSubmit={signIn} />;
  if (session.status === AdminConsoleStatus.Forbidden) return <ForbiddenView identity={session.identity?.user.displayName} />;
  return <ConsoleLayout client={client} identity={session.identity} pending={pending} page={page} setPage={setPage} onSignOut={signOut} />;
}

function LoadingView() {
  return <main className="flex min-h-full items-center justify-center bg-background"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />{translate(language, 'loadingConsole')}</div></main>;
}

function ConsoleLayout({ client, identity, pending, page, setPage, onSignOut }: { readonly client: AdminConsoleClient; readonly identity?: AdminSession['identity']; readonly pending: boolean; readonly page: AdminPage; readonly setPage: (page: AdminPage) => void; readonly onSignOut: () => Promise<void> }) {
  const [resourceTab, setResourceTab] = useState<AdminResourceTab>(AdminResourceTab.Users);
  const activeLabel = navigation.find(item => item.page === page)?.label ?? 'overview';
  return (
    <main className="flex min-h-full bg-background">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-3 border-b border-border px-5">
          <BrandMark />
          <div className="min-w-0"><div className="truncate text-sm font-semibold">{translate(language, 'brandShort')}</div><div className="truncate text-xs text-tertiary-foreground">{translate(language, 'adminWorkspace')}</div></div>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <div className="flex flex-col gap-1">
            <span className="px-3 pb-1 text-xs font-normal text-tertiary-foreground">{translate(language, 'workspaceLabel')}</span>
            {navigation.map(item => <NavItem key={item.page} icon={item.icon} active={page === item.page} label={translate(language, item.label)} onClick={() => setPage(item.page)} />)}
          </div>
          <div className="mt-auto border-t border-border px-3 pt-4">
            <div className="flex items-center gap-2 text-xs font-normal"><CircleGauge className="size-4 text-muted-foreground" aria-hidden="true" />{translate(language, 'controlPlane')}</div>
            <p className="mt-1.5 text-xs leading-relaxed text-tertiary-foreground">{translate(language, 'controlPlaneDescription')}</p>
          </div>
        </div>
        <div className="border-t border-border p-3">
          <div className="mb-2 flex min-w-0 items-center gap-2 px-2"><div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-normal">{(identity?.user.displayName ?? 'A').slice(0, 1)}</div><div className="min-w-0"><div className="truncate text-sm font-normal">{identity?.user.displayName ?? translate(language, 'username')}</div><div className="truncate text-xs text-tertiary-foreground">{identity?.deployment?.name ?? translate(language, 'deployment')}</div></div></div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" disabled={pending} onClick={() => void onSignOut()}><LogOut data-icon="inline-start" />{translate(language, 'signOut')}</Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-clip">
        {/* overflow-clip keeps the PageTransition entrance slide from extending
            the document's scrollable overflow, which flashed a layout-shifting
            vertical scrollbar on every nav switch. */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3"><div className="md:hidden"><BrandMark /></div><p className="truncate text-base font-semibold">{translate(language, activeLabel)}</p></div>
          <div className="flex items-center gap-1"><ThemeToggle /><Button variant="ghost" size="icon" className="size-8 rounded-lg p-0 md:hidden" disabled={pending} onClick={() => void onSignOut()} aria-label={translate(language, 'signOut')}><LogOut className="size-4" /></Button></div>
        </header>
          <nav className="flex gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2 md:hidden" aria-label={translate(language, 'navigation')}>
          {navigation.map(item => <NavItem key={item.page} icon={item.icon} active={page === item.page} label={translate(language, item.label)} onClick={() => setPage(item.page)} compact />)}
        </nav>
        <PageTransition pageKey={page}>
          {page === AdminPage.Overview ? <OverviewView client={client} /> : page === AdminPage.Models ? <Models client={client} /> : page === AdminPage.Events ? <Events client={client} /> : <div className="flex min-h-0 flex-1 flex-col"><div className="overflow-x-auto border-b border-border bg-background px-4 sm:px-6"><Tabs value={resourceTab} onValueChange={value => setResourceTab(value as AdminResourceTab)}><TabsList variant="line" className="w-max">{([AdminResourceTab.Users, AdminResourceTab.Teams, AdminResourceTab.Roles, AdminResourceTab.Skills, AdminResourceTab.Assignments] as const).map(tab => <TabsTrigger key={tab} value={tab} className="px-3">{translate(language, tab)}</TabsTrigger>)}<TabsIndicator /></TabsList></Tabs></div><Resources client={client} tab={resourceTab} /></div>}
        </PageTransition>
      </div>
    </main>
  );
}

function BrandMark() {
  return <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card"><ShieldCheck className="size-4" aria-hidden="true" /></div>;
}

function NavItem({ icon: Icon, active, label, onClick, compact = false }: { readonly icon: LucideIcon; readonly active: boolean; readonly label: string; readonly onClick: () => void; readonly compact?: boolean }) {
  return <Button data-admin-nav="true" variant="ghost" size="sm" aria-current={active ? 'page' : undefined} className={cn(compact ? 'shrink-0 gap-2' : 'w-full justify-start gap-3', 'rounded-lg border border-transparent px-3 py-2 font-normal', active ? 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')} onClick={onClick}><Icon data-icon="inline-start" />{label}</Button>;
}

function PageTransition({ pageKey, children }: { readonly pageKey: string; readonly children: ReactNode }) {
  return <div key={pageKey} className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-200">{children}</div>;
}

function ThemeToggle() {
  const [mode, setMode] = useState<AdminThemeMode>(() => initialAdminTheme());
  useLayoutEffect(() => {
    applyAdminTheme(mode);
    if (mode !== AdminThemeMode.System) return;
    return subscribeToSystemTheme(() => applyAdminTheme(mode));
  }, [mode]);
  const options = [AdminThemeMode.Light, AdminThemeMode.Dark, AdminThemeMode.System] as const;
  const modeLabel = translate(language, mode === AdminThemeMode.Light ? 'themeLight' : mode === AdminThemeMode.Dark ? 'themeDark' : 'themeSystem');
  const Icon = mode === AdminThemeMode.Light ? Sun : mode === AdminThemeMode.Dark ? Moon : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={`${translate(language, 'themeToggleLabel')}: ${modeLabel}`} title={modeLabel} />}
      >
        <Icon className="text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={value => {
            const target = value as AdminThemeMode;
            setMode(target);
            persistAdminTheme(target);
          }}
        >
          {options.map(option => (
            <DropdownMenuRadioItem key={option} value={option}>
              {translate(language, option === AdminThemeMode.Light ? 'themeLight' : option === AdminThemeMode.Dark ? 'themeDark' : 'themeSystem')}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LoginView({ pending, error, onSubmit }: { readonly pending: boolean; readonly error: AdminTranslationKey | null; readonly onSubmit: (input: { deploymentId: string; username: string; password: string }) => Promise<void> }) {
  const [validationError, setValidationError] = useState<AdminTranslationKey | null>(null);
  const displayedError = validationError ?? error;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const deploymentId = String(values.get('deploymentId') ?? '').trim();
    const username = String(values.get('username') ?? '').trim();
    const password = String(values.get('password') ?? '');
    if (!deploymentId || !username || !password) { setValidationError('requiredFields'); return; }
    setValidationError(null);
    void onSubmit({ deploymentId, username, password });
  };
  return <main className="relative flex min-h-full items-center justify-center bg-background p-6"><div className="absolute right-4 top-4"><ThemeToggle /></div><section className="flex w-full max-w-md flex-col gap-6"><header className="flex flex-col gap-4"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg border bg-card"><ShieldCheck className="size-5" aria-hidden="true" /></div><span className="text-base font-semibold">{translate(language, 'brand')}</span></div><div className="flex flex-col gap-1.5"><h1 className="text-lg font-semibold leading-snug">{translate(language, 'signInTitle')}</h1><p className="text-sm text-muted-foreground">{translate(language, 'signInDescription')}</p></div></header><form className="flex flex-col gap-5" noValidate aria-busy={pending} onSubmit={handleSubmit}>{displayedError ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, displayedError)}</AlertDescription></Alert> : null}<FieldGroup className="gap-4"><Field><FieldLabel htmlFor="admin-deployment-id">{translate(language, 'deploymentId')}</FieldLabel><Input id="admin-deployment-id" name="deploymentId" defaultValue="demo" placeholder={translate(language, 'deploymentIdPlaceholder')} disabled={pending} /></Field><Field><FieldLabel htmlFor="admin-username">{translate(language, 'username')}</FieldLabel><Input id="admin-username" name="username" defaultValue="admin" placeholder={translate(language, 'usernamePlaceholder')} autoComplete="username" disabled={pending} /></Field><Field data-invalid={Boolean(validationError)}><FieldLabel htmlFor="admin-password">{translate(language, 'password')}</FieldLabel><Input id="admin-password" name="password" type="password" placeholder={translate(language, 'passwordPlaceholder')} autoComplete="current-password" disabled={pending} aria-invalid={Boolean(validationError)} />{validationError ? <FieldError>{translate(language, validationError)}</FieldError> : null}</Field></FieldGroup><Button type="submit" size="lg" disabled={pending} className="w-full" aria-busy={pending}>{pending ? <Spinner data-icon="inline-start" /> : <LogIn data-icon="inline-start" />}{translate(language, pending ? 'signingIn' : 'signIn')}</Button></form></section></main>;
}

function ForbiddenView({ identity }: { readonly identity: string | undefined }) {
  return <main className="flex min-h-full items-center justify-center bg-muted p-6"><Alert variant="warning" className="max-w-md"><AlertCircle aria-hidden="true" /><AlertTitle>{translate(language, 'accessDeniedTitle')}</AlertTitle><AlertDescription>{translate(language, 'accessDeniedDescription')}{identity ? ` (${identity})` : ''}</AlertDescription></Alert></main>;
}

function OverviewView({ client }: { readonly client: AdminConsoleClient }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(false); try { setOverview(await client.overview()); } catch { setError(true); } finally { setLoading(false); } }, [client]);
  useEffect(() => { void load(); }, [load]);
  return <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6"><div className="mx-auto flex w-full max-w-4xl flex-col gap-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-tertiary-foreground">{translate(language, 'overviewEyebrow')}</p><h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, 'overview')}</h2><p className="mt-1.5 text-sm text-muted-foreground">{translate(language, 'overviewDescription')}</p></div><Button variant="ghost" size="icon" aria-label={translate(language, 'refresh')} title={translate(language, 'refresh')} disabled={loading} onClick={() => void load()}>{loading ? <Spinner /> : <RefreshCw />}</Button></div>{error ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{translate(language, 'refreshFailed')}</AlertDescription></Alert> : null}<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{OVERVIEW_CARDS.map(({ key, icon }) => <OverviewCard key={key} label={translate(language, key)} icon={icon} value={overview?.[key]} />)}</div><Card><CardHeader className="flex-row flex-wrap items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" /><CardTitle>{translate(language, 'overviewStatusTitle')}</CardTitle><Badge variant="success"><CheckCircle2 data-icon="inline-start" />{translate(language, 'connected')}</Badge></CardHeader><CardContent><p className="text-sm text-muted-foreground">{translate(language, 'overviewStatusDescription')}</p></CardContent></Card></div></section>;
}

function OverviewCard({ label, value, icon: Icon }: { readonly label: string; readonly value: number | undefined; readonly icon: LucideIcon }) {
  return <Card className="min-h-28 justify-between"><div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><Icon className="size-4 text-tertiary-foreground" aria-hidden="true" /></div>{value === undefined ? <Skeleton className="h-7 w-12" /> : <div className="text-lg font-semibold leading-tight">{value}</div>}</Card>;
}
