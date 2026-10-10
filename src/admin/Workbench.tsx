// The employee workbench: the regular-user surface hosted inside the
// console app (one deployment, one login, role-switched). Non-admin
// accounts land here directly; administrators switch over from the 管理后台
// shell. The home route embeds the companion messenger (Grok-Bot-style
// roster: 搭档 pinned first, then 数字员工 and 通讯录) through the same-origin
// /companion proxy; apply/requests stay console-rendered antd pages.
import { LogoutOutlined, PlusOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { Alert, Button, Layout, Space, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import type { AdminConsoleClient, AdminIdentity } from './client.js';
import { type AdminLanguage, translate } from './i18n.js';
import { PortalClient } from './portal.js';
import { shellCopy as c } from './shell-copy.js';
import { WorkbenchApply, WorkbenchSubmitted } from './WorkbenchApply.js';
import { WorkbenchRequestDetail, WorkbenchRequests } from './WorkbenchRequests.js';
import { workbenchT } from './workbench-copy.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof workbenchT>[0]): string => workbenchT(key, language);

export function Workbench({
  client,
  identity,
  canManage,
  route,
  themeControl,
  onSignOut,
  signingOut,
  portal,
}: {
  readonly client: AdminConsoleClient;
  readonly identity: AdminIdentity | undefined;
  /** True when the account may switch into the admin console. */
  readonly canManage: boolean;
  /** Current hash route (always in the workbench/... tree). */
  readonly route: string;
  readonly themeControl: ReactNode;
  readonly onSignOut: () => void;
  readonly signingOut: boolean;
  /** Test seam: injected portal client (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
}) {
  const [resolvedPortal] = useState(() => portal ?? new PortalClient(() => client.getAccessToken()));
  const navigate = (next: string) => {
    window.location.hash = next;
  };
  const [, subpage, detail] = route.split('/');
  let content: ReactNode;
  switch (subpage) {
    case 'apply':
      content = <WorkbenchApply portal={resolvedPortal} navigate={navigate} />;
      break;
    case 'submitted':
      content = <WorkbenchSubmitted portal={resolvedPortal} requestId={detail ?? ''} navigate={navigate} />;
      break;
    case 'requests':
      content = detail ? (
        <WorkbenchRequestDetail portal={resolvedPortal} requestId={detail} navigate={navigate} />
      ) : (
        <WorkbenchRequests portal={resolvedPortal} navigate={navigate} />
      );
      break;
    default:
      content = (
        <WorkbenchMessenger
          portal={resolvedPortal}
          navigate={navigate}
          onSignOut={onSignOut}
        />
      );
  }
  return (
    <Layout className="admin-shell">
      <Layout className="admin-body">
        <Layout.Header className="admin-header">
          <Typography.Text strong>
            <RobotOutlined /> {c.brandShort} · {t('brand')}
          </Typography.Text>
          <Space wrap>
            {canManage && <Button onClick={() => navigate('overview')}>{t('switchToAdmin')}</Button>}
            {themeControl}
            <Typography.Text className="admin-user">{identity?.user.displayName}</Typography.Text>
            <Button aria-label={c.signOut} icon={<LogoutOutlined />} loading={signingOut} onClick={onSignOut}>
              {c.signOut}
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="admin-content admin-content-messenger">
          {content}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

// The messenger home: mint the portal session server-side (cookies land on
// the shared host through the /api proxy), then fill the content area with
// the same-origin /companion/ iframe. The messenger owns its roster and
// conversation UI; the console keeps only the thin entry bar.
function WorkbenchMessenger({
  portal,
  navigate,
  onSignOut,
}: {
  readonly portal: PortalClient;
  readonly navigate: (route: string) => void;
  readonly onSignOut: () => void;
}) {
  const [phase, setPhase] = useState<'minting' | 'ready' | 'failed' | 'expired'>('minting');
  const [revision, refresh] = useState(0);

  useEffect(() => {
    let live = true;
    setPhase('minting');
    portal
      .mintPortalSession()
      .then((status) => {
        if (!live) return;
        if (status === 200) setPhase('ready');
        else if (status === 401) setPhase('expired');
        else setPhase('failed');
      })
      .catch(() => {
        if (live) setPhase('failed');
      });
    return () => {
      live = false;
    };
  }, [portal, revision]);

  return (
    <section className="workbench-messenger">
      <div className="workbench-messenger-bar">
        <Space size={12}>
          <Typography.Text strong>{t('messengerTitle')}</Typography.Text>
          <Typography.Text type="secondary">{t('messengerHint')}</Typography.Text>
        </Space>
        <Space wrap>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => navigate('workbench/apply')}>
            {t('actionApply')}
          </Button>
          <Button size="small" onClick={() => navigate('workbench/requests')}>
            {t('actionMyRequests')}
          </Button>
          <Button
            aria-label={translate(language, 'refresh')}
            icon={<ReloadOutlined />}
            size="small"
            onClick={() => refresh((n) => n + 1)}
          />
        </Space>
      </div>
      {phase === 'failed' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <Alert type="warning" showIcon title={t('messengerMintFailed')} style={{ flex: 1 }} />
          <Button size="small" onClick={() => refresh((n) => n + 1)}>
            {t('retry')}
          </Button>
        </div>
      )}
      {phase === 'expired' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <Alert type="error" showIcon title={t('sessionExpired')} style={{ flex: 1 }} />
          <Button size="small" danger onClick={onSignOut}>
            {t('signInAgain')}
          </Button>
        </div>
      )}
      <div className="workbench-messenger-frame">
        {phase === 'ready' ? (
          <iframe key={revision} src="/companion/" title={t('messengerTitle')} allow="clipboard-write" />
        ) : (
          <div className="workbench-messenger-loading">{t('messengerLoading')}</div>
        )}
      </div>
    </section>
  );
}
