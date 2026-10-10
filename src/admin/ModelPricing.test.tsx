/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, expect, test, vi } from 'vitest';
import { type AdminConsoleClient, AdminRequestError } from './client.js';
import { ModelPricingDrawer } from './ModelPricing.js';
import { Models } from './Models.js';
import { administratorIdentity } from './test-fixtures.js';

vi.mock('./notifications.js', () => ({ notify: vi.fn() }));
afterEach(cleanup);
const model = { id: 'chat', displayName: '测试模型' };
const pricing = {
  currency: 'CNY',
  inputPricePerMillionTokens: '0.000001',
  outputPricePerMillionTokens: '0',
  source: '合同价',
};
const initial = { modelId: 'chat', version: 1, updatedAt: '2026-10-10T00:00:00Z', pricing };
function setup(readOnly = false) {
  const client = {
    getModelPricing: vi.fn().mockResolvedValue(initial),
    putModelPricing: vi.fn().mockResolvedValue({ ...initial, version: 2 }),
  };
  const onClose = vi.fn();
  const ui = render(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
      <ModelPricingDrawer
        client={client as unknown as AdminConsoleClient}
        model={model}
        canWrite={!readOnly}
        onClose={onClose}
      />
    </ConfigProvider>,
  );
  return { client, onClose, ...ui };
}

test('saves exact decimal strings, explicit free output and source with the observed version', async () => {
  const { client } = setup();
  await screen.findByText('已保存参考价格');
  const input = await screen.findByLabelText('输入单价 / 百万 Token');
  await waitFor(() => expect(input).toHaveValue('0.000001'));
  fireEvent.change(screen.getByLabelText('缓存命中输入单价 / 百万 Token'), { target: { value: '0.05' } });
  fireEvent.click(screen.getByRole('button', { name: '保存价格' }));
  await waitFor(() =>
    expect(client.putModelPricing).toHaveBeenCalledWith('chat', {
      pricing: { ...pricing, cachedInputPricePerMillionTokens: '0.05' },
      expectedVersion: 1,
    }),
  );
});

test('blocks invalid and missing prices without treating missing usage as free', async () => {
  const { client } = setup();
  await screen.findByText('已保存参考价格');
  const input = screen.getByLabelText('输入单价 / 百万 Token');
  await waitFor(() => expect(input).toHaveValue('0.000001'));
  fireEvent.change(input, { target: { value: '-1' } });
  fireEvent.click(screen.getByRole('button', { name: '保存价格' }));
  expect(await screen.findByText('请输入非负价格，最多 9 位整数、6 位小数。')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '保存价格' }));
  expect(await screen.findByText('请填写单价；免费模型请明确填写 0。')).toBeInTheDocument();
  expect(client.putModelPricing).not.toHaveBeenCalled();
});

test('retains input on failure and requires reload after a concurrent edit', async () => {
  const { client } = setup();
  await screen.findByText('已保存参考价格');
  const input = screen.getByLabelText('输入单价 / 百万 Token');
  await waitFor(() => expect(input).toHaveValue('0.000001'));
  fireEvent.change(input, { target: { value: '2.5' } });
  client.putModelPricing.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: '保存价格' }));
  expect(await screen.findByText('价格保存失败，已保留输入，请重试。')).toBeInTheDocument();
  expect(input).toHaveValue('2.5');
  client.putModelPricing.mockRejectedValueOnce(new AdminRequestError(409, 'MODEL_PRICING_VERSION_CONFLICT', null));
  fireEvent.click(screen.getByRole('button', { name: '保存价格' }));
  expect(await screen.findByText('价格已被其他管理员修改，请重新加载后再编辑。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存价格' })).toBeDisabled();
  client.getModelPricing.mockResolvedValueOnce({
    ...initial,
    version: 5,
    pricing: { ...pricing, inputPricePerMillionTokens: '8' },
  });
  fireEvent.click(screen.getByRole('button', { name: '重新加载价格' }));
  fireEvent.click(await screen.findByRole('button', { name: '放弃修改' }));
  await waitFor(() => expect(screen.getByLabelText('输入单价 / 百万 Token')).toHaveValue('8'));
  fireEvent.click(screen.getByRole('button', { name: '保存价格' }));
  await waitFor(() =>
    expect(client.putModelPricing).toHaveBeenLastCalledWith('chat', {
      pricing: { ...pricing, inputPricePerMillionTokens: '8' },
      expectedVersion: 5,
    }),
  );
});

test('clears configured prices with confirmation and preserves the new concurrency version', async () => {
  const { client } = setup();
  await screen.findByText('已保存参考价格');
  client.putModelPricing.mockResolvedValueOnce({ ...initial, version: 2, pricing: null });
  fireEvent.click(screen.getByRole('button', { name: '清除价格配置' }));
  const confirm = await screen.findByRole('tooltip');
  fireEvent.click(within(confirm).getByRole('button', { name: '清除价格配置' }));
  await waitFor(() =>
    expect(client.putModelPricing).toHaveBeenCalledWith('chat', { pricing: null, expectedVersion: 1 }),
  );
  expect(await screen.findByText('尚未配置价格')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '清除价格配置' })).toBeDisabled();
});

test('protects read-only access and unsaved edits on close', async () => {
  const { client, unmount } = setup(true);
  await screen.findByText('已保存参考价格');
  expect(screen.getByLabelText('输入单价 / 百万 Token')).toBeDisabled();
  expect(screen.queryByRole('button', { name: '保存价格' })).not.toBeInTheDocument();
  expect(client.putModelPricing).not.toHaveBeenCalled();
  unmount();
  const { onClose } = setup();
  await screen.findByText('已保存参考价格');
  const input = screen.getByLabelText('输入单价 / 百万 Token');
  await waitFor(() => expect(input).toHaveValue('0.000001'));
  fireEvent.change(input, { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect((await screen.findAllByText('放弃未保存的价格修改？')).length).toBeGreaterThan(0);
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

test('disables save for a missing backend and offers recovery from load failure', async () => {
  const client = {
    getModelPricing: vi
      .fn()
      .mockRejectedValueOnce(new AdminRequestError(404, null, null))
      .mockResolvedValue(initial),
    putModelPricing: vi.fn(),
  };
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <ModelPricingDrawer client={client as unknown as AdminConsoleClient} model={model} canWrite onClose={vi.fn()} />
    </ConfigProvider>,
  );
  expect(await screen.findByText('当前服务未提供价格配置接口，请先升级后端服务。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存价格' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('已保存参考价格')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存价格' })).toBeEnabled();
});

test('opens model-specific prices from the model list without data-plane permissions', async () => {
  const client = {
    models: vi.fn().mockResolvedValue({ models: [{ ...model, enabled: true }], assignments: [] }),
    resources: vi.fn().mockResolvedValue({ users: [], roles: [], teams: [] }),
    getModelPricing: vi.fn().mockResolvedValue(initial),
    dataPlane: vi.fn(),
  };
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <Models
        client={client as unknown as AdminConsoleClient}
        identity={{ ...administratorIdentity, permissions: ['models.read'], roles: ['reader'] }}
      />
    </ConfigProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '价格设置' }));
  expect(await screen.findByText('已保存参考价格')).toBeInTheDocument();
  expect(client.getModelPricing).toHaveBeenCalledWith('chat');
  expect(client.dataPlane).not.toHaveBeenCalled();
});
