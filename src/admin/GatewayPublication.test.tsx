// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { type AdminConsoleClient, AdminRequestError } from './client.js';
import { GatewayPublication } from './GatewayPublication.js';
import { translate } from './i18n.js';
import type { DataPlanePublication } from './publication-contract.js';
import { administratorIdentity } from './test-fixtures.js';

const id = '11111111-1111-4111-8111-111111111111';
const operation = (phase: DataPlanePublication['phase'] = 'projected'): DataPlanePublication => ({
  operationId: id,
  deploymentId: 'demo',
  revision: 'r1',
  contentHash: 'a'.repeat(64),
  phase,
  createdAt: '2026-10-15T00:00:00Z',
  updatedAt: '2026-10-15T00:00:01Z',
  idempotencyExpiresAt: '2099-10-16T00:00:00Z',
  errorCode: null,
  conditions: ['Accepted', 'Applied', 'Ready'].map((type) => ({
    type: type as 'Accepted' | 'Applied' | 'Ready',
    status: type === 'Ready' ? 'Unknown' : 'True',
    observedRevision: type === 'Ready' ? null : 'r1',
    reason: type === 'Ready' ? 'DataPlaneNotObserved' : 'OperatorConfirmed',
    lastTransitionTime: '2026-10-15T00:00:01Z',
  })),
});
const client = () => ({
  publicationScope: 'test-endpoint/demo',
  createDataPlanePublication: vi.fn().mockResolvedValue(operation('queued')),
  getDataPlanePublication: vi.fn().mockResolvedValue(operation()),
  publishDataPlaneRoutes: vi.fn(),
});
function view(c: ReturnType<typeof client>, props: Partial<React.ComponentProps<typeof GatewayPublication>> = {}) {
  return render(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }} theme={{ token: { motion: false } }}>
      <GatewayPublication
        language="zh"
        client={c as unknown as AdminConsoleClient}
        identity={administratorIdentity}
        allowPublish
        {...props}
      />
    </ConfigProvider>,
  );
}
async function publish() {
  fireEvent.click(await screen.findByRole('button', { name: '发布路由' }));
  fireEvent.click(within(await screen.findByRole('tooltip')).getByRole('button', { name: '发布路由' }));
}
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('asynchronous route publication', () => {
  test('localizes confirmation, conditions and an existing error when language changes', async () => {
    const c = client();
    c.createDataPlanePublication.mockRejectedValueOnce(new AdminRequestError(403, 'FORBIDDEN', null));
    const ui = view(c, { language: 'en' });
    expect(screen.getByText(translate('en', 'publicationTitle'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: translate('en', 'publicationAction') }));
    const confirm = within(await screen.findByRole('tooltip'));
    expect(confirm.getByRole('button', { name: translate('en', 'cancel') })).toBeInTheDocument();
    fireEvent.click(confirm.getByRole('button', { name: translate('en', 'publicationAction') }));
    await screen.findByText(translate('en', 'publicationForbidden'));
    ui.rerender(
      <ConfigProvider wave={{ disabled: true }} theme={{ token: { motion: false } }}>
        <GatewayPublication
          language="zh"
          client={c as unknown as AdminConsoleClient}
          identity={administratorIdentity}
          allowPublish
        />
      </ConfigProvider>,
    );
    expect(screen.getByText(translate('zh', 'publicationForbidden'))).toBeInTheDocument();
    expect(c.createDataPlanePublication).toHaveBeenCalledTimes(1);
    ui.unmount();
    c.publicationScope = 'english-observation';
    view(c, { language: 'en' });
    fireEvent.click(screen.getByRole('button', { name: translate('en', 'publicationAction') }));
    fireEvent.click(
      within(await screen.findByRole('tooltip')).getByRole('button', { name: translate('en', 'publicationAction') }),
    );
    await screen.findByText(translate('en', 'publicationDataPlaneNotObserved'));
    expect(screen.getByRole('columnheader', { name: translate('en', 'status') })).toBeInTheDocument();
    expect(screen.queryByText(translate('zh', 'publicationTitle'))).not.toBeInTheDocument();
  });
  test('acceptance is not readiness; restores observation after remount without another POST', async () => {
    const c = client();
    const ui = view(c);
    expect(await screen.findByText(/当前会话尚未记录/)).toBeInTheDocument();
    await publish();
    expect(await screen.findByText('配置已投递')).toBeInTheDocument();
    expect(screen.getByText('尚未提供独立的数据面生效证据')).toBeInTheDocument();
    expect(c.publishDataPlaneRoutes).not.toHaveBeenCalled();
    const saved = Object.values(sessionStorage).join('');
    expect(saved).toContain(id);
    expect(saved).not.toContain('contentHash');
    ui.unmount();
    view(c, { allowPublish: false });
    await screen.findByText('配置已投递');
    expect(c.createDataPlanePublication).toHaveBeenCalledTimes(1);
    expect(c.getDataPlanePublication).toHaveBeenCalledWith(id);
    expect(screen.queryByRole('button', { name: '发布路由' })).not.toBeInTheDocument();
  });
  test('retries an uncertain write with the same key, including after remount', async () => {
    const c = client();
    c.createDataPlanePublication.mockRejectedValueOnce(new Error('network'));
    const ui = view(c);
    await publish();
    await screen.findByText(/未能确认发布结果/);
    const key = c.createDataPlanePublication.mock.calls[0]?.[0];
    ui.unmount();
    view(c);
    fireEvent.click(await screen.findByRole('button', { name: '重试同一次发布' }));
    await screen.findByText('配置已投递');
    expect(c.createDataPlanePublication.mock.calls.map((args) => args[0])).toEqual([key, key]);
    expect(c.publishDataPlaneRoutes).not.toHaveBeenCalled();
  });
  test.each([
    [503, 'DATA_PLANE_PUBLICATIONS_DISABLED', /尚未提供或启用异步发布/],
    [404, 'NOT_FOUND', /尚未提供或启用异步发布/],
    [403, 'FORBIDDEN', /服务拒绝/],
  ])('never falls back for POST %i', async (status, code, message) => {
    const c = client();
    c.createDataPlanePublication.mockRejectedValue(new AdminRequestError(status, code, 'private diagnostic'));
    view(c);
    await publish();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument();
    expect(c.publishDataPlaneRoutes).not.toHaveBeenCalled();
  });
  test('keeps the operation when GET fails and allows manual retry', async () => {
    const c = client();
    c.getDataPlanePublication.mockRejectedValueOnce(new AdminRequestError(404, 'RESOURCE_NOT_FOUND', null));
    view(c);
    await publish();
    await screen.findByText(/发布操作不存在或已过期/);
    fireEvent.click(screen.getByRole('button', { name: '刷新发布进度' }));
    await screen.findByText('配置已投递');
    expect(c.createDataPlanePublication).toHaveBeenCalledTimes(1);
  });
  test('does not expose or query another account or endpoint pointer', async () => {
    const c = client();
    const ui = view(c);
    await publish();
    await screen.findByText('配置已投递');
    ui.unmount();
    c.getDataPlanePublication.mockClear();
    const other = view(c, { identity: { ...administratorIdentity, user: { id: 'other', displayName: 'Other' } } });
    await screen.findByText(/当前会话尚未记录/);
    expect(c.getDataPlanePublication).not.toHaveBeenCalled();
    other.unmount();
    c.publicationScope = 'other-endpoint/demo';
    view(c);
    await screen.findByText(/当前会话尚未记录/);
    expect(c.getDataPlanePublication).not.toHaveBeenCalled();
  });
  test('does not perform reads or writes without data-plane permission', async () => {
    const c = client();
    view(c, { identity: { ...administratorIdentity, roles: [], permissions: ['models.read'] } });
    expect(screen.queryByText('路由发布进度')).not.toBeInTheDocument();
    expect(c.createDataPlanePublication).not.toHaveBeenCalled();
    expect(c.getDataPlanePublication).not.toHaveBeenCalled();
  });
  test('switches accounts without observing the previous account operation', async () => {
    const c = client();
    const ui = view(c);
    await publish();
    await screen.findByText('配置已投递');
    c.getDataPlanePublication.mockClear();
    ui.rerender(
      <ConfigProvider
        button={{ autoInsertSpace: false }}
        wave={{ disabled: true }}
        theme={{ token: { motion: false } }}
      >
        <GatewayPublication
          language="zh"
          client={c as unknown as AdminConsoleClient}
          identity={{ ...administratorIdentity, user: { id: 'switched', displayName: 'Other' } }}
          allowPublish
        />
      </ConfigProvider>,
    );
    expect(await screen.findByText(/当前会话尚未记录/)).toBeInTheDocument();
    expect(screen.queryByText(id)).not.toBeInTheDocument();
    expect(c.getDataPlanePublication).not.toHaveBeenCalled();
  });
  test('storage failure leaves the current operation usable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('blocked');
    });
    const c = client();
    c.publicationScope = 'blocked-storage';
    const ui = view(c);
    await publish();
    await screen.findByText('配置已投递');
    ui.unmount();
    view(c);
    await screen.findByText('配置已投递');
    expect(c.createDataPlanePublication).toHaveBeenCalledTimes(1);
  });
  test('an expired uncertain attempt requires explicit new publication', async () => {
    const c = client();
    c.createDataPlanePublication.mockRejectedValue(new Error('network'));
    const ui = view(c);
    await publish();
    await screen.findByText(/未能确认发布结果/);
    ui.unmount();
    const storageKey = sessionStorage.key(0)!;
    const saved = JSON.parse(sessionStorage.getItem(storageKey)!);
    saved.expiresAt = 1;
    sessionStorage.setItem(storageKey, JSON.stringify(saved));
    view(c);
    await screen.findByText(/原幂等键的保留期限已到/);
    expect(screen.queryByRole('button', { name: '重试同一次发布' })).not.toBeInTheDocument();
    await publish();
    await waitFor(() => expect(c.createDataPlanePublication).toHaveBeenCalledTimes(2));
    expect(c.createDataPlanePublication.mock.calls[0]?.[0]).not.toBe(c.createDataPlanePublication.mock.calls[1]?.[0]);
  });
  test('polls projection with unknown application, then stops after Applied', async () => {
    const c = client();
    const unknown = operation();
    c.getDataPlanePublication.mockResolvedValue({
      ...unknown,
      conditions: unknown.conditions.map((v) => ({ ...v, status: 'Unknown', observedRevision: null })),
    });
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    view(c);
    await publish();
    await screen.findByText('配置已投递');
    const retry = schedule.mock.calls.find((args) => args[1] === 2000)?.[0];
    expect(typeof retry).toBe('function');
    c.getDataPlanePublication.mockResolvedValue(operation());
    await act(async () => {
      if (typeof retry === 'function') retry();
    });
    expect(c.getDataPlanePublication).toHaveBeenCalledTimes(2);
    expect(schedule.mock.calls.filter((args) => args[1] === 2000)).toHaveLength(1);
  });
  test('bounds automatic polling and offers manual refresh without resubmitting', async () => {
    const c = client();
    const ui = view(c);
    await publish();
    await screen.findByText('配置已投递');
    ui.unmount();
    const op = operation();
    c.getDataPlanePublication.mockResolvedValue({
      ...op,
      conditions: op.conditions.map((v) => ({ ...v, status: 'Unknown', observedRevision: null })),
    });
    c.getDataPlanePublication.mockClear();
    vi.useFakeTimers();
    await act(async () => {
      view(c);
      await vi.advanceTimersByTimeAsync(60000);
    });
    // Start the effect before advancing the rest of its bounded timer chain.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(c.getDataPlanePublication).toHaveBeenCalledTimes(30);
    expect(screen.getByText(/自动查询已暂停/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新发布进度' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(c.getDataPlanePublication).toHaveBeenCalledTimes(31);
    expect(c.createDataPlanePublication).toHaveBeenCalledTimes(1);
  });
  test.each(['failed', 'superseded'] as const)(
    'displays terminal %s phase without success inference',
    async (phase) => {
      const c = client();
      const op = operation(phase);
      c.getDataPlanePublication.mockResolvedValue({
        ...op,
        conditions: op.conditions.map((v) => ({ ...v, status: 'Unknown', observedRevision: null })),
      });
      view(c);
      await publish();
      await screen.findByText(phase === 'failed' ? '配置投递失败' : '已被更新发布替代');
      expect(screen.getAllByText('未确认').length).toBeGreaterThan(0);
      expect(c.createDataPlanePublication).toHaveBeenCalledTimes(1);
    },
  );
});
