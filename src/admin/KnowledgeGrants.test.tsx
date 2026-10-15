// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App, ConfigProvider } from 'antd';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeGrants } from './KnowledgeGrants.js';
import type { PortalClient } from './portal.js';
import { PortalError } from './portal.js';

const tr = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);

const CONTACTS = [
  { userId: 'user-1', username: 'zhangsan', displayName: '张三', teams: [{ id: 'team-1', name: '研发部' }] },
  { userId: 'user-2', username: 'lisi', displayName: '李四', teams: [] },
];
const DEPARTMENTS = [
  { id: 'team-1', name: '研发部' },
  { id: 'team-2', name: '市场部' },
];

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
    listContacts: vi.fn().mockResolvedValue(CONTACTS),
    listDepartments: vi.fn().mockResolvedValue(DEPARTMENTS),
    ...overrides,
  } as unknown as PortalClient;
}

// 下拉里当前渲染的选项标签（antd 把面板 portal 到 body 末尾，jsdom 不会跑关闭
// 过渡，旧面板留在文档里，所以只读「最后一个未隐藏的下拉」）。
function dropdownOptionLabels(): string[] {
  const dropdowns = document.querySelectorAll<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  const latest = dropdowns[dropdowns.length - 1];
  return [...(latest?.querySelectorAll('.ant-select-item-option') ?? [])].map((item) => item.textContent ?? '');
}

// 打开下拉并点选标签匹配的选项；多选下拉点完不收起，可以连着选多个。
async function pickSubject(combobox: HTMLElement, label: string) {
  fireEvent.mouseDown(combobox);
  const option = await waitFor(() => {
    const node = [
      ...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
    ]
      .reverse()
      .find((item) => item.textContent?.includes(label));
    expect(node).toBeTruthy();
    return node!;
  });
  fireEvent.click(option);
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
    const save = screen.getByRole('button', { name: tr('knowledgeGrantsSave') });
    expect(save).toBeDisabled();
    expect(screen.getByRole('button', { name: tr('knowledgeGrantsRevokeAll') })).toBeDisabled();
    // 授权列表落定前主体下拉不可选：选不出东西，自然加不进去。
    const userSelect = screen.getByRole('combobox', { name: tr('knowledgeGrantUser') });
    expect(userSelect).toBeDisabled();
    resolveGrants({ knowledge_base_id: 'kb-1', tenant_id: 'tenant-1', grants: [] });
    await waitFor(() => expect(save).toBeEnabled());
    await waitFor(() => expect(userSelect).toBeEnabled());
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

  test('loads the server grant set and replaces it with the picked user/team list', async () => {
    const portal = makePortal();
    renderGrants(portal);
    expect(await screen.findByText('user-1')).toBeInTheDocument();
    await pickSubject(screen.getByRole('combobox', { name: tr('knowledgeGrantUser') }), '李四');
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantAddUser') }));
    await pickSubject(screen.getByRole('combobox', { name: tr('knowledgeGrantTeam') }), '研发部');
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantAddTeam') }));
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantsSave') }));

    await waitFor(() =>
      expect(portal.replaceManagedKnowledgeGrants).toHaveBeenCalledWith('kb-1', [
        { type: 'user', id: 'user-1' },
        { type: 'user', id: 'user-2' },
        { type: 'team', id: 'team-1' },
      ]),
    );
    expect(await screen.findByText(tr('knowledgeGrantsSaved'))).toBeInTheDocument();
  });

  test('requires explicit confirmation before replacing all grants with an empty set', async () => {
    const portal = makePortal();
    renderGrants(portal);
    expect(await screen.findByText('user-1')).toBeInTheDocument();
    // 撤销全部就放在「保存会完整替换当前授权」这条提示里，别埋到表格下面。
    const banner = screen
      .getByText(translate(ADMIN_LANGUAGE, 'knowledgeGrantsReplaceHint'))
      .closest('.ant-alert') as HTMLElement;
    const revoke = within(banner).getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeGrantsRevokeAll') });
    fireEvent.click(revoke);
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
    // 403 现在走共享的错误文案映射（knowledge-error.ts），不再是上游原文。
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeForbiddenManaged'))).toBeInTheDocument();
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

  test('offers the portal directory as subjects, labelled by display name only', async () => {
    const portal = makePortal();
    renderGrants(portal);
    await screen.findByText('user-1');
    const userSelect = screen.getByRole('combobox', { name: tr('knowledgeGrantUser') });
    fireEvent.mouseDown(userSelect);
    await waitFor(() => expect(dropdownOptionLabels()).toContain('李四'));
    expect(dropdownOptionLabels()).toContain('张三');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: tr('knowledgeGrantTeam') }));
    // 团队取通讯录成员所属团队与部门列表的并集：无成员的 team-2 只有部门列表才有。
    await waitFor(() => expect(dropdownOptionLabels()).toContain('市场部'));
    expect(dropdownOptionLabels()).toContain('研发部');
  });

  test('filters candidates by name and by id before adding the picked one', async () => {
    const portal = makePortal();
    renderGrants(portal);
    await screen.findByText('user-1');
    const userSelect = screen.getByRole('combobox', { name: tr('knowledgeGrantUser') });
    fireEvent.mouseDown(userSelect);
    fireEvent.change(userSelect, { target: { value: '李' } });
    await waitFor(() => expect(dropdownOptionLabels()).toEqual(['李四']));
    // 标签不再带 ID，但按 ID 搜索仍要命中：管理员可以直接粘贴服务端的键找人。
    fireEvent.change(userSelect, { target: { value: 'user-2' } });
    await waitFor(() => expect(dropdownOptionLabels()).toEqual(['李四']));
    fireEvent.click(await screen.findByText('李四'));
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantAddUser') }));
    // 断言落在表格里：下拉面板（含 rc-select 给读屏用的隐藏虚拟节点）里也有这个 ID。
    expect(await within(screen.getByRole('table')).findByText('user-2')).toBeInTheDocument();
  });

  test('does not add a subject that is already granted', async () => {
    const portal = makePortal();
    renderGrants(portal);
    await screen.findByText('user-1');
    const userSelect = screen.getByRole('combobox', { name: tr('knowledgeGrantUser') });
    await pickSubject(userSelect, '张三');
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantAddUser') }));
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantsSave') }));
    await waitFor(() =>
      expect(portal.replaceManagedKnowledgeGrants).toHaveBeenCalledWith('kb-1', [{ type: 'user', id: 'user-1' }]),
    );
    expect(within(screen.getByRole('table')).getAllByText('user-1')).toHaveLength(1);
    expect(screen.queryByText(tr('knowledgeGrantUnknownSubject'))).not.toBeInTheDocument();
  });

  test('flags a grant missing from the candidate list so it can be removed before saving', async () => {
    const portal = makePortal({
      listManagedKnowledgeGrants: vi.fn().mockResolvedValue({
        knowledge_base_id: 'kb-1',
        tenant_id: 'tenant-1',
        grants: [
          { type: 'user', id: 'user-1' },
          { type: 'team', id: 'team-legacy' },
        ],
      }),
    });
    renderGrants(portal);
    expect(await screen.findByText('team-legacy')).toBeInTheDocument();
    expect(screen.getAllByText(tr('knowledgeGrantUnknownSubject'))).toHaveLength(1);
    expect(screen.getByText(tr('knowledgeGrantUnknownHint'))).toBeInTheDocument();
    const row = screen.getByText('team-legacy').closest('tr');
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /移\s*除/ }));
    await waitFor(() => expect(screen.queryByText(tr('knowledgeGrantUnknownSubject'))).not.toBeInTheDocument());
    expect(screen.queryByText(tr('knowledgeGrantUnknownHint'))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantsSave') }));
    await waitFor(() =>
      expect(portal.replaceManagedKnowledgeGrants).toHaveBeenCalledWith('kb-1', [{ type: 'user', id: 'user-1' }]),
    );
  });

  test('withholds the unknown-subject flag when a candidate source failed', async () => {
    const portal = makePortal({
      listContacts: vi.fn().mockRejectedValue(new PortalError(502, '通讯录不可用')),
      listManagedKnowledgeGrants: vi.fn().mockResolvedValue({
        knowledge_base_id: 'kb-1',
        tenant_id: 'tenant-1',
        grants: [{ type: 'user', id: 'user-9' }],
      }),
    });
    renderGrants(portal);
    expect(await screen.findByText(tr('knowledgeGrantSubjectsIncomplete'))).toBeInTheDocument();
    expect(screen.getByText('通讯录不可用')).toBeInTheDocument();
    // 清单不完整时不下「未知主体」判断（可能是清单自己缺人），仍可删行、可保存。
    expect(screen.queryByText(tr('knowledgeGrantUnknownSubject'))).not.toBeInTheDocument();
    expect(screen.queryByText(tr('knowledgeGrantUnknownHint'))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantsSave') }));
    await waitFor(() =>
      expect(portal.replaceManagedKnowledgeGrants).toHaveBeenCalledWith('kb-1', [{ type: 'user', id: 'user-9' }]),
    );
  });

  // 与技能授权一致：一次可以挑多个主体再加，不必一人一点。
  test('adds every picked subject in one click instead of one at a time', async () => {
    const portal = makePortal();
    renderGrants(portal);
    await screen.findByText('user-1');
    await pickSubject(screen.getByRole('combobox', { name: tr('knowledgeGrantUser') }), '李四');
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantAddUser') }));
    const teamSelect = screen.getByRole('combobox', { name: tr('knowledgeGrantTeam') });
    await pickSubject(teamSelect, '研发部');
    await pickSubject(teamSelect, '市场部');
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantAddTeam') }));
    fireEvent.click(screen.getByRole('button', { name: tr('knowledgeGrantsSave') }));

    await waitFor(() =>
      expect(portal.replaceManagedKnowledgeGrants).toHaveBeenCalledWith('kb-1', [
        { type: 'user', id: 'user-1' },
        { type: 'user', id: 'user-2' },
        { type: 'team', id: 'team-1' },
        { type: 'team', id: 'team-2' },
      ]),
    );
    // 加完就清空草稿：按钮回落到不可点，重复点不会塞进同一个主体。
    await waitFor(() => expect(screen.getByRole('button', { name: tr('knowledgeGrantAddTeam') })).toBeDisabled());
  });

  // 重名的人在选择之前必须能分清：重名的选项补 ID 前 8 位，不重名的保持只写名字。
  test('disambiguates same-named subjects with a short id, and only those', async () => {
    const portal = makePortal({
      listContacts: vi
        .fn()
        .mockResolvedValue([...CONTACTS, { userId: 'user-3', username: 'zhangsan2', displayName: '张三', teams: [] }]),
    });
    renderGrants(portal);
    await screen.findByText('user-1');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: tr('knowledgeGrantUser') }));
    await waitFor(() => expect(dropdownOptionLabels()).toContain('张三 \u00b7 user-1'));
    expect(dropdownOptionLabels()).toContain('张三 \u00b7 user-3');
    // 单名的那个不补后缀，标签仍然是干净的名字。
    expect(dropdownOptionLabels()).toContain('李四');
  });
});
