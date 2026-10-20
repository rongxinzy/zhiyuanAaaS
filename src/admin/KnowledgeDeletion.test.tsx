// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { base, lifecycleDocument, makePortal, render } from '../../tests/helpers/knowledge-management.js';
import { KnowledgeManagement } from './KnowledgeManagement.js';
import { PortalError } from './portal.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const document = { ...lifecycleDocument('completed'), enable_status: 'enabled' };
const page = (present: boolean) => ({ data: present ? [document] : [], total: present ? 1 : 0, page: 1, pageSize: 10 });

async function deleteDocument() {
  fireEvent.click(screen.getByRole('menuitem', { name: /删除资料/ }));
  fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
}

test('keeps an accepted deletion pending through an old completed list and refreshes until the row disappears', async () => {
  let submitted = false;
  let readsAfterDelete = 0;
  const action = vi.fn().mockImplementation(async () => {
    submitted = true;
    return { operationId: 'delete-operation' };
  });
  const list = vi.fn().mockImplementation(async (_id, options) => {
    if (options.parseStatus) return page(false);
    if (submitted) readsAfterDelete++;
    return page(!submitted || readsAfterDelete === 1);
  });
  const portal = makePortal({ listManagedKnowledgeDocuments: list, runManagedKnowledgeDocumentAction: action });
  render(<KnowledgeManagement portal={portal} baseId={base.id} />);
  await screen.findByText(document.name);
  await deleteDocument();
  await waitFor(() => expect(screen.getByText('删除中')).toBeInTheDocument());
  expect(screen.getByText(document.name)).toBeInTheDocument();
  expect(screen.queryByText('已完成')).not.toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /删除资料/ })).toBeDisabled();
  expect(screen.getAllByText(/delete-operation/).length).toBeGreaterThan(0);
  await waitFor(() => expect(screen.queryByText(document.name)).not.toBeInTheDocument(), { timeout: 3500 });
  expect(screen.getByText(/资料已从当前列表移除/)).toBeInTheDocument();
  expect(action).toHaveBeenCalledTimes(1);
  expect(readsAfterDelete).toBeGreaterThanOrEqual(2);
});

test('stops automatic checks at the bound and preserves operation id and manual refresh', async () => {
  let removed = false;
  const action = vi.fn().mockResolvedValue({ operationId: 'slow-delete-operation' });
  const list = vi.fn().mockImplementation(async (_id, options) => (options.parseStatus ? page(false) : page(!removed)));
  render(
    <KnowledgeManagement
      portal={makePortal({ listManagedKnowledgeDocuments: list, runManagedKnowledgeDocumentAction: action })}
      baseId={base.id}
    />,
  );
  await screen.findByText(document.name);
  await deleteDocument();
  await screen.findByText('删除中');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 32000);
  await screen.findByText(/暂未确认删除结果/, {}, { timeout: 2500 });
  const count = list.mock.calls.length;
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
  });
  expect(list).toHaveBeenCalledTimes(count);
  expect(screen.getAllByText(/slow-delete-operation/).length).toBeGreaterThan(0);
  vi.useRealTimers();
  removed = true;
  const alert = screen.getByText(/暂未确认删除结果/).closest('.ant-alert')!;
  fireEvent.click(within(alert as HTMLElement).getByRole('button', { name: /刷\s*新/ }));
  await waitFor(() => expect(screen.queryByText(document.name)).not.toBeInTheDocument());
  expect(action).toHaveBeenCalledTimes(1);
});

test('does not replay an uncertain deletion or globally lock unrelated writes', async () => {
  const action = vi
    .fn()
    .mockRejectedValue(new PortalError(502, 'upstream unavailable', 'UPSTREAM_ERROR', 'uncertain-delete-operation'));
  render(
    <KnowledgeManagement
      portal={makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue(page(true)),
        runManagedKnowledgeDocumentAction: action,
      })}
      baseId={base.id}
    />,
  );
  await screen.findByText(document.name);
  await deleteDocument();
  await screen.findByText('删除结果待确认');
  expect(screen.queryByText('删除中')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /添加资料/ })).not.toBeDisabled();
  expect(screen.getByRole('menuitem', { name: /删除资料/ })).toBeDisabled();
  expect(action).toHaveBeenCalledTimes(1);
});

test('aborts a pending list poll when changing base and ignores its late result', async () => {
  const second = { ...base, id: 'kb-second', name: 'Second base' };
  let submitted = false;
  let finish!: () => void;
  let pollSignal: AbortSignal | undefined;
  let submittedReads = 0;
  const list = vi.fn().mockImplementation(async (id, options, signal) => {
    if (options.parseStatus || id === second.id) return page(false);
    if (submitted && ++submittedReads > 1) {
      pollSignal = signal;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return page(false);
    }
    return page(true);
  });
  const portal = makePortal({
    listManagedKnowledgeBases: vi.fn().mockResolvedValue([base, second]),
    getManagedKnowledgeBase: vi.fn().mockImplementation(async (id) => (id === second.id ? second : base)),
    listManagedKnowledgeDocuments: list,
    runManagedKnowledgeDocumentAction: vi.fn().mockImplementation(async () => {
      submitted = true;
      return { operationId: 'first-base-delete' };
    }),
  });
  const view = render(<KnowledgeManagement portal={portal} baseId={base.id} />);
  await screen.findByText(document.name);
  await deleteDocument();
  await waitFor(() => expect(pollSignal).toBeDefined(), { timeout: 3500 });
  view.rerender(<KnowledgeManagement portal={portal} baseId={second.id} />);
  await screen.findByRole('heading', { name: second.name });
  expect(pollSignal?.aborted).toBe(true);
  await act(async () => finish());
  expect(screen.queryByText(/资料已从当前列表移除/)).not.toBeInTheDocument();
  expect(screen.queryByText(document.name)).not.toBeInTheDocument();
});

test('tracks each accepted batch deletion while retaining the rejected document', async () => {
  const rejected = { ...document, id: 'doc-rejected', name: 'Rejected document' };
  let accepted = false;
  let reads = 0;
  const action = vi.fn().mockImplementation(async (id) => {
    if (id === rejected.id) throw new PortalError(409, 'protected', 'KNOWLEDGE_BASE_IN_USE');
    accepted = true;
    return { operationId: 'batch-delete-operation' };
  });
  const list = vi.fn().mockImplementation(async (_id, options) => {
    if (options.parseStatus) return page(false);
    const documents = accepted && ++reads > 1 ? [rejected] : [document, rejected];
    return { ...page(false), data: documents, total: documents.length };
  });
  render(
    <KnowledgeManagement
      portal={makePortal({ listManagedKnowledgeDocuments: list, runManagedKnowledgeDocumentAction: action })}
      baseId={base.id}
    />,
  );
  await screen.findByText(document.name);
  fireEvent.click(screen.getAllByRole('checkbox')[0]!);
  fireEvent.click(within(screen.getByRole('region', { name: '批量操作' })).getByRole('button', { name: /删\s*除/ }));
  fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
  await screen.findByText('删除中');
  await waitFor(() => expect(screen.queryByText(document.name)).not.toBeInTheDocument(), { timeout: 3500 });
  expect(screen.getByText(rejected.name)).toBeInTheDocument();
  expect(action.mock.calls).toEqual([
    [document.id, 'delete'],
    [rejected.id, 'delete'],
  ]);
  expect(screen.getByText(/batch-delete-operation/)).toBeInTheDocument();
});

test('keeps pending deletion and its operation after a failed reconciliation read', async () => {
  let submitted = false;
  let reads = 0;
  const action = vi.fn().mockImplementation(async () => {
    submitted = true;
    return { operationId: 'read-recovery-operation' };
  });
  const list = vi.fn().mockImplementation(async (_id, options) => {
    if (options.parseStatus) return page(false);
    if (submitted && ++reads === 1) throw new PortalError(503, 'temporarily unavailable');
    return page(!submitted);
  });
  render(
    <KnowledgeManagement
      portal={makePortal({ listManagedKnowledgeDocuments: list, runManagedKnowledgeDocumentAction: action })}
      baseId={base.id}
    />,
  );
  await screen.findByText(document.name);
  await deleteDocument();
  await screen.findByText('temporarily unavailable');
  expect(screen.getByText(document.name)).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /删除资料/ })).toBeDisabled();
  expect(screen.getAllByText(/read-recovery-operation/).length).toBeGreaterThan(0);
  await waitFor(() => expect(screen.queryByText(document.name)).not.toBeInTheDocument(), { timeout: 3500 });
  expect(action).toHaveBeenCalledTimes(1);
});
