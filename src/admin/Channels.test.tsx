// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App, ConfigProvider } from 'antd';
import { afterEach, expect, test, vi } from 'vitest';
import { Channels, EmployeeChannelsPanel } from './Channels.js';
import type { AdminConsoleClient } from './client.js';
import { type EmployeeChannels, type PortalClient, PortalError } from './portal.js';

const initial: EmployeeChannels = {
  employee: 'hr-bot',
  phase: 'Ready',
  runtimeAvailable: true,
  providers: ['feishu', 'wecom', 'wechat'].map((provider) => ({
    provider,
    enabled: true,
    runtimeReady: true,
    configured: false,
    hasSecret: false,
    values: {},
    workerState: 'unknown',
  })) as EmployeeChannels['providers'],
};

function mockPortal(data: EmployeeChannels = initial) {
  return {
    listEmployees: vi.fn().mockResolvedValue([{ name: 'hr-bot', displayName: '人事助理', phase: 'Ready' }]),
    employeeChannels: vi.fn().mockResolvedValue(data),
    activateChannel: vi.fn().mockResolvedValue(undefined),
    configureChannel: vi.fn().mockResolvedValue(undefined),
    restartChannel: vi.fn().mockResolvedValue(undefined),
    channelQR: vi.fn().mockResolvedValue({
      id: 'abcdefghijklmnop',
      status: 'pending',
      qrcode_content: 'disposable-test-qr',
      expires_in: 180,
    }),
  };
}

function panel(portal: ReturnType<typeof mockPortal>) {
  return render(
    <ConfigProvider>
      <App>
        <EmployeeChannelsPanel employeeName="hr-bot" portal={portal as unknown as PortalClient} />
      </App>
    </ConfigProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('shows Feishu, WeCom and WeChat with actual configuration actions', async () => {
  const portal = mockPortal();
  render(
    <ConfigProvider>
      <App>
        <Channels client={{} as AdminConsoleClient} portal={portal as unknown as PortalClient} />
      </App>
    </ConfigProvider>,
  );
  expect(await screen.findByText('飞书')).toBeInTheDocument();
  expect(screen.getByText('企业微信')).toBeInTheDocument();
  expect(screen.getByText('微信')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '配置接入' })).toHaveLength(3);
  expect(screen.getByRole('button', { name: '微信扫码接入' })).toBeEnabled();
  expect(screen.queryByText('通道运行中')).not.toBeInTheDocument();
});

test('enables an unconfigured employee before asking for credentials', async () => {
  const portal = mockPortal({
    ...initial,
    providers: initial.providers.map((item) => ({ ...item, enabled: false, runtimeReady: false })),
  });
  panel(portal);
  const row = (await screen.findByText('飞书')).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: /启用接入/ }));
  await waitFor(() => expect(portal.activateChannel).toHaveBeenCalledWith('hr-bot', 'feishu', true));
  expect(await screen.findByText(/已提交启用配置/)).toBeInTheDocument();
  expect(screen.queryByLabelText('App Secret')).not.toBeInTheDocument();
});

test('submits Feishu credentials through the employee API and clears the form', async () => {
  const portal = mockPortal();
  panel(portal);
  fireEvent.click(within((await screen.findByText('飞书')).closest('tr')!).getByRole('button', { name: '配置接入' }));
  fireEvent.change(await screen.findByLabelText('App ID'), { target: { value: 'cli-test' } });
  fireEvent.change(screen.getByLabelText('App Secret'), { target: { value: 'disposable-fixture' } });
  fireEvent.click(screen.getByRole('button', { name: '保存并连接' }));
  await waitFor(() =>
    expect(portal.configureChannel).toHaveBeenCalledWith('hr-bot', 'feishu', {
      app_id: 'cli-test',
      app_secret: 'disposable-fixture',
    }),
  );
  await waitFor(() => expect(screen.queryByDisplayValue('disposable-fixture')).not.toBeInTheDocument());
  expect(await screen.findByText(/渠道配置已提交/)).toBeInTheDocument();
});

test('updating an existing secret leaves it unchanged when the input is empty', async () => {
  const portal = mockPortal({
    ...initial,
    providers: initial.providers.map((item) =>
      item.provider === 'wecom' ? { ...item, configured: true, hasSecret: true, values: { bot_id: 'bot-demo' } } : item,
    ),
  });
  panel(portal);
  fireEvent.click(
    within((await screen.findByText('企业微信')).closest('tr')!).getByRole('button', { name: '更新凭据' }),
  );
  expect(await screen.findByLabelText('Bot Secret')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: '保存并连接' }));
  await waitFor(() => expect(portal.configureChannel).toHaveBeenCalledWith('hr-bot', 'wecom', { bot_id: 'bot-demo' }));
});

test('rejects missing required credentials and retains the modal on save failure', async () => {
  const portal = mockPortal();
  portal.configureChannel.mockRejectedValue(new PortalError(400, '请检查平台权限', 'CHANNEL_CONFIGURATION_REJECTED'));
  panel(portal);
  fireEvent.click(within((await screen.findByText('飞书')).closest('tr')!).getByRole('button', { name: '配置接入' }));
  fireEvent.click(screen.getByRole('button', { name: '保存并连接' }));
  expect(await screen.findAllByText('请填写此项')).not.toHaveLength(0);
  expect(portal.configureChannel).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('App ID'), { target: { value: 'cli-test' } });
  fireEvent.change(screen.getByLabelText('App Secret'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: '保存并连接' }));
  expect(await within(screen.getByRole('dialog')).findByText('请检查平台权限')).toBeInTheDocument();
});

test('a runtime error is not presented as an empty channel list or a healthy connection', async () => {
  const portal = mockPortal();
  portal.employeeChannels.mockRejectedValue(new Error('upstream down'));
  panel(portal);
  expect(await screen.findAllByText('渠道信息加载失败，请重试。')).not.toHaveLength(0);
  expect(screen.queryByRole('button', { name: '保存并连接' })).not.toBeInTheDocument();
  expect(screen.queryByText('通道运行中')).not.toBeInTheDocument();
});

test('provider rollout gates configuration and exposes pending status', async () => {
  const portal = mockPortal({
    ...initial,
    providers: initial.providers.map((item) => ({ ...item, runtimeReady: false })),
  });
  panel(portal);
  await screen.findByText('飞书');
  expect(screen.getAllByText('等待配置生效')).toHaveLength(3);
  for (const button of screen.getAllByRole('button', { name: '配置接入' })) expect(button).toBeDisabled();
});

test('WeChat QR result is obtained from the server and canceled when closed', async () => {
  const portal = mockPortal();
  panel(portal);
  fireEvent.click(await screen.findByRole('button', { name: '微信扫码接入' }));
  expect(await screen.findByText('请使用微信扫描二维码并确认接入。')).toBeInTheDocument();
  expect(portal.channelQR).toHaveBeenCalledWith('hr-bot', 'qr-login', undefined, undefined, expect.any(AbortSignal));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^关\s*闭$/ }));
  await waitFor(() => expect(portal.channelQR).toHaveBeenCalledWith('hr-bot', 'qr-cancel', 'abcdefghijklmnop'));
});

test('confirmed QR updates configuration without claiming message delivery success', async () => {
  const portal = mockPortal();
  portal.channelQR
    .mockResolvedValueOnce({ id: 'abcdefghijklmnop', status: 'pending', qrcode_content: 'test-qr', expires_in: 180 })
    .mockResolvedValueOnce({ id: 'abcdefghijklmnop', status: 'confirmed', qrcode_content: 'test-qr', expires_in: 160 });
  panel(portal);
  fireEvent.click(await screen.findByRole('button', { name: '微信扫码接入' }));
  fireEvent.click(await screen.findByRole('button', { name: '检查扫码结果' }));
  expect(await screen.findAllByText('微信接入已确认，请刷新状态并发送消息验证。')).not.toHaveLength(0);
  expect(portal.employeeChannels).toHaveBeenCalledTimes(2);
});
