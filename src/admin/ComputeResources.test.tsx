/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, expect, test, vi } from 'vitest';
import { renderWithQueryClient } from '../../tests/helpers/query-client.js';
import { ComputeResources } from './ComputeResources.js';
import { type AdminConsoleClient, type AdminIdentity, AdminRequestError } from './client.js';
import { administratorIdentity } from './test-fixtures.js';

vi.mock('./notifications.js', () => ({ notify: vi.fn() }));
afterEach(cleanup);

const settings = {
  modelGatewayBaseUrl: { override: null, effectiveValue: null, source: 'unset' },
  computeDefaultTier: { override: null, effectiveValue: 'standard', source: 'env' },
  computeIdleHibernateSeconds: { override: null, effectiveValue: 300, source: 'env' },
  computeConcurrencyCap: { override: null, effectiveValue: null, source: 'unset' },
};
const tiers = [
  {
    name: 'standard',
    description: '默认档位',
    cpuRequest: '250m',
    cpuLimit: '1000m',
    memoryRequest: '512Mi',
    memoryLimit: '1Gi',
    source: 'deployment',
  },
  {
    name: 'performance',
    cpuRequest: '1',
    cpuLimit: '2',
    memoryRequest: '2Gi',
    memoryLimit: '4Gi',
    source: 'deployment',
  },
];
const assignments = [
  {
    agentId: 'agent-1',
    agentName: '销售助理',
    tier: { override: 'performance', effective: 'performance', source: 'override' },
    updatedAt: '2026-10-10T08:00:00Z',
    updatedBy: 'admin-1',
  },
  { agentId: 'agent-2', tier: { override: null, effective: 'standard', source: 'default' } },
];

function setup(overrides: Record<string, unknown> = {}, identity: AdminIdentity = administratorIdentity) {
  const client = {
    deploymentSettings: vi.fn().mockResolvedValue(settings),
    computeTierCatalog: vi.fn().mockResolvedValue(tiers),
    computeAssignments: vi.fn().mockResolvedValue(assignments),
    updateDeploymentSettings: vi.fn().mockResolvedValue(settings),
    updateComputeAssignment: vi.fn().mockResolvedValue(assignments[1]),
    ...overrides,
  };
  renderWithQueryClient(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
      <ComputeResources client={client as unknown as AdminConsoleClient} identity={identity} />
    </ConfigProvider>,
  );
  return { client };
}

function card(title: string): HTMLElement {
  const heading = screen.getByText(title);
  const node = heading.closest('section') ?? heading.closest('.ant-card');
  expect(node).toBeTruthy();
  return node as HTMLElement;
}

async function pickOption(dialog: HTMLElement, optionName: RegExp) {
  fireEvent.mouseDown(within(dialog).getByRole('combobox'));
  const option = await waitFor(() => {
    const node = [
      ...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
    ]
      .reverse()
      .find((item) => optionName.test(item.textContent ?? ''));
    expect(node).toBeTruthy();
    return node!;
  });
  fireEvent.click(option);
}

test('renders the tier catalog, default policy and assignments from the three reads', async () => {
  setup();
  await screen.findByText('数字员工资源分配');

  const tiersCard = card('运行档位');
  await within(tiersCard).findByText('standard');
  within(tiersCard).getByText('performance');
  within(tiersCard).getByText('250m / 1000m');
  expect(within(tiersCard).getAllByText('部署配置')).toHaveLength(2);

  const policyCard = card('默认策略');
  within(policyCard).getByText('standard');
  within(policyCard).getByText('5 分钟（300 秒）');
  expect(within(policyCard).getAllByText('部署默认')).toHaveLength(2);
  // The unset concurrency cap shows the placeholder both as value and source tag.
  expect(within(policyCard).getAllByText('未配置')).toHaveLength(2);

  const assignmentsCard = card('员工档位指派');
  await within(assignmentsCard).findByText('销售助理');
  within(assignmentsCard).getByText('agent-2');
  within(assignmentsCard).getByText('覆盖');
  within(assignmentsCard).getByText('默认');
  within(assignmentsCard).getByText(/admin-1/);
});

test('edits the default policy, sending values and explicit null clears', async () => {
  const { client } = setup();
  const policyCard = card('默认策略');
  await within(policyCard).findByText('5 分钟（300 秒）');
  fireEvent.click(await within(policyCard).findByRole('button', { name: '编辑' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('空闲休眠'), { target: { value: '600' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(client.updateDeploymentSettings).toHaveBeenCalledWith({
      computeDefaultTier: 'standard',
      computeIdleHibernateSeconds: 600,
      computeConcurrencyCap: null,
    }),
  );
});

test('rejects out-of-range hibernate input at the control level', async () => {
  const { client } = setup();
  const policyCard = card('默认策略');
  await within(policyCard).findByText('5 分钟（300 秒）');
  fireEvent.click(await within(policyCard).findByRole('button', { name: '编辑' }));
  const dialog = await screen.findByRole('dialog');
  // antd InputNumber enforces the 60–86400 range at input time: the invalid
  // value never enters the form state, so the submit carries the previous one.
  fireEvent.change(within(dialog).getByLabelText('空闲休眠'), { target: { value: '59' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(client.updateDeploymentSettings).toHaveBeenCalledWith({
      computeDefaultTier: 'standard',
      computeIdleHibernateSeconds: 300,
      computeConcurrencyCap: null,
    }),
  );
});

test('keeps the policy draft open with the server detail on a 422 rejection', async () => {
  const failing = {
    updateDeploymentSettings: vi
      .fn()
      .mockRejectedValue(
        new AdminRequestError(
          422,
          'INVALID_DEPLOYMENT_SETTINGS',
          'The computeDefaultTier is not in the compute tier catalog.',
        ),
      ),
  };
  const { client } = setup(failing);
  const policyCard = card('默认策略');
  await within(policyCard).findByText('5 分钟（300 秒）');
  fireEvent.click(await within(policyCard).findByRole('button', { name: '编辑' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(await within(dialog).findByText('设置被拒绝，请检查取值。')).toBeInTheDocument();
  expect(within(dialog).getByText('The computeDefaultTier is not in the compute tier catalog.')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(client.updateDeploymentSettings).toHaveBeenCalledTimes(1);
});

test('adjusts an employee tier through the adjust modal', async () => {
  const { client } = setup();
  const assignmentsCard = card('员工档位指派');
  const agentTwoRow = (await within(assignmentsCard).findByText('agent-2')).closest('tr') as HTMLElement;
  fireEvent.click(within(agentTwoRow).getByRole('button', { name: '调整' }));
  const dialog = await screen.findByRole('dialog');
  await pickOption(dialog, /^standard$/);
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() => expect(client.updateComputeAssignment).toHaveBeenCalledWith('agent-2', 'standard'));
});

test('clears an employee tier override with an explicit null', async () => {
  const { client } = setup();
  const assignmentsCard = card('员工档位指派');
  const agentOneRow = (await within(assignmentsCard).findByText('销售助理')).closest('tr') as HTMLElement;
  fireEvent.click(within(agentOneRow).getByRole('button', { name: '调整' }));
  const dialog = await screen.findByRole('dialog');
  const clear = dialog.querySelector('.ant-select-clear');
  expect(clear).toBeTruthy();
  fireEvent.click(clear as Element);
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() => expect(client.updateComputeAssignment).toHaveBeenCalledWith('agent-1', null));
});

test('surfaces an unknown-tier rejection inside the adjust modal', async () => {
  const failing = {
    updateComputeAssignment: vi
      .fn()
      .mockRejectedValue(
        new AdminRequestError(422, 'INVALID_COMPUTE_TIER', 'The tier is not in the compute tier catalog.'),
      ),
  };
  const { client } = setup(failing);
  const agentTwoRow = (await within(card('员工档位指派')).findByText('agent-2')).closest('tr') as HTMLElement;
  fireEvent.click(within(agentTwoRow).getByRole('button', { name: '调整' }));
  const dialog = await screen.findByRole('dialog');
  await pickOption(dialog, /^performance$/);
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(await within(dialog).findByText('档位不存在，请从目录中选择。')).toBeInTheDocument();
  expect(within(dialog).getByText('实例下次创建时生效；不会滚动更新现有实例。')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(client.updateComputeAssignment).toHaveBeenCalledWith('agent-2', 'performance');
});

test('disables write actions for a read-only identity', async () => {
  const readOnly: AdminIdentity = { ...administratorIdentity, roles: ['operator'], permissions: ['deployment.read'] };
  setup({}, readOnly);
  await screen.findByText('数字员工资源分配');
  expect(within(card('默认策略')).getByRole('button', { name: '编辑' })).toBeDisabled();
  for (const button of await within(card('员工档位指派')).findAllByRole('button', { name: '调整' })) {
    expect(button).toBeDisabled();
  }
});

test('shows the no-permission result without firing reads when deployment.read is missing', async () => {
  const { client } = setup({}, { ...administratorIdentity, roles: ['member'], permissions: [] });
  expect(await screen.findByText('没有管理权限查看资源分配。')).toBeInTheDocument();
  expect(client.deploymentSettings).not.toHaveBeenCalled();
});

test('shows the no-permission result when the server denies the reads with 403', async () => {
  setup({ deploymentSettings: vi.fn().mockRejectedValue(new AdminRequestError(403, 'ACCESS_DENIED', null)) });
  expect(await screen.findByText('没有管理权限查看资源分配。')).toBeInTheDocument();
});

test('surfaces a load failure with retry and recovers on the next attempt', async () => {
  const { client } = setup({
    deploymentSettings: vi
      .fn()
      .mockRejectedValueOnce(new AdminRequestError(500, 'INTERNAL_ERROR', 'temporary'))
      .mockResolvedValue(settings),
  });
  expect(await screen.findByText('数据加载失败')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await within(card('运行档位')).findByText('standard');
  expect(client.deploymentSettings).toHaveBeenCalledTimes(2);
});

test('renders empty catalog and assignment states and non-divisible hibernate seconds', async () => {
  const emptySettings = {
    ...settings,
    computeDefaultTier: { override: null, effectiveValue: null, source: 'unset' },
    computeIdleHibernateSeconds: { override: null, effectiveValue: 90, source: 'env' },
  };
  setup({
    deploymentSettings: vi.fn().mockResolvedValue(emptySettings),
    computeTierCatalog: vi.fn().mockResolvedValue([]),
    computeAssignments: vi.fn().mockResolvedValue([]),
  });
  expect(await screen.findByText('部署未提供档位。')).toBeInTheDocument();
  expect(screen.getByText('暂无员工。')).toBeInTheDocument();
  expect(await screen.findByText('90 秒')).toBeInTheDocument();
});
