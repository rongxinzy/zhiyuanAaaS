// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeRetrieval } from './KnowledgeRetrieval.js';
import type { PortalClient } from './portal.js';
import { PortalError } from './portal.js';

function makePortal(overrides: Partial<PortalClient> = {}) {
  return {
    listEmployees: vi
      .fn()
      .mockResolvedValue([{ name: 'sales-helper', displayName: 'Sales helper', phase: 'Ready', ownerId: 'user-1' }]),
    searchEmployeeKnowledge: vi.fn().mockResolvedValue({
      query: 'refund',
      mode: 'hybrid',
      results: [
        {
          score: 0.92,
          content: 'Refunds are available within 30 days.',
          source: { knowledge_base_id: 'kb-1', document_id: 'doc-1', chunk_id: 'chunk-1', title: 'Refund policy' },
        },
      ],
    }),
    getEmployeeKnowledgeSource: vi.fn().mockResolvedValue({
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
    }),
    ...overrides,
  } as unknown as PortalClient;
}

describe('KnowledgeRetrieval', () => {
  afterEach(() => cleanup());

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
        <KnowledgeRetrieval portal={portal} baseId="kb-1" />
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
        <KnowledgeRetrieval portal={portal} baseId="kb-1" />
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
        <KnowledgeRetrieval portal={portal} baseId="kb-1" />
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

  test('shows authorization failures instead of an empty search result', async () => {
    const portal = makePortal({
      searchEmployeeKnowledge: vi.fn().mockRejectedValue(new PortalError(403, 'knowledge access denied')),
    });
    render(
      <ConfigProvider>
        <KnowledgeRetrieval portal={portal} baseId="kb-1" />
      </ConfigProvider>,
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: translate(ADMIN_LANGUAGE, 'knowledgeSearchEmployee') }));
    fireEvent.click(await screen.findByText('Sales helper (sales-helper)'));
    fireEvent.change(screen.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeSearchQuery')), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /检\s*索/ }));
    expect(await screen.findByText('knowledge access denied')).toBeInTheDocument();
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeSearchEmpty'))).not.toBeInTheDocument();
  });
});
