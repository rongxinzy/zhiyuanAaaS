// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Identity } from './Identity.js';
import { administratorIdentity } from './test-fixtures.js';

describe('admin identity mapping', () => {
  afterEach(() => cleanup());

  const source = { id: 'wecom-directory', kind: 'directory', displayName: '企业微信目录', enabled: true };

  test('renders identity sources and opens the mapping list', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn().mockResolvedValue({
        items: [{ sourceId: 'wecom-directory', externalSubjectType: 'user', externalId: 'wecom-zhangsan', localSubjectId: 'u1', status: 'active' }],
        nextCursor: null,
      }),
      users: vi.fn().mockResolvedValue([]),
    };
    const { rerender } = render(<Identity client={client as never} identity={administratorIdentity} />);

    expect(await screen.findByText('企业微信目录')).toBeInTheDocument();
    expect(screen.getByText('wecom-directory')).toBeInTheDocument();
    expect(screen.getByText('IM 渠道目录')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: '企业微信目录' }));
    rerender(<Identity client={client as never} identity={administratorIdentity} />);
    expect(await screen.findByText('wecom-zhangsan')).toBeInTheDocument();
    expect(screen.getByText('u1')).toBeInTheDocument();
    expect(screen.getByText('启用')).toBeInTheDocument();
    expect(client.identityMappings).toHaveBeenCalledWith('wecom-directory');
  });

  test('creates a mapping by calling PUT with the contract body', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      users: vi.fn().mockResolvedValue([{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }]),
      upsertIdentityMapping: vi.fn().mockResolvedValue(undefined),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);
    fireEvent.click(await screen.findByRole('button', { name: '企业微信目录' }));

    fireEvent.click((await screen.findAllByRole('button', { name: '添加映射' }))[0]!);
    fireEvent.change(screen.getByLabelText('外部标识'), { target: { value: 'wecom-lisi' } });
    fireEvent.change(screen.getByLabelText('AEP 用户'), { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.upsertIdentityMapping).toHaveBeenCalledWith('wecom-directory', {
      externalSubjectType: 'user',
      externalId: 'wecom-lisi',
      localSubjectId: 'u2',
    }));
  });

  test('picks the AEP user from the user picker into the mapping form', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      users: vi.fn().mockResolvedValue([{ id: 'user-1', displayName: '张三', username: 'zhangsan', status: 'active' }]),
      upsertIdentityMapping: vi.fn().mockResolvedValue(undefined),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);
    fireEvent.click(await screen.findByRole('button', { name: '企业微信目录' }));

    fireEvent.click((await screen.findAllByRole('button', { name: '添加映射' }))[0]!);
    fireEvent.click(await screen.findByRole('checkbox', { name: /张三/ }));
    fireEvent.change(screen.getByLabelText('外部标识'), { target: { value: 'wecom-zhangsan' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.upsertIdentityMapping).toHaveBeenCalledWith('wecom-directory', {
      externalSubjectType: 'user',
      externalId: 'wecom-zhangsan',
      localSubjectId: 'user-1',
    }));
  });

  test('deletes a mapping after confirmation', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [source], nextCursor: null }),
      identityMappings: vi.fn()
        .mockResolvedValueOnce({
          items: [{ sourceId: 'wecom-directory', externalSubjectType: 'user', externalId: 'wecom-zhangsan', localSubjectId: 'u1', status: 'active' }],
          nextCursor: null,
        })
        .mockResolvedValue({ items: [], nextCursor: null }),
      users: vi.fn().mockResolvedValue([]),
      deleteIdentityMapping: vi.fn().mockResolvedValue(undefined),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);
    fireEvent.click(await screen.findByRole('button', { name: '企业微信目录' }));

    expect(await screen.findByText('wecom-zhangsan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除映射' }));
    await waitFor(() => expect(client.deleteIdentityMapping).toHaveBeenCalledWith('wecom-directory', 'wecom-zhangsan'));
    await waitFor(() => expect(client.identityMappings).toHaveBeenCalledTimes(2));
  });

  test('creates an identity source with the directory kind', async () => {
    const client = {
      identitySources: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      createIdentitySource: vi.fn().mockResolvedValue(undefined),
    };
    render(<Identity client={client as never} identity={administratorIdentity} />);
    fireEvent.click(await screen.findByRole('button', { name: '新增身份源' }));
    fireEvent.change(screen.getByLabelText('身份源 ID'), { target: { value: 'wecom-directory' } });
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
    fireEvent.click(await screen.findByRole('button', { name: '企业微信目录' }));

    fireEvent.click((await screen.findAllByRole('button', { name: '添加映射' }))[0]!);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('请填写外部标识。')).toBeInTheDocument();
    expect(client.upsertIdentityMapping).not.toHaveBeenCalled();
  });
});
