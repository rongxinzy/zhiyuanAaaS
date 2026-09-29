// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import type { ReactElement } from 'react';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Identity } from './Identity.js';
import { administratorIdentity } from './test-fixtures.js';

function render(ui: ReactElement) {
  return rtlRender(
    <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }}>
      {ui}
    </ConfigProvider>,
  );
}

const source = { id: 'wecom-directory', kind: 'directory', displayName: '企业微信目录', enabled: true };
const otherSource = { id: 'feishu-directory', kind: 'directory', displayName: '飞书目录', enabled: true };

const mapping = { sourceId: 'wecom-directory', externalSubjectType: 'user', externalId: 'wecom-zhangsan', localSubjectId: 'u1', status: 'active' };

describe('admin account mappings (账号关联)', () => {
  afterEach(() => cleanup());

  test('lists mappings across sources with resolved user names and unknown link time', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn().mockResolvedValue({ items: [mapping], nextCursor: null }),
      users: vi.fn().mockResolvedValue([{ id: 'u1', displayName: '张三', username: 'zhang', status: 'active' }]),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);

    expect(await screen.findByText('企业微信目录')).toBeInTheDocument();
    expect(screen.getByText('wecom-zhangsan')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('已关联')).toBeInTheDocument();
    expect(screen.getAllByText('未知').length).toBeGreaterThan(0);
    expect(client.users).toHaveBeenCalled();
    expect(client.identityMappings).toHaveBeenCalledWith('wecom-directory');
  });

  test('creates a mapping with the contract body', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      users: vi.fn().mockResolvedValue([]),
      upsertIdentityMapping: vi.fn().mockResolvedValue(undefined),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);

    fireEvent.click(await screen.findByRole('button', { name: /关联账号/ }));
    fireEvent.change(await screen.findByLabelText('外部账号'), { target: { value: 'wecom-lisi' } });
    fireEvent.change(screen.getByLabelText('选择平台用户'), { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.upsertIdentityMapping).toHaveBeenCalledWith('wecom-directory', {
      externalSubjectType: 'user',
      externalId: 'wecom-lisi',
      localSubjectId: 'u2',
    }));
  });

  test('picks the platform user from the autocomplete suggestions', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      users: vi.fn().mockResolvedValue([{ id: 'user-1', displayName: '张三', username: 'zhangsan', status: 'active' }]),
      upsertIdentityMapping: vi.fn().mockResolvedValue(undefined),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);

    fireEvent.click(await screen.findByRole('button', { name: /关联账号/ }));
    fireEvent.change(await screen.findByLabelText('外部账号'), { target: { value: 'wecom-zhangsan' } });
    const picker = screen.getByLabelText('选择平台用户');
    fireEvent.change(picker, { target: { value: '张三' } });
    fireEvent.click(await screen.findByText('张三（zhangsan）'));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.upsertIdentityMapping).toHaveBeenCalledWith('wecom-directory', {
      externalSubjectType: 'user',
      externalId: 'wecom-zhangsan',
      localSubjectId: 'user-1',
    }));
  });

  test('requires explicit confirmation before rebinding an external account to another user', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn().mockResolvedValue({ items: [mapping], nextCursor: null }),
      users: vi.fn().mockResolvedValue([{ id: 'u1', displayName: '张三', username: 'zhang', status: 'active' }, { id: 'u2', displayName: '李四', username: 'li', status: 'active' }]),
      upsertIdentityMapping: vi.fn().mockResolvedValue(undefined),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);

    fireEvent.click(await screen.findByRole('button', { name: /关联账号/ }));
    fireEvent.change(await screen.findByLabelText('外部账号'), { target: { value: 'wecom-zhangsan' } });
    fireEvent.change(screen.getByLabelText('选择平台用户'), { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    // The existing binding is surfaced and nothing is written yet.
    expect(await screen.findByText('该外部账号已绑定其他用户')).toBeInTheDocument();
    expect(screen.getAllByText(/u1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/u2/).length).toBeGreaterThan(0);
    expect(client.upsertIdentityMapping).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认变更绑定' }));
    await waitFor(() => expect(client.upsertIdentityMapping).toHaveBeenCalledWith('wecom-directory', {
      externalSubjectType: 'user',
      externalId: 'wecom-zhangsan',
      localSubjectId: 'u2',
    }));
  });

  test('unlinks a mapping only after the impact confirmation', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn()
        .mockResolvedValueOnce({ items: [mapping], nextCursor: null })
        .mockResolvedValue({ items: [], nextCursor: null }),
      users: vi.fn().mockResolvedValue([]),
      deleteIdentityMapping: vi.fn().mockResolvedValue(undefined),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);

    expect(await screen.findByText('wecom-zhangsan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /解除关联/ }));
    expect(await screen.findByText('解除账号关联')).toBeInTheDocument();
    expect(screen.getByText(/平台账号与已有资料不删除/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认解除' }));
    await waitFor(() => expect(client.deleteIdentityMapping).toHaveBeenCalledWith('wecom-directory', 'wecom-zhangsan'));
    await waitFor(() => expect(client.identityMappings).toHaveBeenCalledTimes(2));
  });

  test('creates an identity source with the directory kind', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      identityMappings: vi.fn(),
      users: vi.fn().mockResolvedValue([]),
      createIdentitySource: vi.fn().mockResolvedValue(undefined),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);

    fireEvent.click(await screen.findByRole('button', { name: /新增来源平台/ }));
    fireEvent.change(await screen.findByLabelText('来源标识'), { target: { value: 'wecom-directory' } });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '企业微信通讯录' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.createIdentitySource).toHaveBeenCalledWith({
      id: 'wecom-directory',
      kind: 'directory',
      displayName: '企业微信通讯录',
    }));
  });

  test('rejects a mapping save without required fields', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      users: vi.fn().mockResolvedValue([]),
      upsertIdentityMapping: vi.fn(),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);

    fireEvent.click(await screen.findByRole('button', { name: /关联账号/ }));
    fireEvent.click(await screen.findByRole('button', { name: '保存' }));
    expect(await screen.findByText('请填写外部账号。')).toBeInTheDocument();
    expect(client.upsertIdentityMapping).not.toHaveBeenCalled();
  });

  test('hides every mutation for a read-only operator while keeping the data visible', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn().mockResolvedValue({ items: [mapping], nextCursor: null }),
      users: vi.fn(),
      upsertIdentityMapping: vi.fn(),
      deleteIdentityMapping: vi.fn(),
      createIdentitySource: vi.fn(),
    };
    render(<Identity client={client as never} identity={{ roles: [], permissions: ['identity.read'] } as never} />);

    expect(await screen.findByText('wecom-zhangsan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /关联账号/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新增来源平台/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /解除关联/ })).not.toBeInTheDocument();
    expect(screen.getByText(/当前账号无权查看用户列表/)).toBeInTheDocument();
    expect(client.users).not.toHaveBeenCalled();
  });

  test('reports partial source failures instead of pretending the list is complete', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source, otherSource], nextCursor: null }),
      identityMappings: vi.fn()
        .mockResolvedValueOnce({ items: [mapping], nextCursor: null })
        .mockRejectedValueOnce(new Error('boom')),
      users: vi.fn().mockResolvedValue([]),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);

    expect(await screen.findByText('wecom-zhangsan')).toBeInTheDocument();
    expect(screen.getByText(/部分来源平台的关联加载失败/)).toBeInTheDocument();
    expect(screen.getByText('飞书目录')).toBeInTheDocument();
  });

  test('shows a load failure with retry instead of an empty success state', async () => {
    const client = {
      identitySources: vi.fn().mockRejectedValue(new Error('boom')),
      users: vi.fn().mockResolvedValue([]),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);

    expect(await screen.findByText(/来源平台加载失败/)).toBeInTheDocument();
    expect(screen.queryByText('暂无关联账号')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
  });
});
