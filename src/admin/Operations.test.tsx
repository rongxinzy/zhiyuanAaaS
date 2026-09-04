// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Operations } from './Operations.js';

describe('admin operations', () => {
  afterEach(() => cleanup());

  test('imports and revokes a license through the operations page', async () => {
    const client = {
      licenses: vi.fn().mockResolvedValue([{
        licenseId: 'license-1', customerId: 'customer-1', deploymentId: 'demo', digest: 'a'.repeat(64), keyId: 'license-prod-1',
        status: 'active', issuedAt: '2026-09-01T00:00:00Z', expiresAt: '2027-09-01T00:00:00Z', graceEndsAt: '2027-09-08T00:00:00Z',
        limits: { users: 100, activations: 120 }, features: ['model_gateway'], activeUsers: 2, activeActivations: 3,
        revokedAt: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
      }]),
      importLicense: vi.fn().mockResolvedValue(undefined),
      revokeLicense: vi.fn().mockResolvedValue(undefined),
    };
    render(<Operations client={client as never} />);

    expect(await screen.findByText('license-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '撤销 License' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认撤销 License' }));
    await waitFor(() => expect(client.revokeLicense).toHaveBeenCalledWith('license-1'));

    fireEvent.click(screen.getByRole('button', { name: '导入 License' }));
    const envelope = JSON.stringify({ format: 'zhiyuan-license-v1', keyId: 'license-prod-1', payload: { licenseId: 'license-2' }, signature: 'signed' });
    const file = new File([envelope], 'license.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('License 文件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '导入 License' }));
    await waitFor(() => expect(client.importLicense).toHaveBeenCalledWith({ license: expect.objectContaining({ keyId: 'license-prod-1', signature: 'signed' }) }));
  });

  test('filters user sessions from the sessions tab', async () => {
    const client = {
      licenses: vi.fn().mockResolvedValue([]),
      sessions: vi.fn().mockResolvedValue([{ sessionId: 'session-1', userId: 'user-1', topic: 'user:user-1', createdAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-04T00:00:00Z', revokedAt: null }]),
    };
    render(<Operations client={client as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '用户会话' }));
    expect(await screen.findByText('session-1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('按用户 ID 筛选'), { target: { value: 'user-1' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() => expect(client.sessions).toHaveBeenLastCalledWith('user-1'));
  });

  test('creates, edits, rotates, deletes, and assigns a credential', async () => {
    const client = {
      licenses: vi.fn().mockResolvedValue([]),
      credentials: vi.fn().mockResolvedValue({
        credentials: [{ id: 'cred-1', name: 'DeepSeek', service: 'model-gateway', type: 'api_key', deliveryMode: 'server_only', maskedValue: 'sk-***123', enabled: true, updatedAt: '2026-09-04T00:00:00Z' }],
        assignments: [],
      }),
      resources: vi.fn().mockResolvedValue({ users: [{ id: 'user-1', displayName: '管理员', username: 'admin', status: 'active' }], roles: [], teams: [], permissions: [], skills: [], assignments: [] }),
      createCredential: vi.fn().mockResolvedValue(undefined),
      updateCredential: vi.fn().mockResolvedValue(undefined),
      rotateCredential: vi.fn().mockResolvedValue(undefined),
      deleteCredential: vi.fn().mockResolvedValue(undefined),
      createCredentialAssignment: vi.fn().mockResolvedValue(undefined),
      deleteCredentialAssignment: vi.fn().mockResolvedValue(undefined),
    };
    render(<Operations client={client as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '凭证' }));
    expect(await screen.findByText('DeepSeek')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Gateway key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.updateCredential).toHaveBeenCalledWith('cred-1', expect.objectContaining({ name: 'Gateway key', service: 'model-gateway', deliveryMode: 'server_only', enabled: true })));

    fireEvent.click(screen.getByRole('button', { name: '轮换凭证' }));
    fireEvent.change(screen.getByLabelText('凭证值'), { target: { value: 'new-secret' } });
    const rotateButtons = await screen.findAllByRole('button', { name: '轮换凭证' });
    fireEvent.click(rotateButtons.at(-1)!);
    await waitFor(() => expect(client.rotateCredential).toHaveBeenCalledWith('cred-1', { value: 'new-secret' }));

    fireEvent.click(screen.getByRole('button', { name: '授权凭证' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /管理员/ }));
    fireEvent.click(screen.getByRole('button', { name: '授权' }));
    await waitFor(() => expect(client.createCredentialAssignment).toHaveBeenCalledWith({ credentialId: 'cred-1', subject: { type: 'user', id: 'user-1' } }));

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除凭证' }));
    await waitFor(() => expect(client.deleteCredential).toHaveBeenCalledWith('cred-1'));
  });

  test('creates a credential from the empty state toolbar', async () => {
    const client = {
      licenses: vi.fn().mockResolvedValue([]),
      credentials: vi.fn().mockResolvedValue({ credentials: [], assignments: [] }),
      resources: vi.fn().mockResolvedValue({ users: [], roles: [], teams: [], permissions: [], skills: [], assignments: [] }),
      createCredential: vi.fn().mockResolvedValue(undefined),
    };
    render(<Operations client={client as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '凭证' }));
    fireEvent.click(screen.getByRole('button', { name: '添加凭证' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Search API' } });
    fireEvent.change(screen.getByLabelText('服务'), { target: { value: 'search' } });
    fireEvent.change(screen.getByLabelText('凭证值'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.createCredential).toHaveBeenCalledWith({ name: 'Search API', service: 'search', type: 'api_key', deliveryMode: 'server_only', value: 'secret', enabled: true }));
  });
});
