import { Alert, Button, Input, Pagination, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useRef, useState } from 'react';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
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
        if (!controller.signal.aborted) setEmployeeError(cause instanceof Error ? cause.message : String(cause));
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
        setSearchError(cause instanceof Error ? cause.message : String(cause));
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
        setSourceError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!controller.signal.aborted && generation === sourceGeneration.current) setSourceLoading(false);
    }
  };

  const resultColumns: ColumnsType<EmployeeKnowledgeSearchHit> = [
    { title: tr('knowledgeSearchScore'), dataIndex: 'score', width: 90, render: (score: number) => score.toFixed(3) },
    { title: tr('knowledgeSearchContent'), dataIndex: 'content', ellipsis: true },
    {
      title: tr('knowledgeSearchSource'),
      render: (_, hit) => (
        <Button type="link" onClick={() => void loadSource(hit, 1)}>
          {hit.source.title || hit.source.document_id}
        </Button>
      ),
    },
  ];

  const sourceColumns: ColumnsType<EmployeeKnowledgeSource['chunks'][number]> = [
    { title: tr('knowledgeChunkCount'), dataIndex: 'seq_id', width: 90 },
    { title: tr('knowledgeChunkText'), dataIndex: 'content', ellipsis: true },
  ];

  return (
    <section aria-label={tr('knowledgeRetrieval')}>
      <Typography.Title level={5}>{tr('knowledgeRetrieval')}</Typography.Title>
      <Space orientation="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">{tr('knowledgeRetrievalHint')}</Typography.Text>
        {employeeError ? (
          <Alert showIcon type="error" title={tr('knowledgeSearchEmployeesFailed')} description={employeeError} />
        ) : (
          <Space.Compact style={{ width: '100%' }}>
            <Select
              aria-label={tr('knowledgeSearchEmployee')}
              showSearch={{ optionFilterProp: 'label' }}
              loading={employeeLoading}
              value={employee}
              onChange={setEmployee}
              options={employees.map((item) => ({ value: item.name, label: `${item.displayName} (${item.name})` }))}
              placeholder={tr('knowledgeSearchEmployee')}
              style={{ minWidth: 220 }}
            />
            <Input
              aria-label={tr('knowledgeSearchQuery')}
              value={query}
              maxLength={4000}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => void runSearch()}
              placeholder={tr('knowledgeSearchQuery')}
            />
            <Button
              type="primary"
              loading={searching}
              disabled={!employee || !query.trim()}
              onClick={() => void runSearch()}
            >
              {tr('knowledgeSearchButton')}
            </Button>
          </Space.Compact>
        )}
        {searchError && <Alert showIcon type="error" title={tr('knowledgeSearchFailed')} description={searchError} />}
        {results !== null && (
          <Table<EmployeeKnowledgeSearchHit>
            rowKey={(hit) => `${hit.source.document_id}:${hit.source.chunk_id}`}
            size="small"
            columns={resultColumns}
            dataSource={results}
            loading={searching}
            pagination={false}
            locale={{ emptyText: tr('knowledgeSearchEmpty') }}
            scroll={{ x: 560 }}
          />
        )}
        {sourceHit && (
          <section aria-label={tr('knowledgeSource')}>
            <Typography.Title level={5}>
              {tr('knowledgeSource')}: {sourceHit.source.title}
            </Typography.Title>
            {sourceError && (
              <Alert showIcon type="error" title={tr('knowledgeSourceFailed')} description={sourceError} />
            )}
            {source && (
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Typography.Text type="secondary">
                  {source.document.file_name || source.document.id} · {source.document.file_type || '—'}
                </Typography.Text>
                <Table<EmployeeKnowledgeSource['chunks'][number]>
                  rowKey="id"
                  size="small"
                  columns={sourceColumns}
                  dataSource={source.chunks}
                  loading={sourceLoading}
                  pagination={false}
                  locale={{ emptyText: tr('knowledgeSourceEmpty') }}
                  scroll={{ x: 560 }}
                />
                <Pagination
                  current={sourcePage}
                  pageSize={source.page_size}
                  total={source.total}
                  showSizeChanger={false}
                  onChange={(page) => void loadSource(sourceHit, page)}
                  showTotal={(total, range) => `${range[0]}-${range[1]} / ${total}`}
                />
              </Space>
            )}
            {sourceLoading && !source && <Typography.Text type="secondary">{tr('statusLoading')}</Typography.Text>}
          </section>
        )}
      </Space>
    </section>
  );
}
