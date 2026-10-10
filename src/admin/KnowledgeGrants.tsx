import { Alert, App, Button, Input, Modal, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import type { ManagedKnowledgeGrant, PortalClient } from './portal.js';
import { PortalError } from './portal.js';

const tr = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);

export function KnowledgeGrants({
  portal,
  baseId,
  disabled = false,
}: {
  readonly portal: PortalClient;
  readonly baseId: string;
  readonly disabled?: boolean;
}) {
  const { message } = App.useApp();
  const [modal, modalContext] = Modal.useModal();
  const [grants, setGrants] = useState<readonly ManagedKnowledgeGrant[]>([]);
  const [userId, setUserId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loadedBaseId, setLoadedBaseId] = useState<string | null>(null);
  const baseGeneration = useRef(0);
  const requestGeneration = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const base = baseId;
      const baseVersion = baseGeneration.current;
      const requestVersion = ++requestGeneration.current;
      setLoading(true);
      setError(null);
      try {
        const result = await portal.listManagedKnowledgeGrants(base, signal);
        if (
          !signal?.aborted &&
          baseVersion === baseGeneration.current &&
          requestVersion === requestGeneration.current
        ) {
          setGrants(result.grants);
          setBlocked(false);
          setLoadedBaseId(base);
        }
      } catch (cause) {
        if (signal?.aborted || baseVersion !== baseGeneration.current || requestVersion !== requestGeneration.current)
          return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoadedBaseId(null);
        if (!(cause instanceof PortalError) || cause.status === 401 || cause.status === 403 || cause.status >= 500)
          setBlocked(true);
      } finally {
        if (!signal?.aborted && baseVersion === baseGeneration.current && requestVersion === requestGeneration.current)
          setLoading(false);
      }
    },
    [baseId, portal],
  );

  useEffect(() => {
    const controller = new AbortController();
    baseGeneration.current += 1;
    requestGeneration.current += 1;
    setLoadedBaseId(null);
    setLoading(true);
    setSaving(false);
    setGrants([]);
    setUserId('');
    setTeamId('');
    setError(null);
    setBlocked(false);
    void load(controller.signal);
    return () => {
      controller.abort();
      baseGeneration.current += 1;
      requestGeneration.current += 1;
    };
  }, [load]);

  const addGrant = (type: 'user' | 'team') => {
    if (disabled || blocked || saving || loading || error || loadedBaseId !== baseId) return;
    const id = (type === 'user' ? userId : teamId).trim();
    if (!id || grants.some((grant) => grant.type === type && grant.id === id)) return;
    setGrants((current) => [...current, { type, id }]);
    if (type === 'user') setUserId('');
    else setTeamId('');
  };

  const save = async (next = grants) => {
    if (disabled || blocked || loading || saving || error || loadedBaseId !== baseId) return;
    const base = baseId;
    const baseVersion = baseGeneration.current;
    const requestVersion = ++requestGeneration.current;
    setSaving(true);
    try {
      const result = await portal.replaceManagedKnowledgeGrants(
        base,
        next.map(({ type, id }) => ({ type, id })),
      );
      if (baseVersion === baseGeneration.current && requestVersion === requestGeneration.current) {
        setGrants(result.grants);
        setError(null);
        message.success(tr('knowledgeGrantsSaved'));
      }
    } catch (cause) {
      if (baseVersion === baseGeneration.current && requestVersion === requestGeneration.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
        if (!(cause instanceof PortalError) || cause.status === 401 || cause.status === 403 || cause.status >= 500)
          setBlocked(true);
        message.error(tr('knowledgeGrantsSaveFailed'));
      }
    } finally {
      if (baseVersion === baseGeneration.current && requestVersion === requestGeneration.current) setSaving(false);
    }
  };

  const columns: ColumnsType<ManagedKnowledgeGrant> = [
    {
      title: tr('knowledgeGrantType'),
      dataIndex: 'type',
      render: (type: ManagedKnowledgeGrant['type']) =>
        type === 'user' ? tr('knowledgeGrantUser') : tr('knowledgeGrantTeam'),
    },
    { title: tr('knowledgeGrantId'), dataIndex: 'id' },
    { title: tr('knowledgeGrantBy'), dataIndex: 'granted_by', render: (value?: string) => value || '—' },
    {
      title: tr('knowledgeActions'),
      render: (_, grant) => (
        <Button
          size="small"
          danger
          disabled={disabled || blocked || loading || saving || !!error || loadedBaseId !== baseId}
          onClick={() => setGrants((current) => current.filter((item) => item !== grant))}
        >
          {tr('knowledgeGrantRemove')}
        </Button>
      ),
    },
  ];

  return (
    <section aria-label={tr('knowledgeGrants')}>
      <Typography.Title level={5}>{tr('knowledgeGrants')}</Typography.Title>
      {error ? (
        <Alert
          showIcon
          type="error"
          title={tr('knowledgeGrantsReadFailed')}
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              {tr('knowledgeRetryRead')}
            </Button>
          }
        />
      ) : (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">{tr('knowledgeGrantsHint')}</Typography.Text>
          <Alert showIcon type="warning" title={tr('knowledgeGrantsReplaceHint')} />
          <Space wrap>
            <Input
              aria-label={tr('knowledgeGrantUser')}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              onPressEnter={() => addGrant('user')}
              placeholder={tr('knowledgeGrantUserId')}
              maxLength={256}
            />
            <Button
              disabled={
                disabled || blocked || loading || saving || !!error || loadedBaseId !== baseId || !userId.trim()
              }
              onClick={() => addGrant('user')}
            >
              {tr('knowledgeGrantAddUser')}
            </Button>
            <Input
              aria-label={tr('knowledgeGrantTeam')}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              onPressEnter={() => addGrant('team')}
              placeholder={tr('knowledgeGrantTeamId')}
              maxLength={256}
            />
            <Button
              disabled={
                disabled || blocked || loading || saving || !!error || loadedBaseId !== baseId || !teamId.trim()
              }
              onClick={() => addGrant('team')}
            >
              {tr('knowledgeGrantAddTeam')}
            </Button>
          </Space>
          <Table<ManagedKnowledgeGrant>
            rowKey={(grant) => `${grant.type}:${grant.id}`}
            size="small"
            loading={loading}
            columns={columns}
            dataSource={grants}
            pagination={false}
            locale={{ emptyText: tr('knowledgeGrantsEmpty') }}
            scroll={{ x: 480 }}
          />
          <Space>
            <Button
              type="primary"
              loading={saving}
              disabled={disabled || blocked || loading || saving || !!error || loadedBaseId !== baseId}
              onClick={() => void save()}
            >
              {tr('knowledgeGrantsSave')}
            </Button>
            <Button
              danger
              disabled={
                disabled || blocked || loading || saving || !!error || loadedBaseId !== baseId || !grants.length
              }
              onClick={() =>
                modal.confirm({
                  title: tr('knowledgeGrantsRevokeConfirm'),
                  okText: tr('knowledgeGrantsRevokeAll'),
                  cancelText: tr('knowledgeCancel'),
                  okButtonProps: { danger: true },
                  onOk: () => save([]),
                })
              }
            >
              {tr('knowledgeGrantsRevokeAll')}
            </Button>
          </Space>
        </Space>
      )}
      {modalContext}
    </section>
  );
}
