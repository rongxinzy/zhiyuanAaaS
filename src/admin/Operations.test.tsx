// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cloneElement, type ReactElement } from 'react';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ConfigurationStatusView, CredentialsView, DeploymentSettingsView, Operations, SessionsView } from './Operations.js';
import { AdminRequestError } from './client.js';
import { administratorIdentity } from './test-fixtures.js';

// antd icon buttons expose "<icon-name> <text>" as their accessible name, so
// icon-bearing buttons are matched with regexes throughout this file.
function render(ui: ReactElement<{ readonly identity?: typeof administratorIdentity }>) {
  const withIdentity = cloneElement(ui, { identity: ui.props.identity ?? administratorIdentity });
  return rtlRender(
    <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }}>
      {withIdentity}
    </ConfigProvider>,
  );
}

function modalButton(name: RegExp | string) {
  return screen.getAllByRole('button', { name }).at(-1)!;
}

const license = {
  licenseId: 'license-1', customerId: 'customer-1', deploymentId: 'demo', digest: 'a'.repeat(64), keyId: 'license-prod-1',
  status: 'active', issuedAt: '2026-09-01T00:00:00Z', expiresAt: '2027-09-01T00:00:00Z', graceEndsAt: '2027-09-08T00:00:00Z',
  features: ['model_gateway'], activeUsers: 2, revokedAt: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
};

const credential = {
  id: 'cred-1', name: 'DeepSeek', service: 'model-gateway', type: 'api_key', deliveryMode: 'server_only',
  maskedValue: 'sk-***123', enabled: true, updatedAt: '2026-09-04T00:00:00Z',
};

const adminUser = { id: 'user-1', displayName: '管理员', username: 'admin', status: 'active' };
const emptyResources = { users: [], roles: [], teams: [], permissions: [], skills: [], assignments: [] };

function dataPlaneFixture(observedRevision: string) {
  return {
    desired: {
      deploymentId: 'demo', revision: 'rev-1',
      routes: [{ modelId: 'chat', enabled: true, endpoint: '/v1/chat', upstreamModel: 'deepseek-chat', protocol: 'openai-compatible', providerType: 'deepseek' }],
      publishedAt: '2026-09-04T00:00:00Z', contentHash: 'a'.repeat(64),
    },
    status: { state: 'ready', observedRevision, contentHash: 'a'.repeat(64), lastAppliedAt: '2026-09-04T00:01:00Z', resourceCount: 1 },
  };
}

describe('admin operations: product licensing', () => {
  afterEach(() => cleanup());

  test('imports and revokes a license through the product-license page', async () => {
    const client = {
      licenses: vi.fn().mockResolvedValue([license]),
      importLicense: vi.fn().mockResolvedValue(undefined),
      revokeLicense: vi.fn().mockResolvedValue(undefined),
    };
    render(<Operations client={client as never} />);

    expect(await screen.findByText('license-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '撤销许可证' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认撤销许可证' }));
    await waitFor(() => expect(client.revokeLicense).toHaveBeenCalledWith('license-1'));

    fireEvent.click(screen.getByRole('button', { name: /导入授权/ }));
    const envelope = JSON.stringify({ format: 'zhiyuan-license-v1', keyId: 'license-prod-1', payload: { licenseId: 'license-2' }, signature: 'signed' });
    const file = new File([envelope], 'license.json', { type: 'application/json' });
    fireEvent.change(await screen.findByLabelText('许可证文件'), { target: { files: [file] } });
    fireEvent.click(modalButton(/导入授权/));
    await waitFor(() => expect(client.importLicense).toHaveBeenCalledWith({ license: expect.objectContaining({ keyId: 'license-prod-1', signature: 'signed' }) }));
  });

  test('keeps license status readable but hides import and revoke without write permissions', async () => {
    const client = {
      licenses: vi.fn().mockResolvedValue([license]),
      importLicense: vi.fn(),
      revokeLicense: vi.fn(),
    };
    render(<Operations client={client as never} identity={{ roles: [], permissions: ['licenses.read'] } as never} />);

    expect(await screen.findByText('license-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /导入授权/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '撤销许可证' })).not.toBeInTheDocument();
  });
});

describe('admin operations: login sessions', () => {
  afterEach(() => cleanup());

  const sessions = [
    { sessionId: 'session-active', userId: 'user-1', topic: 'user:user-1', createdAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-04T00:00:00Z', revokedAt: null },
    { sessionId: 'session-revoked', userId: 'user-1', topic: 'user:user-1', createdAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-04T00:00:00Z', revokedAt: '2026-09-04T01:00:00Z' },
  ];

  test('shows user names, marks the client unknown and revokes a sign-in after confirmation', async () => {
    let current = sessions;
    const client = {
      sessions: vi.fn().mockImplementation(async () => current),
      users: vi.fn().mockResolvedValue([adminUser]),
      revokeUserSession: vi.fn().mockImplementation(async (sessionId: string) => {
        current = current.map(session => session.sessionId === sessionId ? { ...session, revokedAt: '2026-09-04T02:00:00Z' } : session);
      }),
    };
    render(<SessionsView client={client as never} identity={{ roles: [], permissions: ['users.read', 'sessions.write'] } as never} />);

    expect(await screen.findAllByText('管理员')).toHaveLength(2);
    expect(screen.getAllByText('未知').length).toBeGreaterThan(0);
    expect(screen.getByText('有效')).toBeInTheDocument();
    expect(screen.getByText('已撤销')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '撤销登录' })).toHaveLength(1);

    fireEvent.click(screen.getAllByRole('button', { name: /查看/ })[0]!);
    expect(await screen.findByText('会话详情')).toBeInTheDocument();
    expect(screen.getByText('session-active')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /关闭/ }));

    fireEvent.click(screen.getByRole('button', { name: '撤销登录' }));
    expect(await screen.findByText('撤销本次登录')).toBeInTheDocument();
    expect(screen.getByText(/撤销后该客户端需要重新登录/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }));
    await waitFor(() => expect(client.revokeUserSession).toHaveBeenCalledWith('session-active'));
    await waitFor(() => expect(client.sessions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: '撤销登录' })).not.toBeInTheDocument());
  });

  test('shows the recorded client identity and disables revoking the current session', async () => {
    const currentSession = {
      sessionId: 'session-current', userId: 'user-1', topic: 'user:user-1',
      createdAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-04T00:00:00Z', revokedAt: null,
      client: { name: 'zhiyuan-enterprise', version: '0.8.0', deviceId: '7b7d02c4-2c4f-4f6f-9d3c-9d6f8a1b2c3d' },
    };
    const browserSession = {
      sessionId: 'session-browser', userId: 'user-1', topic: 'user:user-1',
      createdAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-04T00:00:00Z', revokedAt: null,
      client: { name: 'browser' },
    };
    const unknownSession = {
      sessionId: 'session-unknown', userId: 'user-1', topic: 'user:user-1',
      createdAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-04T00:00:00Z', revokedAt: null,
      client: null,
    };
    const client = {
      sessionId: 'session-current',
      sessions: vi.fn().mockResolvedValue([currentSession, browserSession, unknownSession]),
      users: vi.fn().mockResolvedValue([adminUser]),
      revokeUserSession: vi.fn(),
    };
    render(<SessionsView client={client as never} identity={{ roles: [], permissions: ['users.read', 'sessions.write'] } as never} />);

    // Self-reported identity keeps name and version; the device id is truncated.
    expect(await screen.findByText('zhiyuan-enterprise 0.8.0')).toBeInTheDocument();
    expect(screen.getByText('7b7d02c4…')).toBeInTheDocument();
    // The User-Agent fallback label is rendered readably.
    expect(screen.getByText('浏览器')).toBeInTheDocument();
    expect(screen.getByText('未知')).toBeInTheDocument();

    // The console's own session is badged and its revoke action is disabled.
    expect(screen.getByText('当前会话')).toBeInTheDocument();
    const currentRow = screen.getByText('zhiyuan-enterprise 0.8.0').closest('tr')!;
    const currentRevoke = within(currentRow).getByRole('button', { name: '撤销登录' });
    expect(currentRevoke).toBeDisabled();
    fireEvent.click(currentRevoke);
    expect(client.revokeUserSession).not.toHaveBeenCalled();
    fireEvent.mouseEnter(currentRevoke);
    expect(await screen.findByText('当前控制台正在使用该会话，不能撤销。')).toBeInTheDocument();

    const browserRow = screen.getByText('浏览器').closest('tr')!;
    expect(within(browserRow).getByRole('button', { name: '撤销登录' })).toBeEnabled();
    const unknownRow = screen.getByText('未知').closest('tr')!;
    expect(within(unknownRow).getByRole('button', { name: '撤销登录' })).toBeEnabled();

    // The detail drawer shows the full identity and also guards the current session.
    fireEvent.click(within(currentRow).getByRole('button', { name: /查看/ }));
    expect(await screen.findByText('会话详情')).toBeInTheDocument();
    expect(screen.getByText('设备 ID 7b7d02c4-2c4f-4f6f-9d3c-9d6f8a1b2c3d')).toBeInTheDocument();
    const drawerRevoke = screen.getAllByRole('button', { name: '撤销登录' }).at(-1)!;
    expect(drawerRevoke).toBeDisabled();
  });

  test('hides revocation without sessions.write while the list stays visible', async () => {
    const client = {
      sessions: vi.fn().mockResolvedValue(sessions),
      users: vi.fn().mockResolvedValue([adminUser]),
      revokeUserSession: vi.fn(),
    };
    render(<SessionsView client={client as never} identity={{ roles: [], permissions: ['users.read'] } as never} />);

    await waitFor(() => expect(screen.queryByRole('button', { name: '撤销登录' })).not.toBeInTheDocument());
  });

  test('applies the user filter to the session query', async () => {
    const client = {
      sessions: vi.fn().mockResolvedValue([]),
      users: vi.fn().mockResolvedValue([]),
    };
    render(<SessionsView client={client as never} />);
    fireEvent.change(await screen.findByPlaceholderText('按用户 ID 筛选'), { target: { value: 'user-1' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() => expect(client.sessions).toHaveBeenLastCalledWith('user-1'));
  });

  test('reports a load failure instead of an empty success state', async () => {
    const client = {
      sessions: vi.fn().mockRejectedValue(new Error('boom')),
      users: vi.fn().mockResolvedValue([]),
    };
    render(<SessionsView client={client as never} />);
    expect(await screen.findByText(/登录会话加载失败/)).toBeInTheDocument();
    expect(screen.queryByText('暂无登录会话')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
  });
});

describe('admin operations: connection configuration', () => {
  afterEach(() => cleanup());

  test('creates, edits, rotates (with retry), and deletes a connection', async () => {
    const client = {
      licenses: vi.fn().mockResolvedValue([]),
      credentials: vi.fn().mockResolvedValue({ credentials: [credential], assignments: [] }),
      resources: vi.fn().mockResolvedValue({ ...emptyResources, users: [adminUser] }),
      createCredential: vi.fn().mockResolvedValue(undefined),
      updateCredential: vi.fn().mockResolvedValue(undefined),
      rotateCredential: vi.fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined),
      deleteCredential: vi.fn().mockResolvedValue(undefined),
      models: vi.fn().mockResolvedValue({ models: [], assignments: [] }),
    };
    render(<CredentialsView client={client as never} />);

    expect(await screen.findByText('DeepSeek')).toBeInTheDocument();
    expect(screen.getByText('已设置，不可回显')).toBeInTheDocument();
    expect(screen.getByText('暂无模型引用')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(await screen.findByLabelText('名称'), { target: { value: 'Gateway key' } });
    fireEvent.click(modalButton(/保存/));
    await waitFor(() => expect(client.updateCredential).toHaveBeenCalledWith('cred-1', expect.objectContaining({ name: 'Gateway key', service: 'model-gateway', deliveryMode: 'server_only', enabled: true })));

    fireEvent.click(screen.getByRole('button', { name: '更新密钥' }));
    expect(await screen.findByText('影响模型')).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('新密钥'), { target: { value: 'new-secret' } });
    fireEvent.click(modalButton(/更新密钥/));
    // A failed rotation keeps the form open with the typed value so it can be retried.
    expect(await screen.findByText('凭证轮换失败，请稍后重试。')).toBeInTheDocument();
    expect(screen.getByText(/轮换失败，密钥未变更/)).toBeInTheDocument();
    expect((screen.getByLabelText('新密钥') as HTMLInputElement).value).toBe('new-secret');
    fireEvent.click(modalButton(/更新密钥/));
    await waitFor(() => expect(client.rotateCredential).toHaveBeenCalledTimes(2));
    expect(client.rotateCredential).toHaveBeenLastCalledWith('cred-1', { value: 'new-secret' });

    fireEvent.click(screen.getByRole('button', { name: /删除/ }));
    expect(await screen.findByText('删除接入配置')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(client.deleteCredential).toHaveBeenCalledWith('cred-1'));
  });

  test('creates a connection from the toolbar and reports saved-not-applied', async () => {
    const client = {
      credentials: vi.fn().mockResolvedValue({ credentials: [], assignments: [] }),
      resources: vi.fn().mockResolvedValue(emptyResources),
      models: vi.fn().mockResolvedValue({ models: [], assignments: [] }),
      createCredential: vi.fn().mockResolvedValue(undefined),
    };
    render(<CredentialsView client={client as never} />);
    fireEvent.click(await screen.findByRole('button', { name: /新建接入配置/ }));
    fireEvent.change(await screen.findByLabelText('名称'), { target: { value: 'Search API' } });
    fireEvent.change(screen.getByLabelText('服务'), { target: { value: 'search' } });
    fireEvent.change(screen.getByLabelText('新密钥'), { target: { value: 'secret' } });
    fireEvent.click(modalButton(/保存/));
    await waitFor(() => expect(client.createCredential).toHaveBeenCalledWith({ name: 'Search API', service: 'search', type: 'api_key', deliveryMode: 'server_only', value: 'secret', enabled: true }));
    // Saving must not be presented as applied or checked.
    expect(await screen.findByText('配置已保存')).toBeInTheDocument();
    expect(screen.getByText(/不代表已应用或检测通过/)).toBeInTheDocument();
  });

  test('grants access in batch and reports partial failures with the failed subject kept selected', async () => {
    const client = {
      credentials: vi.fn().mockResolvedValue({ credentials: [credential], assignments: [] }),
      resources: vi.fn().mockResolvedValue({ ...emptyResources, users: [adminUser] }),
      models: vi.fn().mockResolvedValue({ models: [], assignments: [] }),
      createCredentialAssignment: vi.fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined),
    };
    render(<CredentialsView client={client as never} />);
    expect(await screen.findByText('DeepSeek')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /授权/ }));
    fireEvent.mouseDown(await screen.findByRole('combobox'));
    fireEvent.click(await screen.findByText('管理员（admin）'));
    fireEvent.click(modalButton(/授权/));
    await waitFor(() => expect(client.createCredentialAssignment).toHaveBeenCalledWith({ credentialId: 'cred-1', subject: { type: 'user', id: 'user-1' } }));

    expect(await screen.findByText(/凭证授权失败/)).toBeInTheDocument();
    expect(screen.getAllByText(/管理员（admin）/).length).toBeGreaterThan(0);
    expect(screen.getByText(/失败的对象已保持选中/)).toBeInTheDocument();

    fireEvent.click(modalButton(/授权/));
    await waitFor(() => expect(client.createCredentialAssignment).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/凭证授权失败/)).not.toBeInTheDocument());
  });

  test('hides every credential mutation and grant control for a read-only operator', async () => {
    const client = {
      licenses: vi.fn().mockResolvedValue([]),
      credentials: vi.fn().mockResolvedValue({ credentials: [credential], assignments: [] }),
      resources: vi.fn().mockResolvedValue(emptyResources),
      createCredential: vi.fn(),
      updateCredential: vi.fn(),
      rotateCredential: vi.fn(),
      deleteCredential: vi.fn(),
      createCredentialAssignment: vi.fn(),
      models: vi.fn(),
    };
    const identity = { roles: [], permissions: ['credentials.read'] } as never;
    render(<CredentialsView client={client as never} identity={identity} />);

    expect(await screen.findByText('DeepSeek')).toBeInTheDocument();
    expect(screen.getAllByText('未知').length).toBeGreaterThan(0);
    expect(client.models).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /新建接入配置/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '更新密钥' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /授权/ })).not.toBeInTheDocument();
    expect(client.credentials).toHaveBeenCalledWith(identity);
  });

  test('shows real model references, warns on rotate and blocks delete while referenced', async () => {
    const client = {
      credentials: vi.fn().mockResolvedValue({ credentials: [credential], assignments: [] }),
      resources: vi.fn().mockResolvedValue(emptyResources),
      models: vi.fn().mockResolvedValue({
        models: [{ id: 'model-1', displayName: '企业通用模型', credentialId: 'cred-1', sourceType: 'enterprise', protocol: 'openai-compatible', capabilities: [], isDefault: false, enabled: true }],
        assignments: [],
      }),
      rotateCredential: vi.fn(),
      deleteCredential: vi.fn(),
    };
    render(<CredentialsView client={client as never} />);

    expect(await screen.findByText('企业通用模型')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '更新密钥' }));
    expect(await screen.findByText('影响模型')).toBeInTheDocument();
    expect(screen.getAllByText(/企业通用模型/).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    fireEvent.click(screen.getByRole('button', { name: /删除/ }));
    expect(await screen.findByText(/仍被以下模型引用/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /确认删除/ }) as HTMLButtonElement;
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm);
    expect(client.deleteCredential).not.toHaveBeenCalled();
  });

  test('keeps references explicitly unknown when the model list fails or is unreadable', async () => {
    const client = {
      credentials: vi.fn().mockResolvedValue({ credentials: [credential], assignments: [] }),
      resources: vi.fn().mockResolvedValue(emptyResources),
      models: vi.fn().mockRejectedValue(new Error('boom')),
      deleteCredential: vi.fn().mockResolvedValue(undefined),
    };
    render(<CredentialsView client={client as never} />);

    expect(await screen.findByText('DeepSeek')).toBeInTheDocument();
    expect(screen.queryByText('暂无模型引用')).not.toBeInTheDocument();
    expect(screen.getAllByText('未知').length).toBeGreaterThan(0);

    // Unknown references never block deletion, but the modal says so honestly.
    fireEvent.click(screen.getByRole('button', { name: /删除/ }));
    expect(await screen.findByText(/未能获取引用模型信息/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /确认删除/ }) as HTMLButtonElement;
    await waitFor(() => expect(confirm).toBeEnabled());
  });
});

describe('admin operations: configuration status', () => {
  afterEach(() => cleanup());

  test('shows desired vs applied revisions read-only and refreshes without publishing', async () => {
    const client = {
      licenses: vi.fn().mockResolvedValue([]),
      dataPlane: vi.fn()
        .mockResolvedValueOnce(dataPlaneFixture('rev-1'))
        .mockResolvedValueOnce(dataPlaneFixture('rev-2')),
    };
    render(<ConfigurationStatusView client={client as never} identity={{ roles: [], permissions: ['data_plane.write'] } as never} />);

    expect(await screen.findByText('目标版本')).toBeInTheDocument();
    expect(screen.getAllByText('rev-1').length).toBeGreaterThan(0);
    expect(screen.getByText('一致')).toBeInTheDocument();
    expect(screen.getByText('chat')).toBeInTheDocument();
    expect(screen.getByText('/v1/chat')).toBeInTheDocument();
    // Read-only: there is no publish path anywhere in this view.
    expect(screen.queryByRole('button', { name: /发布/ })).not.toBeInTheDocument();

    // antd Button keeps intercepting clicks while its delayed loading spinner
    // is detaching; wait for the loading class to leave before clicking.
    const refreshButton = screen.getByRole('button', { name: /刷新/ }) as HTMLButtonElement;
    await waitFor(() => expect(refreshButton).not.toHaveClass('ant-btn-loading'));
    fireEvent.click(refreshButton);
    await waitFor(() => expect(client.dataPlane).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('不一致')).toBeInTheDocument());
  });

  test('marks the applied revision unknown when the gateway has not observed one', async () => {
    const client = {
      dataPlane: vi.fn().mockResolvedValue({
        ...dataPlaneFixture(''),
        status: { state: 'pending', observedRevision: '', contentHash: 'a'.repeat(64), lastAppliedAt: null, resourceCount: null },
      }),
    };
    render(<ConfigurationStatusView client={client as never} identity={{ roles: [], permissions: ['data_plane.write'] } as never} />);

    expect(await screen.findByText('目标版本')).toBeInTheDocument();
    expect(screen.getByText('待应用')).toBeInTheDocument();
    expect(screen.getAllByText('未知').length).toBeGreaterThan(0);
    expect(screen.getByText(/暂无模型调用检测接口/)).toBeInTheDocument();
  });

  test('blocks the page without dataplane permission', async () => {
    const client = { dataPlane: vi.fn() };
    render(<ConfigurationStatusView client={client as never} identity={{ roles: [], permissions: ['credentials.read'] } as never} />);
    expect(await screen.findByText('无权限查看配置生效详情。')).toBeInTheDocument();
    expect(client.dataPlane).not.toHaveBeenCalled();
  });

  test('shows catalog drift from the status comparison and links the publish path', async () => {
    const drifted = dataPlaneFixture('rev-1');
    const client = {
      dataPlane: vi.fn().mockResolvedValue({
        ...drifted,
        status: {
          ...drifted.status,
          catalogComparison: {
            missing: ['vision'],
            extra: ['retired'],
            mismatched: [{ modelId: 'chat', fields: ['endpoint'] }],
          },
        },
      }),
    };
    render(<ConfigurationStatusView client={client as never} identity={{ roles: [], permissions: ['data_plane.write'] } as never} />);

    expect(await screen.findByText(/期望路由与模型目录存在差异/)).toBeInTheDocument();
    expect(screen.getByText(/目录有、路由缺失/)).toHaveTextContent('vision');
    expect(screen.getByText(/路由有、目录不收录/)).toHaveTextContent('retired');
    expect(screen.getByText(/字段不一致/)).toHaveTextContent('chat（网关地址）');
    // The comparison stays read-only here; publishing happens on the model page.
    expect(screen.queryByRole('button', { name: /发布/ })).not.toBeInTheDocument();
  });

  test('reports in-sync when the catalog comparison is empty', async () => {
    const synced = dataPlaneFixture('rev-1');
    const client = {
      dataPlane: vi.fn().mockResolvedValue({
        ...synced,
        status: { ...synced.status, catalogComparison: { missing: [], extra: [], mismatched: [] } },
      }),
    };
    render(<ConfigurationStatusView client={client as never} identity={{ roles: [], permissions: ['data_plane.write'] } as never} />);
    expect(await screen.findByText('期望路由与模型目录一致')).toBeInTheDocument();
  });

  test('routes Operations sections: credentials and the license default', async () => {
    const credentialsClient = {
      credentials: vi.fn().mockResolvedValue({ credentials: [], assignments: [] }),
      resources: vi.fn().mockResolvedValue(emptyResources),
      models: vi.fn().mockResolvedValue({ models: [], assignments: [] }),
    };
    render(<Operations client={credentialsClient as never} section="credentials" />);
    expect(await screen.findByText('接入配置')).toBeInTheDocument();
    expect(credentialsClient.credentials).toHaveBeenCalled();
    cleanup();

    const licensesClient = { licenses: vi.fn().mockResolvedValue([license]) };
    render(<Operations client={licensesClient as never} />);
    expect(await screen.findByText('产品授权')).toBeInTheDocument();
    expect(licensesClient.licenses).toHaveBeenCalled();
  });
});

describe('admin operations: deployment settings', () => {
  afterEach(() => cleanup());

  const envSettings = {
    modelGatewayBaseUrl: { override: null, effectiveValue: 'https://gateway.example.test/v1', source: 'env' },
  };
  const overrideSettings = {
    modelGatewayBaseUrl: { override: 'https://gw.example.test/v2', effectiveValue: 'https://gw.example.test/v2', source: 'override' },
  };

  test('shows the effective value and source, then saves a new override', async () => {
    const client = {
      deploymentSettings: vi.fn().mockResolvedValue(envSettings),
      updateDeploymentSettings: vi.fn().mockResolvedValue(overrideSettings),
    };
    render(<DeploymentSettingsView client={client as never} />);

    expect(await screen.findByText('部署运行时设置')).toBeInTheDocument();
    expect(screen.getAllByText('https://gateway.example.test/v1').length).toBeGreaterThan(0);
    expect(screen.getByText('环境默认')).toBeInTheDocument();
    expect(screen.getByText(/约 30 秒内自动生效/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '设置覆盖' }));
    const input = await screen.findByLabelText('模型网关地址');
    expect(input).toHaveValue('https://gateway.example.test/v1');
    fireEvent.change(input, { target: { value: 'https://gw.example.test/v2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存覆盖' }));
    await waitFor(() => expect(client.updateDeploymentSettings).toHaveBeenCalledWith({ modelGatewayBaseUrl: 'https://gw.example.test/v2' }));
    await waitFor(() => expect(client.deploymentSettings).toHaveBeenCalledTimes(2));
  });

  test('clears the override with an explicit null after confirmation', async () => {
    const client = {
      deploymentSettings: vi.fn().mockResolvedValue(overrideSettings),
      updateDeploymentSettings: vi.fn().mockResolvedValue(envSettings),
    };
    render(<DeploymentSettingsView client={client as never} />);

    expect((await screen.findAllByText('运行时覆盖')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '清除覆盖' }));
    fireEvent.click(modalButton('清除覆盖'));
    await waitFor(() => expect(client.updateDeploymentSettings).toHaveBeenCalledWith({ modelGatewayBaseUrl: null }));
  });

  test('pre-validates the gateway URL and never calls the server on failure', async () => {
    const client = {
      deploymentSettings: vi.fn().mockResolvedValue(envSettings),
      updateDeploymentSettings: vi.fn(),
    };
    render(<DeploymentSettingsView client={client as never} />);

    fireEvent.click(await screen.findByRole('button', { name: '设置覆盖' }));
    const input = await screen.findByLabelText('模型网关地址');
    fireEvent.change(input, { target: { value: 'http://gateway.svc.cluster.local/v1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存覆盖' }));
    expect(await screen.findByText(/集群内域名/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'not-a-url' } });
    fireEvent.click(screen.getByRole('button', { name: '保存覆盖' }));
    expect(await screen.findByText(/http\/https 绝对地址/)).toBeInTheDocument();
    expect(client.updateDeploymentSettings).not.toHaveBeenCalled();
  });

  test('shows the server 422 problem detail and keeps the draft open', async () => {
    const client = {
      deploymentSettings: vi.fn().mockResolvedValue(envSettings),
      updateDeploymentSettings: vi.fn().mockRejectedValue(
        new AdminRequestError(422, 'INVALID_DEPLOYMENT_SETTINGS', 'The model gateway base URL must not use a cluster-internal hostname.'),
      ),
    };
    render(<DeploymentSettingsView client={client as never} />);

    fireEvent.click(await screen.findByRole('button', { name: '设置覆盖' }));
    const input = await screen.findByLabelText('模型网关地址');
    fireEvent.change(input, { target: { value: 'https://gw.example.test/v2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存覆盖' }));

    expect(await screen.findByText('服务端拒绝了该网关地址')).toBeInTheDocument();
    expect(screen.getByText(/cluster-internal hostname/)).toBeInTheDocument();
    expect(input).toHaveValue('https://gw.example.test/v2');
    expect(client.deploymentSettings).toHaveBeenCalledTimes(1);
  });

  test('read-only without deployment.write, blocked without deployment.read', async () => {
    const client = {
      deploymentSettings: vi.fn().mockResolvedValue(envSettings),
      updateDeploymentSettings: vi.fn(),
    };
    render(<DeploymentSettingsView client={client as never} identity={{ roles: [], permissions: ['deployment.read'] } as never} />);

    expect(await screen.findByText('https://gateway.example.test/v1')).toBeInTheDocument();
    expect(screen.getByText(/仅可查看部署设置/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '设置覆盖' })).not.toBeInTheDocument();
    cleanup();

    const deniedClient = { deploymentSettings: vi.fn(), updateDeploymentSettings: vi.fn() };
    render(<DeploymentSettingsView client={deniedClient as never} identity={{ roles: [], permissions: ['models.read'] } as never} />);
    expect(await screen.findByText('当前账号无权限查看部署运行时设置。')).toBeInTheDocument();
    expect(deniedClient.deploymentSettings).not.toHaveBeenCalled();
  });

  test('a server 403 degrades to the no-permission state', async () => {
    const client = {
      deploymentSettings: vi.fn().mockRejectedValue(new AdminRequestError(403, 'FORBIDDEN', 'deployment.read required')),
    };
    render(<DeploymentSettingsView client={client as never} />);
    expect(await screen.findByText('当前账号无权限查看部署运行时设置。')).toBeInTheDocument();
  });

  test('reports a load failure and retries', async () => {
    const client = {
      deploymentSettings: vi.fn()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(envSettings),
    };
    render(<DeploymentSettingsView client={client as never} />);

    expect(await screen.findByText('部署设置加载失败，请稍后重试。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('https://gateway.example.test/v1')).toBeInTheDocument();
  });
});
