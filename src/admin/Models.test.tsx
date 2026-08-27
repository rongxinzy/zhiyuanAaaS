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
});
