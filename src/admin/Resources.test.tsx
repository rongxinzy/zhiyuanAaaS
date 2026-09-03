// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AdminResourceTab, Resources } from './Resources.js';

describe('admin resources', () => {
  afterEach(() => cleanup());

  test('renders users and toggles status through the client', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        agents: [],
        skills: [],
        assignments: [],
      }),
      updateUser: vi.fn().mockResolvedValue(undefined),
      updateSkill: vi.fn(),
      deleteSkillAssignment: vi.fn(),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
    expect(await screen.findByText('张三')).toBeInTheDocument();
    expect(screen.getByText('zhangsan')).toHaveClass('text-tertiary-foreground');
    expect(screen.getByText('启用')).toHaveClass('bg-success-soft', 'text-success');
    fireEvent.click(screen.getByRole('button', { name: '停用' }));
    await waitFor(() => expect(client.updateUser).toHaveBeenCalledWith('u1', { status: 'disabled' }));
  });

  test('renders assignment and revokes it after confirmation', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({ users: [], agents: [], skills: [{ id: 's1', name: '写作' }], assignments: [{ id: 'a1', skillId: 's1', subjectType: 'user', subjectId: 'u1' }] }),
      updateUser: vi.fn(),
      updateSkill: vi.fn(),
      deleteSkillAssignment: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
    expect(await screen.findByText('写作')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '撤销授权' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认撤销' }));
    await waitFor(() => expect(client.deleteSkillAssignment).toHaveBeenCalledWith('a1'));
  });

  test('grants a skill to the selected member', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        agents: [],
        skills: [{ id: 's1', name: '写作', enabled: true }],
        assignments: [],
      }),
      updateUser: vi.fn(),
      updateSkill: vi.fn(),
      deleteSkillAssignment: vi.fn(),
      createSkillAssignment: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
    expect(await screen.findByText('暂无 Skill 授权')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '授权 Skill' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: '写作' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /张三/ }));
    fireEvent.click(screen.getByRole('button', { name: '授权' }));
    await waitFor(() => expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'user', id: 'u1' } }));
    await waitFor(() => expect(client.resources).toHaveBeenCalledTimes(2));
  });

  test('grants a skill to multiple members', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [
          { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' },
          { id: 'u2', displayName: '李四', username: 'lisi', status: 'active' },
          { id: 'u3', displayName: '王五', username: 'wangwu', status: 'active' },
        ],
        agents: [],
        skills: [{ id: 's1', name: '写作', enabled: true }],
        assignments: [],
      }),
      updateUser: vi.fn(),
      updateSkill: vi.fn(),
      deleteSkillAssignment: vi.fn(),
      createSkillAssignment: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
    expect(await screen.findByText('暂无 Skill 授权')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '授权 Skill' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: '写作' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /张三/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /李四/ }));
    fireEvent.click(screen.getByRole('button', { name: '授权' }));
    await waitFor(() => expect(client.createSkillAssignment).toHaveBeenCalledTimes(2));
    expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'user', id: 'u1' } });
    expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'user', id: 'u2' } });
  });
});
