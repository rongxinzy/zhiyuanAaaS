import { ReloadOutlined, RocketOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Popconfirm,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  type AdminConsoleClient,
  type AdminIdentity,
  AdminPermission,
  AdminRequestError,
  hasAdminPermission,
} from './client.js';
import { formatTimestamp } from './format.js';
import { type AdminTranslationKey, translate } from './i18n.js';
import { type DataPlanePublication, type PublicationCondition, publicationId } from './publication-contract.js';

const t = (key: AdminTranslationKey) => translate('zh', key);
type Attempt = { key: string; operationId?: string; expiresAt: number };
const memory = new Map<string, Attempt>();
function readAttempt(scope: string): Attempt | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(scope) ?? 'null');
    if (
      raw &&
      typeof raw === 'object' &&
      'key' in raw &&
      typeof raw.key === 'string' &&
      /^[A-Za-z0-9._:-]{1,128}$/.test(raw.key) &&
      'expiresAt' in raw &&
      typeof raw.expiresAt === 'number' &&
      Number.isFinite(raw.expiresAt) &&
      (!('operationId' in raw) || publicationId(raw.operationId))
    )
      return raw as Attempt;
    return null;
  } catch {
    return memory.get(scope) ?? null;
  }
}
function saveAttempt(scope: string, value: Attempt) {
  memory.set(scope, value);
  try {
    sessionStorage.setItem(scope, JSON.stringify(value));
  } catch {
    /* Best effort; no tokens are stored here. */
  }
}
const phaseKeys: Record<DataPlanePublication['phase'], AdminTranslationKey> = {
  queued: 'publicationQueued',
  projecting: 'publicationProjecting',
  projected: 'publicationProjected',
  failed: 'publicationFailed',
  superseded: 'publicationSuperseded',
};
const conditionKeys = {
  Accepted: 'publicationAccepted',
  Applied: 'publicationApplied',
  Ready: 'publicationReady',
} as const;
const statusKeys = { True: 'publicationTrue', False: 'publicationFalse', Unknown: 'publicationUnknown' } as const;
const reasonKeys: Record<string, AdminTranslationKey> = {
  NotObserved: 'publicationNoEvidence',
  RevisionNotObserved: 'publicationNoEvidence',
  OperatorConfirmed: 'publicationOperatorConfirmed',
  OperatorRejected: 'publicationOperatorRejected',
  ObservationUnavailable: 'publicationObservationUnavailable',
  PublicationSuperseded: 'publicationReplaced',
  DataPlaneNotObserved: 'publicationDataPlaneNotObserved',
};
function reason(c: PublicationCondition): string {
  const key = reasonKeys[c.reason];
  return key ? t(key) : `${t('publicationOtherReason')}: ${c.reason}`;
}
function errorMessage(error: unknown, writing: boolean): string {
  if (error instanceof AdminRequestError) {
    if (error.code === 'DATA_PLANE_PUBLICATIONS_DISABLED' || error.status === 501 || (writing && error.status === 404))
      return t('publicationUnavailable');
    if (error.status === 403) return t('publicationForbidden');
    if (error.status === 404) return t('publicationNotFound');
  }
  return t(writing ? 'publicationRequestUncertain' : 'publicationReadFailed');
}

type PublicationProps = {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly allowPublish?: boolean;
  readonly excluded?: readonly string[];
  readonly disabled?: boolean;
  readonly compact?: boolean;
};

/** A new account/server scope remounts all state before any observation starts. */
export function GatewayPublication(props: PublicationProps) {
  const { client, identity } = props;
  const scope = `zhiyuan.admin.publication:${JSON.stringify([client.publicationScope, identity?.deploymentId ?? identity?.deployment?.id, identity?.user?.id])}`;
  return <PublicationView key={scope} {...props} scope={scope} />;
}

/** A scoped pointer restores GET observation; it never automatically repeats POST. */
function PublicationView({
  client,
  identity,
  allowPublish = false,
  excluded = [],
  disabled = false,
  compact = false,
  scope,
}: PublicationProps & { readonly scope: string }) {
  const allowed = hasAdminPermission(identity, AdminPermission.DataPlaneWrite);
  const { token } = theme.useToken();
  const [attempt, setAttempt] = useState<Attempt | null>(() => readAttempt(scope));
  const [operation, setOperation] = useState<DataPlanePublication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const writing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!allowed || !attempt?.operationId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checks = 0;
    const id = attempt.operationId;
    setPaused(false);
    const load = async () => {
      setChecking(true);
      try {
        const next = await client.getDataPlanePublication(id);
        if (!live) return;
        setOperation(next);
        setError(null);
        // Projected only confirms CR delivery. Wait for revision-specific Applied;
        // never poll indefinitely for Ready when no independent observer exists.
        if (
          next.phase === 'failed' ||
          next.phase === 'superseded' ||
          next.conditions.some((c) => c.type === 'Applied' && c.status === 'True')
        )
          return;
        if (++checks < 30) timer = setTimeout(() => void load(), 2000);
        else setPaused(true);
      } catch (e) {
        if (live) {
          setError(errorMessage(e, false));
          setPaused(true);
        }
      } finally {
        if (live) setChecking(false);
      }
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, allowed, scope, attempt?.operationId, refresh]);

  const submit = async (retry: boolean) => {
    if (!allowed || !allowPublish || writing.current) return;
    if (retry && (!attempt || Date.now() >= attempt.expiresAt)) {
      setError(t('publicationExpired'));
      return;
    }
    writing.current = true;
    const ownScope = scope;
    const next: Attempt =
      retry && attempt ? attempt : { key: crypto.randomUUID(), expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    saveAttempt(ownScope, next);
    setAttempt(next);
    setOperation(null);
    setError(null);
    setPending(true);
    try {
      const result = await client.createDataPlanePublication(next.key);
      const saved = { ...next, operationId: result.operationId, expiresAt: Date.parse(result.idempotencyExpiresAt) };
      saveAttempt(ownScope, saved);
      if (!mounted.current) return;
      setAttempt(saved);
      setOperation(result);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e, true));
    } finally {
      writing.current = false;
      if (mounted.current) setPending(false);
    }
  };
  if (!allowed) return null;
  const unresolved = !!attempt && !attempt.operationId;
  const expired = !!attempt && Date.now() >= attempt.expiresAt;
  return (
    <Card
      title={t('publicationTitle')}
      className="gateway-publication"
      extra={
        <Space wrap>
          {attempt?.operationId ? (
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              loading={checking}
              onClick={() => setRefresh((n) => n + 1)}
            >
              {t('publicationCheck')}
            </Button>
          ) : null}
          {allowPublish && unresolved && !expired ? (
            <Button loading={pending} disabled={disabled} onClick={() => void submit(true)}>
              {t('publicationRetry')}
            </Button>
          ) : null}
          {allowPublish && (!unresolved || expired) ? (
            <Popconfirm
              title={t('publicationConfirm')}
              description={
                <Space orientation="vertical">
                  <Typography.Text>{t('publicationConfirmNote')}</Typography.Text>
                  {excluded.length ? (
                    <Typography.Text type="secondary">
                      {t('publicationExcluded')}: {excluded.join('、')}
                    </Typography.Text>
                  ) : null}
                </Space>
              }
              okText={t('publicationAction')}
              cancelText={translate('zh', 'cancel')}
              onConfirm={() => void submit(false)}
            >
              <Button icon={<RocketOutlined aria-hidden="true" />} loading={pending} disabled={disabled || checking}>
                {t('publicationAction')}
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      }
    >
      <Flex vertical gap={token.margin}>
        {error ? <Alert type="error" showIcon title={error} /> : null}
        {unresolved && !error ? (
          <Alert type="info" showIcon title={t(expired ? 'publicationExpired' : 'publicationPending')} />
        ) : null}
        {!attempt ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('publicationEmpty')} /> : null}
        {attempt?.operationId && !operation && !error ? <Skeleton active paragraph={{ rows: 3 }} /> : null}
        {operation ? (
          <>
            <div role="status">
              <Tag
                color={
                  operation.phase === 'failed' ? 'error' : operation.phase === 'superseded' ? 'warning' : 'processing'
                }
              >
                {t(phaseKeys[operation.phase])}
              </Tag>
              {operation.errorCode ? <Typography.Text code>{operation.errorCode}</Typography.Text> : null}
            </div>
            <Descriptions
              column={1}
              size="small"
              items={[
                {
                  key: 'revision',
                  label: t('publicationRevision'),
                  children: <Typography.Text code>{operation.revision}</Typography.Text>,
                },
                {
                  key: 'operation',
                  label: t('publicationOperation'),
                  children: <Typography.Text code>{operation.operationId}</Typography.Text>,
                },
                { key: 'updated', label: t('publicationUpdated'), children: formatTimestamp(operation.updatedAt) },
              ]}
            />
            {compact ? (
              <Space wrap>
                {operation.conditions.map((c) => (
                  <Tag
                    key={c.type}
                    color={c.status === 'True' ? 'success' : c.status === 'False' ? 'error' : 'default'}
                  >
                    {t(conditionKeys[c.type])}: {t(statusKeys[c.status])}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Table
                rowKey="type"
                size="small"
                pagination={false}
                dataSource={[...operation.conditions]}
                scroll={{ x: 760 }}
                columns={[
                  {
                    title: t('publicationCondition'),
                    dataIndex: 'type',
                    render: (type: PublicationCondition['type']) => t(conditionKeys[type]),
                  },
                  {
                    title: translate('zh', 'status'),
                    key: 'status',
                    render: (_, c: PublicationCondition) => (
                      <Tag color={c.status === 'True' ? 'success' : c.status === 'False' ? 'error' : 'default'}>
                        {t(statusKeys[c.status])}
                      </Tag>
                    ),
                  },
                  {
                    title: t('publicationObservation'),
                    dataIndex: 'observedRevision',
                    render: (v: string | null) =>
                      v ? <Typography.Text code>{v}</Typography.Text> : t('publicationUnknown'),
                  },
                  { title: t('publicationReason'), key: 'reason', render: (_, c: PublicationCondition) => reason(c) },
                  {
                    title: t('publicationConditionUpdated'),
                    dataIndex: 'lastTransitionTime',
                    render: (v: string) => formatTimestamp(v),
                  },
                ]}
              />
            )}
            <Typography.Text type="secondary">{t('publicationBoundary')}</Typography.Text>
          </>
        ) : null}
        {paused ? <Typography.Text type="secondary">{t('publicationPollingStopped')}</Typography.Text> : null}
        {compact ? (
          <Typography.Link href="#model-gateway/configuration">{t('publicationDetails')}</Typography.Link>
        ) : null}
      </Flex>
    </Card>
  );
}
