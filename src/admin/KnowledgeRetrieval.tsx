import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Input, Pagination, Segmented, Select, Space, Tag, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { knowledgeErrorText } from './knowledge-error.js';
import type { EmployeeKnowledgeSearchHit, EmployeeKnowledgeSource, PortalClient } from './portal.js';

const tr = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);

export type KnowledgeSearchMode = 'library' | 'agent';

export function KnowledgeRetrieval({
  portal,
  baseId,
  mode: controlledMode,
  onModeChange,
}: {
  readonly portal: PortalClient;
  readonly baseId: string;
  readonly mode?: KnowledgeSearchMode;
  readonly onModeChange?: (mode: KnowledgeSearchMode) => void;
}) {
  const { token } = theme.useToken();
  const [localMode, setLocalMode] = useState<KnowledgeSearchMode>('library');
  const mode = controlledMode ?? localMode;
  const employeesQuery = useQuery({
    // Scoped away from App.tsx's ['portal', 'employees'], which caches
    // `.catch(() => null)` successes; this page must surface load errors.
    queryKey: ['portal', 'knowledge-retrieval', 'employees'],
    queryFn: ({ signal }) => portal.listEmployees(signal),
    enabled: mode === 'agent',
  });
  const employees = employeesQuery.data ?? [];
  const employeeLoading = employeesQuery.isPending;
  const employeeError = employeesQuery.error ? knowledgeErrorText(employeesQuery.error) : null;
  const [employee, setEmployee] = useState<string>();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<{
    readonly mode: KnowledgeSearchMode;
    readonly employee: string | undefined;
    readonly query: string;
    readonly attempt: number;
  } | null>(null);
  const [sourceHit, setSourceHit] = useState<EmployeeKnowledgeSearchHit | null>(null);
  const [sourcePage, setSourcePage] = useState(1);

  // Reset everything derived from the employee/base/mode when any changes,
  // during render so no stale search/source request can fire in between.
  const selectionKey = `${baseId} ${mode} ${employee ?? ''}`;
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (selectionKey !== prevSelectionKey) {
    setPrevSelectionKey(selectionKey);
    setSubmitted(null);
    setSourceHit(null);
    setSourcePage(1);
  }

  const searchQuery = useQuery({
    queryKey: [
      'portal',
      'knowledge-retrieval',
      'search',
      baseId,
      submitted?.mode ?? null,
      submitted?.employee ?? null,
      submitted?.query ?? null,
      submitted?.attempt ?? 0,
    ],
    queryFn: ({ signal }) => {
      const input = { query: submitted?.query ?? '', mode: 'hybrid' as const, limit: 10 };
      return submitted?.mode === 'library'
        ? portal.searchManagedKnowledge(baseId, input, signal)
        : portal.searchEmployeeKnowledge(submitted?.employee ?? '', { ...input, knowledge_base_ids: [baseId] }, signal);
    },
    enabled: submitted !== null,
  });
  const results = searchQuery.data?.results ?? null;
  const searching = searchQuery.isFetching;
  const searchError = searchQuery.error && !searchQuery.isFetching ? knowledgeErrorText(searchQuery.error) : null;

  const sourceQuery = useQuery({
    queryKey: [
      'portal',
      'knowledge-retrieval',
      'source',
      mode,
      baseId,
      employee ?? null,
      sourceHit?.source.document_id ?? null,
      sourcePage,
    ],
    queryFn: ({ signal }) =>
      mode === 'library'
        ? portal.getManagedKnowledgeSource(baseId, sourceHit?.source.document_id ?? '', sourcePage, 20, signal)
        : portal.getEmployeeKnowledgeSource(
            employee ?? '',
            sourceHit?.source.document_id ?? '',
            sourcePage,
            20,
            signal,
          ),
    enabled: sourceHit !== null && (mode === 'library' || employee !== undefined),
  });
  const source: EmployeeKnowledgeSource | null = sourceQuery.data ?? null;
  const sourceLoading = sourceQuery.isFetching;
  const sourceError = sourceQuery.error && !sourceQuery.isFetching ? knowledgeErrorText(sourceQuery.error) : null;

  // A search that takes more than 2s shows a hint; it clears as soon as the
  // request settles (success or failure).
  const [searchingHint, setSearchingHint] = useState(false);
  useEffect(() => {
    if (!searching) {
      setSearchingHint(false);
      return;
    }
    const slowTimer = window.setTimeout(() => setSearchingHint(true), 2000);
    return () => window.clearTimeout(slowTimer);
  }, [searching]);

  const runSearch = () => {
    if ((mode === 'agent' && !employee) || !query.trim() || searching) return;
    setSourceHit(null);
    setSourcePage(1);
    // A fresh attempt forces a new query key (and cleared results) even when
    // the employee/query pair is unchanged, matching the old re-search.
    setSubmitted({ mode, employee, query: query.trim(), attempt: (submitted?.attempt ?? 0) + 1 });
  };

  const loadSource = (hit: EmployeeKnowledgeSearchHit, page: number) => {
    if (mode === 'agent' && !employee) return;
    if (sourceHit === hit && sourcePage === page) {
      void sourceQuery.refetch();
      return;
    }
    setSourceHit(hit);
    setSourcePage(page);
  };

  const examples = [tr('knowledgeExampleTravel'), tr('knowledgeExampleLeave'), tr('knowledgeExampleOnboarding')];

  return (
    <section aria-label={tr('knowledgeRetrieval')} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {tr('knowledgeRetrieval')}
          </Typography.Title>
          <Typography.Text type="secondary">{tr('knowledgeRetrievalHint')}</Typography.Text>
        </div>
      </div>
      <Segmented<KnowledgeSearchMode>
        value={mode}
        onChange={(value) => {
          setLocalMode(value);
          onModeChange?.(value);
        }}
        options={[
          {
            label: tr('knowledgeSearchLibrary'),
            value: 'library',
          },
          { label: tr('knowledgeSearchAgent'), value: 'agent' },
        ]}
      />
      <Typography.Text type="secondary">
        {tr(mode === 'library' ? 'knowledgeSearchLibraryHint' : 'knowledgeSearchAgentHint')}
      </Typography.Text>
      {mode === 'agent' && employeeError ? (
        <Alert showIcon type="error" title={tr('knowledgeSearchEmployeesFailed')} description={employeeError} />
      ) : (
        <Space orientation="vertical" style={{ width: '100%' }}>
          {mode === 'agent' && (
            <Space wrap>
              <Typography.Text>{tr('knowledgeSearchEmployee')}</Typography.Text>
              <Select
                aria-label={tr('knowledgeSearchEmployee')}
                showSearch={{ optionFilterProp: 'label' }}
                loading={employeeLoading}
                value={employee}
                onChange={setEmployee}
                options={employees.map((item) => ({
                  value: item.name,
                  label: `${item.displayName} (${item.name})`,
                }))}
                placeholder={tr('knowledgeSearchEmployee')}
                style={{ minWidth: 240 }}
              />
            </Space>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              size="large"
              aria-label={tr('knowledgeSearchQuery')}
              value={query}
              maxLength={4000}
              prefix={<SearchOutlined />}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => void runSearch()}
              placeholder={tr('knowledgeSearchQuery')}
            />
            <Button
              type="primary"
              size="large"
              loading={searching}
              disabled={(mode === 'agent' && !employee) || !query.trim()}
              onClick={() => void runSearch()}
            >
              {tr('knowledgeSearchButton')}
            </Button>
          </div>
          <Space wrap>
            <Typography.Text type="secondary">{tr('knowledgeSearchTry')}</Typography.Text>
            {examples.map((example) => (
              <Button key={example} type="text" size="small" onClick={() => setQuery(example)}>
                {example}
              </Button>
            ))}
          </Space>
        </Space>
      )}
      {searching && searchingHint ? <Alert showIcon type="info" title={tr('knowledgeSearchSlowHint')} /> : null}
      {searchError && <Alert showIcon type="error" title={tr('knowledgeSearchFailed')} description={searchError} />}
      {results === null && !searching && !searchError ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <SearchOutlined style={{ fontSize: 28 }} />
          <Typography.Title level={5} style={{ margin: 0 }}>
            {tr('knowledgeSearchWelcome')}
          </Typography.Title>
          <Typography.Text type="secondary">{tr('knowledgeSearchWelcomeHint')}</Typography.Text>
        </div>
      ) : null}
      {results !== null && results.length === 0 ? <Empty description={tr('knowledgeSearchEmpty')} /> : null}
      {results !== null && results.length > 0 ? (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {results.map((hit, index) => (
              <div
                key={`${hit.source.document_id}:${hit.source.chunk_id}`}
                className="rounded-md border p-3"
                style={{ borderColor: token.colorBorder }}
              >
                <Space>
                  <Tag>{tr('knowledgeHitFragment').replace('{index}', String(index + 1))}</Tag>
                </Space>
                <div>
                  <Button type="link" style={{ padding: 0 }} onClick={() => void loadSource(hit, 1)}>
                    {hit.source.title || hit.source.document_id}
                  </Button>
                </div>
                <Typography.Paragraph
                  ellipsis={{ rows: 3, expandable: true, symbol: tr('knowledgeExpand') }}
                  style={{ marginBottom: 0 }}
                >
                  {hit.content}
                </Typography.Paragraph>
              </div>
            ))}
          </div>
          <section aria-label={tr('knowledgeSource')} className="min-w-0 flex-1">
            <Typography.Title level={5}>{tr('knowledgeSource')}</Typography.Title>
            {sourceError && (
              <Alert showIcon type="error" title={tr('knowledgeSourceFailed')} description={sourceError} />
            )}
            {sourceHit && source && (
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Typography.Text strong>{sourceHit.source.title}</Typography.Text>
                <Typography.Text type="secondary">
                  {tr('knowledgeMatchedChunk')}: {sourceHit.source.chunk_id}
                </Typography.Text>
                {!source.chunks.some(
                  (chunk) => chunk.id === sourceHit.source.chunk_id && chunk.content === sourceHit.content,
                ) && <Typography.Paragraph>{sourceHit.content}</Typography.Paragraph>}
                <Typography.Text type="secondary">
                  {source.document.file_name || source.document.id} · {source.document.file_type || '—'}
                </Typography.Text>
                {source.chunks.map((chunk) => (
                  <Typography.Paragraph key={chunk.id} style={{ marginBottom: 8 }}>
                    {chunk.content}
                  </Typography.Paragraph>
                ))}
                <Pagination
                  current={sourcePage}
                  pageSize={source.page_size}
                  total={source.total}
                  showSizeChanger={false}
                  onChange={(page) => sourceHit && void loadSource(sourceHit, page)}
                  showTotal={(total, range) => `${range[0]}-${range[1]} / ${total}`}
                />
              </Space>
            )}
            {sourceLoading && !source ? (
              <Typography.Text type="secondary">{tr('statusLoading')}</Typography.Text>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
