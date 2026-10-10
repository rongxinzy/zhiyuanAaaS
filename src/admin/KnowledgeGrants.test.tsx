// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App, ConfigProvider } from 'antd';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeGrants } from './KnowledgeGrants.js';
import type { PortalClient } from './portal.js';
import { PortalError } from './portal.js';

function makePortal(overrides: Partial<PortalClient> = {}) {
  return {
    listManagedKnowledgeGrants: vi.fn().mockResolvedValue({
      knowledge_base_id: 'kb-1',
      tenant_id: 'tenant-1',
      grants: [{ type: 'user', id: 'user-1', granted_by: 'admin-1', created_at: '2026-10-10T00:00:00Z' }],
    }),
    replaceManagedKnowledgeGrants: vi.fn().mockImplementation(async (_base, grants) => ({
      knowledge_base_id: 'kb-1',
      tenant_id: 'tenant-1',
      grants,
    })),
    ...overrides,
  } as unknown as PortalClient;
}

function renderGrants(portal: PortalClient) {
  return render(
    <ConfigProvider>
      <App>
        <KnowledgeGrants portal={portal} baseId="kb-1" />
      </App>
    </ConfigProvider>,
  );
}

describe('KnowledgeGrants', () => {
  afterEach(() => cleanup());

  test('blocks grant writes until the current base has loaded', async () => {
    let resolveGrants!: (value: { knowledge_base_id: string; tenant_id: string; grants: [] }) => void;
    const portal = makePortal({
      listManagedKnowledgeGrants: vi.fn().mockImplementation(() => new Promise((resolve) => (resolveGrants = resolve))),
    });
    renderGrants(portal);
    expect(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsSave') })).toBeDisabled();
    expect(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsRevokeAll') })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(translate(ADMIN_LANGUAGE, 'knowledgeGrantUserId')), {
      target: { value: 'user-2' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(translate(ADMIN_LANGUAGE, 'knowledgeGrantUserId')), {
      key: 'Enter',
      code: 'Enter',
    });
    expect(portal.replaceManagedKnowledgeGrants).not.toHaveBeenCalled();
    resolveGrants({ knowledge_base_id: 'kb-1', tenant_id: 'tenant-1', grants: [] });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsSave') })).toBeEnabled(),
    );
  });

  test('ignores an old base response and clears the previous base draft', async () => {
    let resolveFirst!: (value: {
      knowledge_base_id: string;
      tenant_id: string;
      grants: { type: 'user'; id: string }[];
    }) => void;
    const portal = makePortal({
      listManagedKnowledgeGrants: vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce({ knowledge_base_id: 'kb-2', tenant_id: 'tenant-1', grants: [] }),
    });
    const view = render(
      <ConfigProvider>
        <App>
          <KnowledgeGrants portal={portal} baseId="kb-1" />
        </App>
      </ConfigProvider>,
    );
    view.rerender(
      <ConfigProvider>
        <App>
          <KnowledgeGrants portal={portal} baseId="kb-2" />
        </App>
      </ConfigProvider>,
    );
    await waitFor(() => expect(screen.queryByText('user-1')).not.toBeInTheDocument());
    resolveFirst({
      knowledge_base_id: 'kb-1',
      tenant_id: 'tenant-1',
      grants: [{ type: 'user', id: 'stale-user' }],
    });
    await waitFor(() => expect(portal.listManagedKnowledgeGrants).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('stale-user')).not.toBeInTheDocument();
    expect(portal.replaceManagedKnowledgeGrants).not.toHaveBeenCalled();
  });

  test('resets saving when the base changes and ignores the old save response', async () => {
    let resolveOldSave!: () => void;
    const portal = makePortal({
      listManagedKnowledgeGrants: vi.fn().mockImplementation(async (baseId: string) => ({
        knowledge_base_id: baseId,
        tenant_id: 'tenant-1',
        grants: [{ type: 'user' as const, id: baseId === 'kb-1' ? 'user-old' : 'user-new' }],
      })),
      replaceManagedKnowledgeGrants: vi
        .fn()
        .mockImplementationOnce(
          (_base, grants) =>
            new Promise(
              (resolve) =>
                (resolveOldSave = () =>
                  resolve({
                    knowledge_base_id: 'kb-1',
                    tenant_id: 'tenant-1',
                    grants,
                  })),
            ),
        )
        .mockImplementation(async (baseId, grants) => ({
          knowledge_base_id: baseId,
          tenant_id: 'tenant-1',
          grants,
        })),
    });
    const view = render(
      <ConfigProvider>
        <App>
          <KnowledgeGrants portal={portal} baseId="kb-1" />
        </App>
      </ConfigProvider>,
    );
    await screen.findByText('user-old');
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsSave') }));
    await waitFor(() => expect(portal.replaceManagedKnowledgeGrants).toHaveBeenCalledTimes(1));
    view.rerender(
      <ConfigProvider>
        <App>
          <KnowledgeGrants portal={portal} baseId="kb-2" />
        </App>
      </ConfigProvider>,
    );
    await screen.findByText('user-new');
    const saveButton = screen.getByRole('button', { name: /保存授权/ });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);
    await waitFor(() => expect(portal.replaceManagedKnowledgeGrants).toHaveBeenCalledTimes(2));
    resolveOldSave();
    await waitFor(() => expect(screen.getByText('user-new')).toBeInTheDocument());
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeGrantsEmpty'))).not.toBeInTheDocument();
  });

  test('loads the server grant set and replaces it with the edited user/team list', async () => {
    const portal = makePortal();
    renderGrants(portal);
    expect(await screen.findByText('user-1')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(translate(ADMIN_LANGUAGE, 'knowledgeGrantUserId')), {
      target: { value: 'user-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantAddUser') }));
    fireEvent.change(screen.getByPlaceholderText(translate(ADMIN_LANGUAGE, 'knowledgeGrantTeamId')), {
      target: { value: 'team-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantAddTeam') }));
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsSave') }));

    await waitFor(() =>
      expect(portal.replaceManagedKnowledgeGrants).toHaveBeenCalledWith('kb-1', [
        { type: 'user', id: 'user-1' },
        { type: 'user', id: 'user-2' },
        { type: 'team', id: 'team-1' },
      ]),
    );
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeGrantsSaved'))).toBeInTheDocument();
  });

  test('requires explicit confirmation before replacing all grants with an empty set', async () => {
    const portal = makePortal();
    renderGrants(portal);
    expect(await screen.findByText('user-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsRevokeAll') }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsRevokeAll') }),
    );
    await waitFor(() => expect(portal.replaceManagedKnowledgeGrants).toHaveBeenCalledWith('kb-1', []));
  });

  test('does not present a read failure as an empty grant set', async () => {
    const portal = makePortal({
      listManagedKnowledgeGrants: vi.fn().mockRejectedValue(new PortalError(403, 'forbidden')),
    });
    renderGrants(portal);
    expect(await screen.findByText('forbidden')).toBeInTheDocument();
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeGrantsEmpty'))).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('blocks further edits after a write with an unknown outcome until reread', async () => {
    const portal = makePortal({
      replaceManagedKnowledgeGrants: vi.fn().mockRejectedValue(new PortalError(503, 'write outcome unknown')),
    });
    renderGrants(portal);
    await screen.findByText('user-1');
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsSave') }));
    expect(await screen.findByText('write outcome unknown')).toBeInTheDocument();
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeGrantsEmpty'))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeRetryRead') }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsSave') })).toBeEnabled(),
    );
  });
});
