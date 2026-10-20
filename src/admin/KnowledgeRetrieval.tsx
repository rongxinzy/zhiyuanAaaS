import { SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Input, Pagination, Segmented, Select, Space, Tag, Typography, theme } from 'antd';
import { useEffect, useRef, useState } from 'react';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { knowledgeErrorText } from './knowledge-error.js';
import type { EmployeeKnowledgeSearchHit, EmployeeKnowledgeSource, PortalClient, PortalEmployee } from './portal.js';

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
  const [employees, setEmployees] = useState<readonly PortalEmployee[]>([]);
  const [employee, setEmployee] = useState<string>();
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly EmployeeKnowledgeSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchingHint, setSearchingHint] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sourceHit, setSourceHit] = useState<EmployeeKnowledgeSearchHit | null>(null);
  const [source, setSource] = useState<EmployeeKnowledgeSource | null>(null);
  const [sourcePage, setSourcePage] = useState(1);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const sourceController = useRef<AbortController | null>(null);
  const searchGeneration = useRef(0);
  const sourceGeneration = useRef(0);

  useEffect(() => {
    if (mode !== 'agent') return;
    const controller = new AbortController();
    setEmployeeLoading(true);
    setEmployeeError(null);
    setEmployees([]);
    void portal
      .listEmployees(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setEmployees(items);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setEmployeeError(knowledgeErrorText(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setEmployeeLoading(false);
      });
    return () => controller.abort();
  }, [portal, mode]);

  useEffect(() => {
    searchController.current?.abort();
    sourceController.current?.abort();
    searchGeneration.current += 1;
    sourceGeneration.current += 1;
    setSearching(false);
    setSearchingHint(false);
    setSourceLoading(false);
    setResults(null);
    setSearchError(null);
    setSourceHit(null);
    setSource(null);
    setSourceError(null);
    setSourcePage(1);
  }, [baseId, employee, mode, portal]);

  useEffect(
    () => () => {
      searchController.current?.abort();
      sourceController.current?.abort();
    },
    [],
  );

  const runSearch = async () => {
    if ((mode === 'agent' && !employee) || !query.trim() || searching) return;
    searchController.current?.abort();
    sourceController.current?.abort();
    sourceGeneration.current += 1;
    setSourceLoading(false);
    setSourceHit(null);
    setSource(null);
    setSourceError(null);
    const controller = new AbortController();
    searchController.current = controller;
    const generation = ++searchGeneration.current;
    setSearching(true);
    setSearchingHint(false);
    setSearchError(null);
    setResults(null);
    const slowTimer = window.setTimeout(() => {
      if (!controller.signal.aborted && generation === searchGeneration.current) setSearchingHint(true);
    }, 2000);
    setSourceHit(null);
    setSource(null);
    setSourceError(null);
    try {
      const input = { query: query.trim(), mode: 'hybrid' as const, limit: 10 };
      const response =
        mode === 'library'
          ? await portal.searchManagedKnowledge(baseId, input, controller.signal)
          : await portal.searchEmployeeKnowledge(
              employee!,
              { ...input, knowledge_base_ids: [baseId] },
              controller.signal,
            );
      if (!controller.signal.aborted && generation === searchGeneration.current) setResults(response.results);
    } catch (cause) {
      if (!controller.signal.aborted && generation === searchGeneration.current)
        setSearchError(knowledgeErrorText(cause));
    } finally {
      window.clearTimeout(slowTimer);
      if (!controller.signal.aborted && generation === searchGeneration.current) {
        setSearching(false);
        setSearchingHint(false);
      }
    }
  };

  const loadSource = async (hit: EmployeeKnowledgeSearchHit, page: number) => {
    if (mode === 'agent' && !employee) return;
    sourceController.current?.abort();
    const controller = new AbortController();
    sourceController.current = controller;
    const generation = ++sourceGeneration.current;
    setSourceLoading(true);
    setSourceError(null);
    setSourceHit(hit);
    setSource(null);
    setSourcePage(page);
    try {
      const response =
        mode === 'library'
          ? await portal.getManagedKnowledgeSource(baseId, hit.source.document_id, page, 20, controller.signal)
          : await portal.getEmployeeKnowledgeSource(employee!, hit.source.document_id, page, 20, controller.signal);
      if (!controller.signal.aborted && generation === sourceGeneration.current) setSource(response);
    } catch (cause) {
      if (!controller.signal.aborted && generation === sourceGeneration.current)
        setSourceError(knowledgeErrorText(cause));
    } finally {
      if (!controller.signal.aborted && generation === sourceGeneration.current) setSourceLoading(false);
    }
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
