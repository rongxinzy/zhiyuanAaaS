/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminApp } from './App.js';
import { AdminConsoleClient, AdminMetadataError } from './client.js';
import { PortalClient } from './portal.js';
import { administratorIdentity } from './test-fixtures.js';

vi.mock('./Resources.js', () => ({
  Resources: ({ tab }: { tab: string }) => <div data-testid="resource">{tab}</div>,
}));
vi.mock('./Models.js', () => ({ Models: () => <div>model-content</div> }));
vi.mock('./GatewayWorkbench.js', () => ({
  GatewayCall: () => <div>gateway-call-content</div>,
  GatewayObservation: () => <div>gateway-observe-content</div>,
  GatewayLimits: () => <div>gateway-limits-content</div>,
}));
vi.mock('./ServiceStatus.js', () => ({
  KnowledgeView: () => <div>knowledge-content</div>,
  ServicesView: () => <div>services-content</div>,
}));
vi.mock('./DigitalEmployees.js', () => ({
  DigitalEmployees: () => <div>employee-content</div>,
}));
vi.mock('./Operations.js', () => ({
  Operations: () => <div>license-content</div>,
  SessionsView: () => <div>session-content</div>,
  CredentialsView: () => <div>credentials-content</div>,
  ConfigurationStatusView: () => <div>configuration-content</div>,
  DeploymentSettingsView: () => <div>deployment-settings-content</div>,
}));
vi.mock('./Identity.js', () => ({
  Identity: () => <div>mapping-content</div>,
}));

describe('Ant Design admin shell', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.spyOn(PortalClient.prototype, 'listEmployees').mockResolvedValue([]);
    vi.spyOn(PortalClient.prototype, 'listRequests').mockResolvedValue([]);
    vi.spyOn(PortalClient.prototype, 'myRequests').mockResolvedValue([]);
    vi.spyOn(PortalClient.prototype, 'me').mockResolvedValue({
      user: { id: 'user-1', displayName: '张三', kind: 'human' },
      teams: [],
      quota: { limit: 2, used: 0, owned: 0, pending: 0 },
      policyMode: 'approval',
      defaultModel: 'bench-glm',
    });
    localStorage.clear();
    vi.spyOn(AdminConsoleClient.prototype, 'restore').mockResolvedValue({
      status: 'signed-out',
    });
    vi.spyOn(AdminConsoleClient.prototype, 'login').mockResolvedValue({
      status: 'authenticated',
      identity: administratorIdentity,
    });
    vi.spyOn(AdminConsoleClient.prototype, 'logout').mockResolvedValue();
    vi.spyOn(AdminConsoleClient.prototype, 'overview').mockResolvedValue({
      users: 4,
      teams: 2,
      skills: 3,
      models: 1,
      pendingEvents: 0,
    });
    vi.spyOn(AdminConsoleClient.prototype, 'searchAudit').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  function authenticated() {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'authenticated',
      identity: administratorIdentity,
    });
  }
  test('requires administrator credentials and submits them without an enterprise ID', async () => {
    render(<AdminApp />);
    expect(await screen.findByLabelText('用户名')).toHaveValue('');
    expect(screen.queryByLabelText('部署 ID')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('企业 ID')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await screen.findAllByText('请填写用户名和密码。');
    expect(AdminConsoleClient.prototype.login).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('用户名'), {
      target: { value: ' alice ' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'test-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() =>
      expect(AdminConsoleClient.prototype.login).toHaveBeenCalledWith({
        username: 'alice',
        password: 'test-password',
      }),
    );
    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
  });
  test('trims whitespace around the password before signing in', async () => {
    render(<AdminApp />);
    fireEvent.change(await screen.findByLabelText('用户名'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '  test-password  ' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() =>
      expect(AdminConsoleClient.prototype.login).toHaveBeenCalledWith({
        username: 'admin',
        password: 'test-password',
      }),
    );
  });
  test('shows a recoverable login error', async () => {
    vi.mocked(AdminConsoleClient.prototype.login).mockRejectedValue(new Error('denied'));
    render(<AdminApp />);
    fireEvent.change(await screen.findByLabelText('用户名'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('登录失败，请检查账号信息或稍后重试。');
    expect(screen.getByRole('button', { name: '登录' })).not.toBeDisabled();
  });
  test('explains when the server metadata does not name a deployment', async () => {
    vi.mocked(AdminConsoleClient.prototype.login).mockRejectedValue(
      new AdminMetadataError('AEP server metadata could not be retrieved.'),
    );
    render(<AdminApp />);
    fireEvent.change(await screen.findByLabelText('用户名'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'test-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('无法获取部署信息，请确认企业管控服务可用后重试。');
    expect(screen.getByRole('button', { name: '登录' })).not.toBeDisabled();
  });
  test('renders eight business entries without legacy navigation', async () => {
    authenticated();
    render(<AdminApp />);
    await screen.findByRole('heading', { name: '概览' });
    expect(screen.getAllByRole('menuitem')).toHaveLength(8);
    for (const name of ['概览', '数字员工', '知识库', '技能管理', '用户管理', '模型网关', '日志审计', '系统管理'])
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    for (const name of ['资源管理', '身份对齐', '平台运维', '数据平面'])
      expect(screen.queryByRole('menuitem', { name })).not.toBeInTheDocument();
  });
  test('hides unauthorized entries and rejects direct navigation', async () => {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'authenticated',
      identity: {
        ...administratorIdentity,
        roles: [],
        permissions: ['models.read'],
      },
    });
    render(<AdminApp />);
    expect(await screen.findByRole('menuitem', { name: '模型网关' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '系统管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '用户管理' })).not.toBeInTheDocument();
    await act(async () => {
      window.location.hash = 'users';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByText('没有管理权限')).toBeInTheDocument();
    expect(screen.queryByTestId('resource')).not.toBeInTheDocument();
  });
  test('preserves legacy links and supports browser route changes', async () => {
    authenticated();
    window.location.hash = 'identity';
    render(<AdminApp />);
    expect(await screen.findByText('mapping-content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '登录会话' }));
    expect(await screen.findByText('session-content')).toBeInTheDocument();
    expect(window.location.hash).toBe('#users/sessions');
  });
  test('moves all model service content into one top-level underline tab list', async () => {
    authenticated();
    render(<AdminApp />);
    fireEvent.click(await screen.findByRole('menuitem', { name: '模型网关' }));
    expect(await screen.findByText('model-content')).toBeInTheDocument();
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '模型列表',
      '接入配置',
      '配置生效详情',
      '模型调用检测',
      '用量与错误观测',
      '限流配额',
    ]);
    expect(screen.getByRole('tab', { name: '模型列表' }).closest('.ant-tabs')).not.toHaveClass('ant-tabs-card');
    fireEvent.click(screen.getByRole('tab', { name: '接入配置' }));
    expect(await screen.findByText('credentials-content')).toBeInTheDocument();
    expect(window.location.hash).toBe('#model-gateway/connections');
    fireEvent.click(screen.getByRole('tab', { name: '配置生效详情' }));
    expect(await screen.findByText('configuration-content')).toBeInTheDocument();
    expect(window.location.hash).toBe('#model-gateway/configuration');
    fireEvent.click(screen.getByRole('menuitem', { name: '系统管理' }));
    await screen.findByRole('tab', { name: '渠道接入' });
    expect(screen.queryByRole('tab', { name: '模型服务' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '模型列表' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '渠道接入' })).toHaveAttribute('aria-selected', 'true');
  });
  test('navigates from the narrow viewport drawer and closes it after selection', async () => {
    authenticated();
    render(<AdminApp />);
    fireEvent.click(await screen.findByRole('button', { name: '主导航' }));
    const drawer = await screen.findByRole('dialog');
    fireEvent.click(within(drawer).getByRole('menuitem', { name: '模型网关' }));
    expect(await screen.findByText('model-content')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '主导航' })).toHaveAttribute('aria-expanded', 'false'),
    );
  });
  test.each([
    ['models', 'model-content'],
    ['models/connections', 'credentials-content'],
    ['models/configuration', 'configuration-content'],
    ['system/models', 'model-content'],
    ['system/models/catalog', 'model-content'],
    ['system/models/connections', 'credentials-content'],
    ['system/models/configuration', 'configuration-content'],
    ['system/connections', 'credentials-content'],
    ['system/configuration', 'configuration-content'],
  ])('preserves the legacy model service link %s', async (route, content) => {
    authenticated();
    window.location.hash = route;
    render(<AdminApp />);
    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '模型网关' })).toHaveClass('ant-menu-item-selected');
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
  });
  test.each([
    ['models.read', '模型列表', 'model-content', 3],
    ['credentials.read', '接入配置', 'credentials-content', 1],
    ['data_plane.write', '配置生效详情', 'configuration-content', 1],
  ])('defaults the gateway to the first permitted tab for %s', async (permission, label, content, count) => {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'authenticated',
      identity: { ...administratorIdentity, roles: [], permissions: [permission] },
    });
    window.location.hash = 'model-gateway';
    render(<AdminApp />);
    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(count);
    expect(screen.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
  });
  test('rejects gateway tabs without permission, including legacy links', async () => {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'authenticated',
      identity: { ...administratorIdentity, roles: [], permissions: ['models.read'] },
    });
    window.location.hash = 'system/models/connections';
    render(<AdminApp />);
    expect(await screen.findByText('没有管理权限')).toBeInTheDocument();
    expect(screen.queryByText('credentials-content')).not.toBeInTheDocument();
  });
  test.each([
    ['call', 'gateway-call-content'],
    ['observe', 'gateway-observe-content'],
    ['limits', 'gateway-limits-content'],
  ])('opens the gateway %s route in the existing top-level tabs', async (route, content) => {
    authenticated();
    window.location.hash = `model-gateway/${route}`;
    render(<AdminApp />);
    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
  });
  test.each([['models.read'], ['data_plane.write']])('denies limits with only %s permission', async (permission) => {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'authenticated',
      identity: { ...administratorIdentity, roles: [], permissions: [permission] },
    });
    window.location.hash = 'model-gateway/limits';
    render(<AdminApp />);
    expect(await screen.findByText('没有管理权限')).toBeInTheDocument();
    expect(screen.queryByText('gateway-limits-content')).not.toBeInTheDocument();
  });
  test('allows limits with both model read and data-plane write permissions', async () => {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'authenticated',
      identity: { ...administratorIdentity, roles: [], permissions: ['models.read', 'data_plane.write'] },
    });
    window.location.hash = 'model-gateway/limits';
    render(<AdminApp />);
    expect(await screen.findByText('gateway-limits-content')).toBeInTheDocument();
  });
  test('renders the deployment settings surface under system settings', async () => {
    authenticated();
    window.location.hash = 'system/settings';
    render(<AdminApp />);
    expect(await screen.findByText('deployment-settings-content')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '基本设置' })).toBeInTheDocument();
  });
  test('keeps unknown counts distinct from zero and refreshes failures', async () => {
    authenticated();
    vi.mocked(AdminConsoleClient.prototype.overview).mockResolvedValueOnce({
      users: 4,
      teams: null,
      skills: 3,
      models: 1,
      pendingEvents: 0,
      failed: ['teams'],
    });
    render(<AdminApp />);
    expect(await screen.findByText('暂无法获取')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('部分概览数据');
    await waitFor(() => expect(screen.getByRole('button', { name: /刷新/ })).not.toHaveClass('ant-btn-loading'));
    fireEvent.click(screen.getByRole('button', { name: /刷新/ }));
    await waitFor(() => expect(AdminConsoleClient.prototype.overview).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('暂无法获取')).not.toBeInTheDocument());
  });
  test('routes forbidden users into the workbench instead of a 403 wall', async () => {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'forbidden',
      identity: administratorIdentity,
    });
    render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: '我的工作台' })).toBeInTheDocument();
    expect(screen.queryByText('没有管理权限')).not.toBeInTheDocument();
    // No admin sidebar for employees.
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#workbench'));
    // Signing out from the workbench header returns to the login screen.
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(await screen.findByRole('heading', { name: '登录企业管理后台' })).toBeInTheDocument();
    expect(AdminConsoleClient.prototype.logout).toHaveBeenCalledOnce();
  });
  test('funnels admin deep links into the workbench for forbidden users', async () => {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'forbidden',
      identity: administratorIdentity,
    });
    window.location.hash = 'employees';
    render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: '我的工作台' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#workbench'));
  });
  test('lets administrators switch between the console and the workbench', async () => {
    authenticated();
    render(<AdminApp />);
    await screen.findByRole('heading', { name: '概览' });
    fireEvent.click(screen.getByRole('button', { name: '工作台' }));
    expect(await screen.findByRole('heading', { name: '我的工作台' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#workbench');
    fireEvent.click(screen.getByRole('button', { name: '管理后台' }));
    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
  });
  test('forces a password change before entering the console when the session requires it', async () => {
    const changePassword = vi
      .spyOn(AdminConsoleClient.prototype, 'changePassword')
      .mockResolvedValue({ status: 'authenticated', identity: administratorIdentity });
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'authenticated',
      identity: { ...administratorIdentity, passwordChangeRequired: true },
    });
    render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: '设置新密码后继续' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-password-123' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));
    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        newPassword: 'new-password-123',
      }),
    );
    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
    // Let pending antd Button loading frames settle before teardown; stragglers
    // touch `window` after jsdom is gone and fail loaded CI runners as
    // unhandled errors.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });
  test('blocks a mismatched confirmation and keeps the forced change form on failure', async () => {
    const changePassword = vi
      .spyOn(AdminConsoleClient.prototype, 'changePassword')
      .mockRejectedValue(new Error('denied'));
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: 'authenticated',
      identity: { ...administratorIdentity, passwordChangeRequired: true },
    });
    render(<AdminApp />);
    fireEvent.change(await screen.findByLabelText('新密码'), { target: { value: 'new-password-123' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-password-456' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));
    await screen.findAllByText('两次输入的新密码不一致。');
    expect(changePassword).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('密码修改失败');
    expect(screen.getByRole('heading', { name: '设置新密码后继续' })).toBeInTheDocument();
    // Same settle flush as the success path: keep antd Button loading frames
    // inside the live jsdom window.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });
});
