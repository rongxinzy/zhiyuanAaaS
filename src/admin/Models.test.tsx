// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Models } from './Models.js';

describe('admin models', () => {
  afterEach(() => cleanup());

  test('creates a gateway model from the configuration form', async () => {
    const client = {
      models: vi.fn().mockResolvedValue({ models: [], assignments: [] }),
      users: vi.fn().mockResolvedValue([]),
      createModel: vi.fn().mockResolvedValue(undefined),
      updateModel: vi.fn(),
      deleteModelAssignment: vi.fn(),
    };
    render(<Models client={client as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '添加模型' }));
    fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'chat' } });
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '企业对话' } });
    fireEvent.change(screen.getByLabelText('网关地址'), { target: { value: 'http://localhost:8081/v1' } });
    fireEvent.change(screen.getByLabelText('上游模型'), { target: { value: 'deepseek-chat' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.createModel).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat', upstreamModel: 'deepseek-chat', sourceType: 'gateway' })));
  });

  test('assigns a model to multiple members', async () => {
    const client = {
      models: vi.fn().mockResolvedValue({
        models: [{ id: 'chat', displayName: '企业对话', endpoint: 'http://localhost:8081/v1', upstreamModel: 'deepseek-chat', enabled: true, isDefault: false }],
        assignments: [],
      }),
      users: vi.fn().mockResolvedValue([
        { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' },
        { id: 'u2', displayName: '李四', username: 'lisi', status: 'active' },
      ]),
      createModel: vi.fn(),
      updateModel: vi.fn(),
      deleteModelAssignment: vi.fn(),
      createModelAssignment: vi.fn().mockResolvedValue(undefined),
    };
    render(<Models client={client as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '分配模型' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /张三/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /李四/ }));
    fireEvent.click(screen.getByRole('button', { name: '授权' }));
    await waitFor(() => expect(client.createModelAssignment).toHaveBeenCalledTimes(2));
    expect(client.createModelAssignment).toHaveBeenCalledWith({ modelId: 'chat', subject: { type: 'user', id: 'u1' } });
    expect(client.createModelAssignment).toHaveBeenCalledWith({ modelId: 'chat', subject: { type: 'user', id: 'u2' } });
  });
});
