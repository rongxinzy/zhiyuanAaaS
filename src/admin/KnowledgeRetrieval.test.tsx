// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeRetrieval } from './KnowledgeRetrieval.js';
import type { PortalClient } from './portal.js';
import { PortalError } from './portal.js';

const searchFixture = {
  query: 'refund',
  mode: 'hybrid',
  results: [
    {
      score: 0.92,
      content: 'Refunds are available within 30 days.',
      source: { knowledge_base_id: 'kb-1', document_id: 'doc-1', chunk_id: 'chunk-1', title: 'Refund policy' },
    },
  ],
} as const;
const sourceFixture = {
  document: {
    id: 'doc-1',
    title: 'Refund policy',
    file_name: 'refund.pdf',
    file_type: 'pdf',
    source: 'upload',
    knowledge_base_id: 'kb-1',
  },
  chunks: [{ id: 'chunk-1', seq_id: 1, chunk_type: 'text', content: 'Refunds are available within 30 days.' }],
  total: 1,
  page: 1,
  page_size: 20,
} as const;

function makePortal(overrides: Partial<PortalClient> = {}) {
  return {
    listEmployees: vi
      .fn()
      .mockResolvedValue([{ name: 'sales-helper', displayName: 'Sales helper', phase: 'Ready', ownerId: 'user-1' }]),
    searchEmployeeKnowledge: vi.fn().mockResolvedValue(searchFixture),
    getEmployeeKnowledgeSource: vi.fn().mockResolvedValue(sourceFixture),
    searchManagedKnowledge: vi.fn().mockResolvedValue(searchFixture),
    getManagedKnowledgeSource: vi.fn().mockResolvedValue(sourceFixture),
    ...overrides,
  } as unknown as PortalClient;
}

describe('KnowledgeRetrieval', () => {
  afterEach(() => cleanup());

  test('searches this library without an employee and pages its verified source', async () => {
    const portal = makePortal({
      listEmployees: vi.fn().mockRejectedValue(new Error('employee service unavailable')),
      getManagedKnowledgeSource: vi
        .fn()
        .mockImplementation((_base, _document, page) => Promise.resolve({ ...sourceFixture, total: 40, page })),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" />
      </ConfigProvider>,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(portal.listEmployees).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    expect(await screen.findByText('Refunds are available within 30 days.')).toBeInTheDocument();
    expect(portal.searchManagedKnowledge).toHaveBeenCalledWith(
      'kb-1',
      { query: 'refund', mode: 'hybrid', limit: 10 },
      expect.any(AbortSignal),
    );
    expect(portal.searchEmployeeKnowledge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Refund policy' }));
    expect(await screen.findByText('refund.pdf · pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('2'));
    await waitFor(() =>
      expect(portal.getManagedKnowledgeSource).toHaveBeenLastCalledWith(
        'kb-1',
        'doc-1',
        2,
        20,
        expect.any(AbortSignal),
      ),
    );
    expect(portal.getEmployeeKnowledgeSource).not.toHaveBeenCalled();
  });

  test('switching to Agent checks cancels a pending library search', async () => {
    let resolveSearch!: (value: { query: string; mode: 'hybrid'; results: [] }) => void;
    let signal!: AbortSignal;
    const portal = makePortal({
      searchManagedKnowledge: vi.fn().mockImplementation((_base, _input, requestSignal) => {
        signal = requestSignal;
        return new Promise((resolve) => {
          resolveSearch = resolve;
        });
      }),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" />
      </ConfigProvider>,
    );
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    fireEvent.click(screen.getByText(translate(ADMIN_LANGUAGE, 'knowledgeSearchAgent')));
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    expect(signal.aborted).toBe(true);
    resolveSearch({ query: 'refund', mode: 'hybrid', results: [] });
    await waitFor(() =>
      expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeSearchEmpty'))).not.toBeInTheDocument(),
    );
  });

  test('a base change cancels an outstanding library source and clears results', async () => {
    let resolveSource!: (value: unknown) => void;
    let signal!: AbortSignal;
    const portal = makePortal({
      getManagedKnowledgeSource: vi.fn().mockImplementation((_base, _doc, _page, _size, requestSignal) => {
        signal = requestSignal;
        return new Promise((resolve) => {
          resolveSource = resolve;
        });
      }),
    });
    const view = render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" />
      </ConfigProvider>,
    );
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refund policy' }));
    await waitFor(() => expect(portal.getManagedKnowledgeSource).toHaveBeenCalled());
    view.rerender(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-2" />
      </ConfigProvider>,
    );
    expect(signal.aborted).toBe(true);
    resolveSource({ document: { file_name: 'stale.pdf' }, chunks: [], page: 1, page_size: 20, total: 0 });
    await waitFor(() => expect(screen.queryByText(/stale.pdf|Refund policy/)).not.toBeInTheDocument());
  });

  test('library failure is an error rather than an empty result', async () => {
    const portal = makePortal({
      searchManagedKnowledge: vi.fn().mockRejectedValue(new PortalError(503, 'Search unavailable')),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" />
      </ConfigProvider>,
    );
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    expect(await screen.findByText('Search unavailable')).toBeInTheDocument();
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeSearchEmpty'))).not.toBeInTheDocument();
  });

  test('clears a pending search when the selected employee changes', async () => {
    let resolveSearch!: (value: Awaited<ReturnType<PortalClient['searchEmployeeKnowledge']>>) => void;
    const portal = makePortal({
      listEmployees: vi.fn().mockResolvedValue([
        { name: 'sales-helper', displayName: 'Sales helper', phase: 'Ready', ownerId: 'user-1' },
        { name: 'support-helper', displayName: 'Support helper', phase: 'Ready', ownerId: 'user-1' },
      ]),
      searchEmployeeKnowledge: vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => (resolveSearch = resolve)))
        .mockResolvedValueOnce({ query: 'current', mode: 'hybrid', results: [] }),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" mode="agent" />
      </ConfigProvider>,
    );
    const employeeSelect = screen.getByRole('combobox', {
      name: translate(ADMIN_LANGUAGE, 'knowledgeSearchEmployee'),
    });
    fireEvent.mouseDown(employeeSelect);
    fireEvent.click(await screen.findByText('Sales helper (sales-helper)'));
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'old' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    fireEvent.mouseDown(employeeSelect);
    fireEvent.click(await screen.findByText('Support helper (support-helper)'));
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'current' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeSearchEmpty'))).toBeInTheDocument();
    resolveSearch({
      query: 'old',
      mode: 'hybrid',
      results: [
        {
          score: 1,
          content: 'stale result',
          source: { knowledge_base_id: 'kb-1', document_id: 'old-doc', chunk_id: 'old-chunk', title: 'Old source' },
        },
      ],
    });
    await waitFor(() => expect(screen.queryByText('stale result')).not.toBeInTheDocument());
  });

  test('a new search cancels an in-flight source load', async () => {
    let resolveSource!: (value: Awaited<ReturnType<PortalClient['getEmployeeKnowledgeSource']>>) => void;
    const portal = makePortal({
      getEmployeeKnowledgeSource: vi.fn().mockImplementation(() => new Promise((resolve) => (resolveSource = resolve))),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" mode="agent" />
      </ConfigProvider>,
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: translate(ADMIN_LANGUAGE, 'knowledgeSearchEmployee') }));
    fireEvent.click(await screen.findByText('Sales helper (sales-helper)'));
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refund policy' }));
    await waitFor(() => expect(portal.getEmployeeKnowledgeSource).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'new query' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    resolveSource({
      document: {
        id: 'doc-1',
        title: 'Refund policy',
        file_name: 'refund.pdf',
        file_type: 'pdf',
        source: 'upload',
        knowledge_base_id: 'kb-1',
      },
      chunks: [{ id: 'chunk-1', seq_id: 1, chunk_type: 'text', content: 'stale source chunk' }],
      total: 1,
      page: 1,
      page_size: 20,
    });
    await waitFor(() => expect(screen.queryByText('stale source chunk')).not.toBeInTheDocument());
  });

  test('searches only the selected employee/base and opens verified source chunks', async () => {
    const portal = makePortal();
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" mode="agent" />
      </ConfigProvider>,
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: translate(ADMIN_LANGUAGE, 'knowledgeSearchEmployee') }));
    fireEvent.click(await screen.findByText('Sales helper (sales-helper)'));
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));

    expect(await screen.findByText('Refunds are available within 30 days.')).toBeInTheDocument();
    await waitFor(() =>
      expect(portal.searchEmployeeKnowledge).toHaveBeenCalledWith(
        'sales-helper',
        { query: 'refund', knowledge_base_ids: ['kb-1'], mode: 'hybrid', limit: 10 },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refund policy' }));
    expect(await screen.findByText('refund.pdf · pdf')).toBeInTheDocument();
    expect(screen.getAllByText('Refunds are available within 30 days.')).toHaveLength(2);
    expect(portal.getEmployeeKnowledgeSource).toHaveBeenCalledWith(
      'sales-helper',
      'doc-1',
      1,
      20,
      expect.any(AbortSignal),
    );
  });

  test('shows the matched fragment even when the current source page contains other chunks', async () => {
    const portal = makePortal({
      getEmployeeKnowledgeSource: vi.fn().mockResolvedValue({
        document: { id: 'doc-1', file_name: 'refund.pdf', file_type: 'pdf' },
        chunks: [{ id: 'chunk-2', content: 'Another source page' }],
        total: 40,
        page: 1,
        page_size: 20,
      }),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" mode="agent" />
      </ConfigProvider>,
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: translate(ADMIN_LANGUAGE, 'knowledgeSearchEmployee') }));
    fireEvent.click(await screen.findByText('Sales helper (sales-helper)'));
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refund policy' }));
    const source = within(screen.getByRole('region', { name: translate(ADMIN_LANGUAGE, 'knowledgeSource') }));
    expect(await source.findByText('Another source page')).toBeInTheDocument();
    expect(source.getByText('Refunds are available within 30 days.')).toBeInTheDocument();
    expect(source.getByText(/chunk-1/)).toBeInTheDocument();
  });

  test('shows agent authorization failures with the not-granted text instead of management forbidden', async () => {
    const portal = makePortal({
      searchEmployeeKnowledge: vi
        .fn()
        .mockRejectedValue(new PortalError(403, 'knowledge access denied', 'KNOWLEDGE_NOT_GRANTED')),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" mode="agent" />
      </ConfigProvider>,
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: translate(ADMIN_LANGUAGE, 'knowledgeSearchEmployee') }));
    fireEvent.click(await screen.findByText('Sales helper (sales-helper)'));
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /开\s*始/ }));
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeNotGranted'))).toBeInTheDocument();
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeForbiddenManaged'))).not.toBeInTheDocument();
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeSearchEmpty'))).not.toBeInTheDocument();
  });

  test('shows library access-denied text instead of management forbidden', async () => {
    const portal = makePortal({
      searchManagedKnowledge: vi
        .fn()
        .mockRejectedValue(new PortalError(403, 'base denied', 'KNOWLEDGE_ACCESS_DENIED')),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" mode="library" />
      </ConfigProvider>,
    );
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /开\s*始/ }));
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeAccessDenied'))).toBeInTheDocument();
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeForbiddenManaged'))).not.toBeInTheDocument();
  });

  test('shows admin-required text for managed retrieval without admin role', async () => {
    const portal = makePortal({
      searchManagedKnowledge: vi.fn().mockRejectedValue(new PortalError(403, 'admin only', 'ADMIN_REQUIRED')),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" mode="library" />
      </ConfigProvider>,
    );
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /开\s*始/ }));
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeAdminRequired'))).toBeInTheDocument();
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeForbiddenManaged'))).not.toBeInTheDocument();
  });
});
