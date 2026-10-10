/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { workbenchClient, workbenchIdentity, workbenchPortal } from './test-fixtures.js';
import { Workbench } from './Workbench.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWorkbench(portal = workbenchPortal(), overrides: Record<string, unknown> = {}) {
  const onSignOut = vi.fn();
  render(
    <Workbench
      client={workbenchClient()}
      identity={workbenchIdentity}
      canManage={false}
      route="workbench"
      themeControl={null}
      onSignOut={onSignOut}
      signingOut={false}
      portal={portal}
      {...overrides}
    />,
  );
  return { onSignOut };
}

// The workbench home is now the embedded messenger: the console mints the
// portal session server-side and fills the content area with the same-origin
// /companion/ iframe. The roster itself lives inside the messenger and is
// covered by its own UI verification, not by console unit tests.
describe('workbench messenger home', () => {
  test('mints the portal session, then embeds the companion messenger', async () => {
    const portal = workbenchPortal();
    renderWorkbench(portal);

    await waitFor(() => expect(portal.mintPortalSession).toHaveBeenCalled());
    const frame = await screen.findByTitle('消息');
    expect(frame).toHaveAttribute('src', '/companion/');
  });

  test('a failed mint surfaces a retryable alert instead of the iframe', async () => {
    const portal = workbenchPortal({ mintPortalSession: vi.fn().mockResolvedValue(502) });
    renderWorkbench(portal);

    expect(await screen.findByText('工作台会话建立失败，重试后再打开消息。')).toBeInTheDocument();
    expect(screen.queryByTitle('消息')).not.toBeInTheDocument();

    // antd 在两个汉字的按钮文案中自动插入空格（「重 试」）；按 textContent
    // 找按钮，避免同时命中含「重试」二字的警示文案。
    const retryButton = [...document.querySelectorAll('button')].find((b) => /重\s*试/.test(b.textContent ?? ''))!;
    fireEvent.click(retryButton);
    await waitFor(() => expect(portal.mintPortalSession).toHaveBeenCalledTimes(2));
  });

  test('an expired AEP session (401) offers re-login instead of endless retry', async () => {
    const portal = workbenchPortal({ mintPortalSession: vi.fn().mockResolvedValue(401) });
    const { onSignOut } = renderWorkbench(portal);

    expect(await screen.findByText('登录状态已过期，请重新登录后再操作。')).toBeInTheDocument();
    expect(screen.queryByTitle('消息')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('重新登录').closest('button')!);
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  test('keeps apply and my-requests entries reachable from the messenger bar', async () => {
    renderWorkbench(workbenchPortal());
    await screen.findByTitle('消息');
    expect(screen.getByRole('button', { name: /申请数字员工/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: '我的申请' })).toBeEnabled();
  });

  test('shows the admin console switch only to managers', async () => {
    renderWorkbench(workbenchPortal());
    await screen.findByTitle('消息');
    expect(screen.queryByRole('button', { name: '管理后台' })).not.toBeInTheDocument();

    cleanup();
    renderWorkbench(workbenchPortal(), { canManage: true });
    expect(await screen.findByRole('button', { name: '管理后台' })).toBeInTheDocument();
  });
});
