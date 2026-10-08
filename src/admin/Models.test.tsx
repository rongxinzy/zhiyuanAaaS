// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
// Browser API stubs for antd live in src/admin/test-setup.ts (wired via
// vitest.config setupFiles). The wrapper below mirrors the production
// ConfigProvider (stable two-CJK button names) and disables wave/motion so
// jsdom does not burn seconds per click on synchronous style work.
import { ConfigProvider } from 'antd';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AdminIdentity } from './client.js';
import { Models } from './Models.js';
import { administratorIdentity } from './test-fixtures.js';

const TIMEOUT = 15000;

function render(ui: ReactElement): ReturnType<typeof rtlRender> {
  return rtlRender(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
      {ui}
    </ConfigProvider>,
  );
}

describe('admin models', () => {
  afterEach(() => cleanup());

  const emptyResources = { users: [], roles: [], teams: [], permissions: [], skills: [], assignments: [] };
  const credentials = {
    credentials: [
      {
        id: 'cred-1',
        name: '在线接入',
        service: 'openai',
        type: 'api_key',
        deliveryMode: 'server_only',
        maskedValue: 'sk-***',
        enabled: true,
        updatedAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 'cred-2',
        name: '已停用接入',
        service: 'openai',
        type: 'api_key',
        deliveryMode: 'server_only',
        maskedValue: 'sk-***',
        enabled: false,
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ],
    assignments: [],
  };
  const dataPlaneApplied = {
    desired: {
      revision: 'r2',
      routes: [
        {
          modelId: 'chat',
          enabled: true,
          endpoint: 'http://gateway/v1',
          upstreamModel: 'deepseek-chat',
          protocol: 'openai-compatible',
        },
      ],
      deploymentId: 'demo',
      publishedAt: '2026-09-29T06:30:00Z',
      contentHash: 'h2',
    },
    status: { state: 'ready', observedRevision: 'r2', contentHash: 'h2', lastAppliedAt: '2026-09-29T06:31:00Z' },
  };

  // models.write + models.assign but no credentials.read and no
  // data_plane.write — used for the permission-honesty regressions.
  const operatorIdentity: AdminIdentity = {
    ...administratorIdentity,
    roles: ['operator'],
    permissions: ['models.read', 'models.write', 'models.assign'],
  };

  // Fresh mocks per test — spreading a shared object would share call
  // counts between tests.
  const makeBaseClient = () => ({
    models: vi.fn().mockResolvedValue({ models: [], assignments: [] }),
    resources: vi.fn().mockResolvedValue(emptyResources),
    credentials: vi.fn().mockResolvedValue(credentials),
    dataPlane: vi.fn().mockResolvedValue(dataPlaneApplied),
    publishDataPlaneRoutes: vi.fn().mockResolvedValue(dataPlaneApplied.desired),
    createModel: vi.fn().mockResolvedValue(undefined),
    updateModel: vi.fn().mockResolvedValue(undefined),
    deleteModel: vi.fn().mockResolvedValue(undefined),
    createModelAssignment: vi.fn().mockResolvedValue(undefined),
    deleteModelAssignment: vi.fn().mockResolvedValue(undefined),
  });

  test(
    'fails closed when no validated identity is available',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
            },
          ],
          assignments: [],
        }),
      };
      render(<Models client={client as never} />);

      expect(await screen.findByText('deepseek-chat')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /添加模型/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /编辑模型/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /分配模型/ })).not.toBeInTheDocument();
      // Ops data is not requested for an unvalidated identity either.
      await waitFor(() => expect(client.models).toHaveBeenCalled());
      expect(client.dataPlane).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'creates a gateway model without a credential reference',
    async () => {
      const client = makeBaseClient();
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /添加模型/ }));
      // No id field: the slug is server-generated from the display name. The
      // protocol Select defaults to openai-compatible and needs no interaction.
      fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '企业对话' } });
      fireEvent.change(screen.getByLabelText('网关地址'), { target: { value: 'http://localhost:8081/v1' } });
      fireEvent.change(screen.getByLabelText('上游模型'), { target: { value: 'deepseek-chat' } });
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.createModel).toHaveBeenCalledWith(
          expect.objectContaining({
            protocol: 'openai-compatible',
            upstreamModel: 'deepseek-chat',
            sourceType: 'gateway',
            credentialId: null,
          }),
        ),
      );
      const body = client.createModel.mock.calls[0]![0]!;
      expect(body).not.toHaveProperty('id');
    },
    TIMEOUT,
  );

  test(
    'creates an anthropic-protocol model through the protocol select',
    async () => {
      const client = makeBaseClient();
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /添加模型/ }));
      fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '企业对话' } });
      fireEvent.change(screen.getByLabelText('网关地址'), { target: { value: 'http://localhost:8081/v1' } });
      fireEvent.change(screen.getByLabelText('上游模型'), { target: { value: 'claude-sonnet' } });

      const modal = await screen.findByRole('dialog');
      // The protocol select is the first combobox; the credential one second.
      fireEvent.mouseDown(within(modal).getAllByRole('combobox')[0]!);
      fireEvent.click(await screen.findByText('Anthropic'));

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.createModel).toHaveBeenCalledWith(expect.objectContaining({ protocol: 'anthropic' })),
      );
    },
    TIMEOUT,
  );

  test(
    'creates a model referencing an enabled server-only credential and never offers disabled ones',
    async () => {
      const client = makeBaseClient();
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /添加模型/ }));
      fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '企业对话' } });
      fireEvent.change(screen.getByLabelText('网关地址'), { target: { value: 'http://localhost:8081/v1' } });
      fireEvent.change(screen.getByLabelText('上游模型'), { target: { value: 'deepseek-chat' } });

      const modal = await screen.findByRole('dialog');
      // The credential connection select is the second combobox.
      fireEvent.mouseDown(within(modal).getAllByRole('combobox')[1]!);
      fireEvent.click(await screen.findByText('在线接入 · openai'));

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.createModel).toHaveBeenCalledWith(expect.objectContaining({ credentialId: 'cred-1' })),
      );
    },
    TIMEOUT,
  );

  test(
    'edit clears the credential reference to null',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
              credentialId: 'cred-1',
            },
          ],
          assignments: [],
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /编辑模型/ }));

      const modal = await screen.findByRole('dialog');
      expect(await within(modal).findByText('在线接入 · openai')).toBeInTheDocument();
      fireEvent.mouseDown(within(modal).getByRole('combobox'));
      fireEvent.click(await screen.findByText('不使用接入密钥'));

      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.updateModel).toHaveBeenCalledWith('chat', expect.objectContaining({ credentialId: null })),
      );
    },
    TIMEOUT,
  );

  test(
    'edit without credentials.read keeps the existing reference and does not request secrets',
    async () => {
      const client = {
        ...makeBaseClient(),
        credentials: vi.fn(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
              credentialId: 'cred-9',
            },
          ],
          assignments: [],
        }),
      };
      render(<Models client={client as never} identity={operatorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /编辑模型/ }));

      const modal = await screen.findByRole('dialog');
      expect(await within(modal).findByText('cred-9')).toBeInTheDocument();
      expect(await within(modal).findByText(/无权选择接入配置/)).toBeInTheDocument();
      expect(client.credentials).not.toHaveBeenCalled();

      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() => expect(client.updateModel).toHaveBeenCalled());
      const [, patch] = client.updateModel.mock.calls[0]!;
      expect(patch).not.toHaveProperty('credentialId');
    },
    TIMEOUT,
  );

  test(
    'without data_plane.write the ops query is not issued and the config column says so',
    async () => {
      const client = {
        ...makeBaseClient(),
        dataPlane: vi.fn(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
          ],
          assignments: [],
        }),
      };
      render(<Models client={client as never} identity={operatorIdentity} />);

      expect(await screen.findByText('deepseek-chat')).toBeInTheDocument();
      await waitFor(() => expect(client.models).toHaveBeenCalled());
      expect(client.dataPlane).not.toHaveBeenCalled();
      expect(screen.getByText('无权限查看')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /查看详情/ }));
      fireEvent.click(await screen.findByRole('tab', { name: '配置生效详情' }));
      expect(await screen.findByText('配置生效详情需要运维权限')).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'applied is only claimed when the gateway confirmed the target revision',
    async () => {
      const client = {
        ...makeBaseClient(),
        dataPlane: vi.fn().mockResolvedValue({
          desired: dataPlaneApplied.desired,
          status: { state: 'ready', observedRevision: null, contentHash: null },
        }),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
          ],
          assignments: [],
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);

      expect(await screen.findByText('deepseek-chat')).toBeInTheDocument();
      expect(screen.getByText('状态未知')).toBeInTheDocument();
      expect(screen.queryByText('已应用')).not.toBeInTheDocument();
      // Without probe data the health cell stays honestly "not probed".
      expect(screen.getAllByText('未探测').length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  test(
    'probe health renders per model: healthy, rejected credential, denied access',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'fast',
              displayName: '主力模型',
              endpoint: 'http://10.0.0.1:8080/v1',
              upstreamModel: 'qwen',
              enabled: true,
              isDefault: true,
              healthStatus: 'healthy',
              healthCheckedAt: '2026-10-08T12:00:00Z',
              healthDetail: 'upstream catalog lists qwen',
            },
            {
              id: 'stale',
              displayName: '过期凭据模型',
              endpoint: 'http://10.0.0.2/v1',
              upstreamModel: 'glm',
              enabled: true,
              isDefault: false,
              healthStatus: 'credential_invalid',
              healthCheckedAt: '2026-10-08T12:00:00Z',
              healthDetail: 'HTTP 401: unauthorized',
            },
            {
              id: 'limited',
              displayName: '限流模型',
              endpoint: 'http://10.0.0.3/v1',
              upstreamModel: 'glm',
              enabled: true,
              isDefault: false,
              healthStatus: 'denied',
              healthCheckedAt: '2026-10-08T12:00:00Z',
              healthDetail: 'HTTP 403: slow down',
            },
          ],
          assignments: [],
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);

      await screen.findByText('主力模型');
      // Pin each verdict to its own row: a plain string match would not
      // catch a swapped status->copy mapping.
      const rowOf = (name: string) => screen.getByText(name).closest('tr')!;
      expect(within(rowOf('主力模型')).getByText('正常')).toBeInTheDocument();
      expect(within(rowOf('过期凭据模型')).getByText('凭据失效')).toBeInTheDocument();
      expect(within(rowOf('限流模型')).getByText('访问被拒（可能限流）')).toBeInTheDocument();
      expect(within(rowOf('主力模型')).queryByText('凭据失效')).toBeNull();
    },
    TIMEOUT,
  );

  test(
    'data-plane failure is surfaced, never shown as applied',
    async () => {
      const client = {
        ...makeBaseClient(),
        dataPlane: vi.fn().mockRejectedValue(new Error('AEP 403')),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
          ],
          assignments: [],
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);

      expect(await screen.findByText(/获取失败/)).toBeInTheDocument();
      expect(screen.queryByText('已应用')).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'assigns a model to multiple members',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
          ],
          assignments: [],
        }),
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [
            { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' },
            { id: 'u2', displayName: '李四', username: 'lisi', status: 'active' },
          ],
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /分配模型/ }));
      fireEvent.click(await screen.findByRole('checkbox', { name: /张三/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /李四/ }));
      fireEvent.click(screen.getByRole('button', { name: '授权' }));
      await waitFor(() => expect(client.createModelAssignment).toHaveBeenCalledTimes(2));
      expect(client.createModelAssignment).toHaveBeenCalledWith({
        modelId: 'chat',
        subject: { type: 'user', id: 'u1' },
      });
      expect(client.createModelAssignment).toHaveBeenCalledWith({
        modelId: 'chat',
        subject: { type: 'user', id: 'u2' },
      });
    },
    TIMEOUT,
  );

  test(
    'does not offer subjects that already have a model assignment',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
          ],
          assignments: [
            {
              id: 'a1',
              resourceType: 'model',
              resourceId: 'chat',
              subject: { type: 'user', id: 'u1' },
              createdAt: '2026-09-01T00:00:00Z',
            },
          ],
        }),
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [
            { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' },
            { id: 'u2', displayName: '李四', username: 'lisi', status: 'active' },
          ],
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /分配模型/ }));
      expect(screen.queryByRole('checkbox', { name: /张三/ })).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /李四/ })).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'reports partial model assignment failures and keeps failed subjects selected',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
          ],
          assignments: [],
        }),
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [
            { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' },
            { id: 'u2', displayName: '李四', username: 'lisi', status: 'active' },
          ],
        }),
        createModelAssignment: vi.fn(async ({ subject }: { readonly subject: { readonly id: string } }) => {
          if (subject.id === 'u2') throw new Error('already assigned');
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /分配模型/ }));
      fireEvent.click(await screen.findByRole('checkbox', { name: /张三/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /李四/ }));
      fireEvent.click(screen.getByRole('button', { name: '授权' }));
      expect(await screen.findByText(/失败主体/)).toBeInTheDocument();
      expect(screen.getByText(/user:u2/)).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'edits and deletes a model',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
          ],
          assignments: [],
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /编辑模型/ }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(within(modal).getByLabelText('显示名称'), { target: { value: '新名称' } });
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.updateModel).toHaveBeenCalledWith(
          'chat',
          expect.objectContaining({
            displayName: '新名称',
            endpoint: 'http://localhost:8081/v1',
            upstreamModel: 'deepseek-chat',
          }),
        ),
      );

      fireEvent.click(await screen.findByRole('button', { name: /操作/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: '删除' }));
      expect(await screen.findByText(/当前授权对象数/)).toBeInTheDocument();
      const deleteButtons = await screen.findAllByRole('button', { name: /删除/ });
      fireEvent.click(deleteButtons.at(-1)!);
      await waitFor(() => expect(client.deleteModel).toHaveBeenCalledWith('chat'));
    },
    TIMEOUT,
  );

  test(
    'assigns a model to a role and a team',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
          ],
          assignments: [],
        }),
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          roles: [{ id: 'role-1', name: '编辑者', description: '', builtIn: false, enabled: true, permissions: [] }],
          teams: [{ id: 'team-1', name: '平台组', description: '', builtIn: false, enabled: true, memberCount: 0 }],
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /分配模型/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /编辑者/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /平台组/ }));
      fireEvent.click(screen.getByRole('button', { name: '授权' }));
      await waitFor(() => expect(client.createModelAssignment).toHaveBeenCalledTimes(2));
      expect(client.createModelAssignment).toHaveBeenCalledWith({
        modelId: 'chat',
        subject: { type: 'role', id: 'role-1' },
      });
      expect(client.createModelAssignment).toHaveBeenCalledWith({
        modelId: 'chat',
        subject: { type: 'team', id: 'team-1' },
      });
    },
    TIMEOUT,
  );

  test(
    'opens model assignment as a subpage with target filters and search',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'chat',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
          ],
          assignments: [],
        }),
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
          roles: [{ id: 'role-1', name: '编辑者', description: '', builtIn: false, enabled: true, permissions: [] }],
          teams: [{ id: 'team-1', name: '平台组', description: '', builtIn: false, enabled: true, memberCount: 0 }],
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);
      fireEvent.click(await screen.findByRole('button', { name: /分配模型/ }));
      expect(await screen.findByRole('heading', { name: '为成员分配模型' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /张三/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('radio', { name: '角色' }));
      expect(screen.queryByRole('checkbox', { name: /张三/ })).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /编辑者/ })).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: /平台组/ })).not.toBeInTheDocument();

      fireEvent.change(screen.getByRole('textbox', { name: '搜索授权对象' }), { target: { value: '不存在' } });
      expect(await screen.findByText('无匹配主体')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /返回模型列表/ }));
      expect(await screen.findByRole('heading', { name: '模型列表' })).toBeInTheDocument();
    },
    TIMEOUT,
  );

  const publishableModel = {
    id: 'chat',
    displayName: '企业对话',
    endpoint: 'http://localhost:8081/v1',
    upstreamModel: 'deepseek-chat',
    enabled: true,
    isDefault: false,
    sourceType: 'gateway',
    protocol: 'openai-compatible',
  };

  test(
    'marks catalog drift on models missing from or mismatched with the desired routes',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            publishableModel,
            { ...publishableModel, id: 'vision', displayName: '图像理解', upstreamModel: 'vision-v2' },
          ],
          assignments: [],
        }),
        dataPlane: vi.fn().mockResolvedValue({
          desired: dataPlaneApplied.desired,
          status: {
            ...dataPlaneApplied.status,
            catalogComparison: {
              missing: ['vision'],
              extra: [],
              mismatched: [{ modelId: 'chat', fields: ['endpoint'] }],
            },
          },
        }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);

      expect(await screen.findByText('待发布')).toBeInTheDocument();
      expect(screen.getByText('配置不一致')).toBeInTheDocument();
      // The drift detail follows into the per-model config tab.
      fireEvent.click(screen.getAllByRole('button', { name: /查看详情/ })[0]!);
      fireEvent.click(await screen.findByRole('tab', { name: '配置生效详情' }));
      expect(await screen.findByText('目录发布状态')).toBeInTheDocument();
      expect(screen.getByText('不一致字段')).toBeInTheDocument();
      // "endpoint" drift is labelled 网关地址 (also used by the basics tab).
      expect(screen.getAllByText('网关地址').length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  test(
    'publishes catalog-derived routes after confirmation and refreshes the gateway state',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({ models: [publishableModel], assignments: [] }),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);

      fireEvent.click(await screen.findByRole('button', { name: /发布生效/ }));
      const confirm = await screen.findByText('从模型目录发布网关路由');
      expect(confirm).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '发布生效' }));
      await waitFor(() => expect(client.publishDataPlaneRoutes).toHaveBeenCalledWith());
      await waitFor(() => expect(client.dataPlane).toHaveBeenCalledTimes(2));
    },
    TIMEOUT,
  );

  test(
    'names the models a publish would skip and reports publish failures locally',
    async () => {
      const client = {
        ...makeBaseClient(),
        models: vi.fn().mockResolvedValue({
          models: [
            publishableModel,
            { ...publishableModel, id: 'draft', displayName: '草稿模型', enabled: false },
            { ...publishableModel, id: 'bare', displayName: '残缺模型', upstreamModel: '' },
          ],
          assignments: [],
        }),
        publishDataPlaneRoutes: vi.fn().mockRejectedValue(new Error('AEP 503 UNAVAILABLE')),
      };
      render(<Models client={client as never} identity={administratorIdentity} />);

      fireEvent.click(await screen.findByRole('button', { name: /发布生效/ }));
      const popover = await screen.findByText('从模型目录发布网关路由');
      expect(popover).toBeInTheDocument();
      expect(screen.getByText(/草稿模型（未启用）/)).toBeInTheDocument();
      expect(screen.getByText(/残缺模型（映射不完整）/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '发布生效' }));
      expect(await screen.findByText(/发布失败：AEP 503 UNAVAILABLE/)).toBeInTheDocument();
      expect(client.dataPlane).toHaveBeenCalledTimes(1);
    },
    TIMEOUT,
  );

  test(
    'hides the publish action without data-plane permission',
    async () => {
      const client = makeBaseClient();
      render(<Models client={client as never} identity={operatorIdentity} />);
      await screen.findByRole('heading', { name: '模型列表' });
      expect(screen.queryByRole('button', { name: /发布生效/ })).not.toBeInTheDocument();
    },
    TIMEOUT,
  );
});
