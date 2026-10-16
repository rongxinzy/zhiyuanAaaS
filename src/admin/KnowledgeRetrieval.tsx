import { SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Input, Pagination, Segmented, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { knowledgeErrorText } from './knowledge-error.js';
import type { EmployeeKnowledgeSearchHit, EmployeeKnowledgeSource, PortalClient, PortalEmployee } from './portal.js';

const tr = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);

export function KnowledgeRetrieval({ portal, baseId }: { readonly portal: PortalClient; readonly baseId: string }) {
  const [employees, setEmployees] = useState<readonly PortalEmployee[]>([]);
  const [employee, setEmployee] = useState<string>();
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly EmployeeKnowledgeSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
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
  }, [portal]);

  useEffect(() => {
    searchController.current?.abort();
    sourceController.current?.abort();
    searchGeneration.current += 1;
    sourceGeneration.current += 1;
    setSearching(false);
    setSourceLoading(false);
    setResults(null);
    setSearchError(null);
    setSourceHit(null);
    setSource(null);
    setSourceError(null);
    setSourcePage(1);
  }, [baseId, employee]);

  useEffect(
    () => () => {
      searchController.current?.abort();
      sourceController.current?.abort();
    },
    [],
  );

  const runSearch = async () => {
    if (!employee || !query.trim() || searching) return;
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
    setSearchError(null);
    setResults(null);
    setSourceHit(null);
    setSource(null);
    setSourceError(null);
    try {
      const response = await portal.searchEmployeeKnowledge(
        employee,
        { query: query.trim(), knowledge_base_ids: [baseId], mode: 'hybrid', limit: 10 },
        controller.signal,
      );
      if (!controller.signal.aborted && generation === searchGeneration.current) setResults(response.results);
    } catch (cause) {
      if (!controller.signal.aborted && generation === searchGeneration.current)
        setSearchError(knowledgeErrorText(cause));
    } finally {
      if (!controller.signal.aborted && generation === searchGeneration.current) setSearching(false);
    }
  };

  const loadSource = async (hit: EmployeeKnowledgeSearchHit, page: number) => {
    if (!employee) return;
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
      const response = await portal.getEmployeeKnowledgeSource(
        employee,
        hit.source.document_id,
        page,
        20,
        controller.signal,
      );
      if (!controller.signal.aborted && generation === sourceGeneration.current) setSource(response);
    } catch (cause) {
      if (!controller.signal.aborted && generation === sourceGeneration.current)
        setSourceError(knowledgeErrorText(cause));
    } finally {
      if (!controller.signal.aborted && generation === sourceGeneration.current) setSourceLoading(false);
    }
  };

  const examples = ['差旅报销需要哪些材料？', '如何申请休假？', '入职要完成哪些事项？'];

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
      <Segmented
        value="agent"
        options={[
          {
            label: tr('knowledgeSearchLibrary'),
            value: 'library',
            disabled: true,
            title: tr('knowledgeSearchLibraryDisabled'),
          },
          { label: tr('knowledgeSearchAgent'), value: 'agent' },
        ]}
      />
      <Typography.Text type="secondary">{tr('knowledgeSearchLibraryDisabled')}</Typography.Text>
      {employeeError ? (
        <Alert showIcon type="error" title={tr('knowledgeSearchEmployeesFailed')} description={employeeError} />
      ) : (
        <Space orientation="vertical" style={{ width: '100%' }}>
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
              disabled={!employee || !query.trim()}
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
                className="rounded-md border border-neutral-200 p-3"
              >
                <Space>
                  <Tag>{`片段 ${index + 1}`}</Tag>
                  <Typography.Text type="secondary">{hit.score.toFixed(3)}</Typography.Text>
                </Space>
                <div>
                  <Button type="link" style={{ padding: 0 }} onClick={() => void loadSource(hit, 1)}>
                    {hit.source.title || hit.source.document_id}
                  </Button>
                </div>
                <Typography.Paragraph
                  ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
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
