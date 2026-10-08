// The workbench's request pages: the caller's own requests across all
// states, and one request's detail with 审批状态 and 部署状态 displayed
// separately (the wireframes insist on the split). The shared display
// helpers (state tag, deployment text, timeline) also feed the
// apply-submitted page.
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Result,
  Segmented,
  Skeleton,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { type ReactNode, useEffect, useState } from 'react';
import { formatTimestamp } from './format.js';
import { type AdminLanguage, translate } from './i18n.js';
import {
  isSessionExpired,
  type PortalClient,
  PortalError,
  type PortalRequest,
  type PortalRequestDeploy,
  type PortalRequestDetail,
} from './portal.js';
import { workbenchT } from './workbench-copy.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof workbenchT>[0]): string => workbenchT(key, language);

const RequestFilter = {
  All: 'all',
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
  Deployed: 'deployed',
} as const;
type RequestFilter = (typeof RequestFilter)[keyof typeof RequestFilter];

export function requestStateText(state: string): string {
  switch (state) {
    case 'pending':
      return t('reqStatePending');
    case 'approved':
      return t('reqStateApproved');
    case 'rejected':
      return t('reqStateRejected');
    case 'deployed':
      return t('reqStateDeployed');
    default:
      return state || t('reqStateUnknown');
  }
}

export function requestStateTag(state: string): ReactNode {
  switch (state) {
    case 'pending':
      return <Tag color="processing">{t('reqStatePending')}</Tag>;
    case 'approved':
      return <Tag color="success">{t('reqStateApproved')}</Tag>;
    case 'rejected':
      return <Tag color="error">{t('reqStateRejected')}</Tag>;
    case 'deployed':
      return <Tag>{t('reqStateDeployed')}</Tag>;
    default:
      return <Tag>{state || t('reqStateUnknown')}</Tag>;
  }
}

// The deployment leg, mapped from the employee phase; pending and rejected
// requests have no deployment yet, an approved record whose employee is
// gone reports the missing record instead of pretending.
export function deployText(request: {
  readonly state: string;
  readonly deploy?: PortalRequestDeploy | undefined;
}): string {
  if (request.state === 'rejected') return t('deployRejected');
  if (request.state === 'pending') return t('deployNotStarted');
  if (request.state === 'approved' || request.state === 'deployed') {
    const deploy = request.deploy;
    if (!deploy?.exists) return t('deployGone');
    switch (deploy.phase) {
      case 'Ready':
        return t('phaseReady');
      case 'Sleeping':
        return t('phaseSleeping');
      case 'Pending':
      case '':
        return t('phasePending');
      case 'Error':
        return t('phaseError');
      default:
        return deploy.phase;
    }
  }
  return t('deployUnknown');
}

// The approval/deployment timeline on the submitted and detail pages.
export function requestTimeline(
  request: PortalRequestDetail,
): { readonly color?: string; readonly children: ReactNode }[] {
  const items: { color?: string; children: ReactNode }[] = [
    {
      color: 'blue',
      children: (
        <>
          <Typography.Text strong>{t('timelineSubmitted')}</Typography.Text>
          <br />
          <Typography.Text type="secondary">
            {formatTimestamp(request.createdAt)}
            {request.owner ? ` · ${request.owner}` : ''}
          </Typography.Text>
        </>
      ),
    },
  ];
  if (request.state === 'pending') {
    items.push({
      color: 'gray',
      children: (
        <>
          <Typography.Text strong>{t('timelineAwaiting')}</Typography.Text>
          <br />
          <Typography.Text type="secondary">{t('timelineAwaitingDesc')}</Typography.Text>
        </>
      ),
    });
    items.push({
      color: 'gray',
      children: (
        <>
          <Typography.Text strong>{t('timelineDeploy')}</Typography.Text>
          <br />
          <Typography.Text type="secondary">{t('timelineDeployDesc')}</Typography.Text>
        </>
      ),
    });
    return items;
  }
  const decidedBy = request.decidedByName || request.decidedBy;
  if (request.state === 'rejected') {
    items.push({
      color: 'red',
      children: (
        <>
          <Typography.Text strong>{t('reqStateRejected')}</Typography.Text>
          <br />
          <Typography.Text type="secondary">
            {[
              formatTimestamp(request.decidedAt),
              decidedBy ? `${t('timelineDecidedBy')}：${decidedBy}` : '',
              request.reason,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography.Text>
        </>
      ),
    });
    return items;
  }
  if (request.state === 'deployed') {
    // Direct-created records have no approval leg: report the creation.
    items.push({
      color: 'green',
      children: (
        <>
          <Typography.Text strong>{t('reqStateDeployed')}</Typography.Text>
          <br />
          <Typography.Text type="secondary">{formatTimestamp(request.createdAt)}</Typography.Text>
        </>
      ),
    });
  } else {
    items.push({
      color: 'green',
      children: (
        <>
          <Typography.Text strong>{t('reqStateApproved')}</Typography.Text>
          {decidedBy || request.decidedAt ? (
            <>
              <br />
              <Typography.Text type="secondary">
                {[formatTimestamp(request.decidedAt), decidedBy ? `${t('timelineDecidedBy')}：${decidedBy}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </Typography.Text>
            </>
          ) : null}
        </>
      ),
    });
  }
  items.push({
    color: request.deploy.exists ? 'green' : 'gray',
    children: <Typography.Text strong>{deployText(request)}</Typography.Text>,
  });
  return items;
}

export function WorkbenchRequests({
  portal,
  navigate,
}: {
  readonly portal: PortalClient;
  readonly navigate: (route: string) => void;
}) {
  const [filter, setFilter] = useState<RequestFilter>(RequestFilter.All);
  const [rows, setRows] = useState<readonly PortalRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [revision, refresh] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    setExpired(false);
    void portal
      .myRequests(filter === RequestFilter.All ? undefined : filter)
      .then((items) => {
        if (live) setRows(items);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setRows(null);
        if (isSessionExpired(error)) setExpired(true);
        else setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [portal, filter, revision]);

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>{t('requestsTitle')}</Typography.Title>
          <Typography.Paragraph type="secondary">{t('requestsDesc')}</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('workbench/apply')}>
            {t('actionApply')}
          </Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refresh((n) => n + 1)}>
            {translate(language, 'refresh')}
          </Button>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('workbench')}>
            {t('backToWorkbench')}
          </Button>
        </Space>
      </div>
      {expired && <Alert type="error" showIcon title={t('sessionExpired')} style={{ marginBottom: 16 }} />}
      {failed && <Alert type="warning" showIcon title={t('requestsFailed')} style={{ marginBottom: 16 }} />}
      <Segmented
        value={filter}
        onChange={(value) => setFilter(value as RequestFilter)}
        options={[
          { value: RequestFilter.All, label: t('filterAll') },
          { value: RequestFilter.Pending, label: t('reqStatePending') },
          { value: RequestFilter.Approved, label: t('reqStateApproved') },
          { value: RequestFilter.Rejected, label: t('reqStateRejected') },
          { value: RequestFilter.Deployed, label: t('reqStateDeployed') },
        ]}
        style={{ marginBottom: 16 }}
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={[...(rows ?? [])]}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('requestsEmpty')} /> }}
        columns={[
          {
            title: t('colReqName'),
            render: (_, request) => request.displayName || request.employeeName,
          },
          {
            title: t('colReqTime'),
            render: (_, request) => formatTimestamp(request.createdAt),
          },
          {
            title: t('colReqApproval'),
            render: (_, request) => requestStateTag(request.state),
          },
          {
            title: t('colReqDeploy'),
            render: (_, request) => deployText(request),
          },
          {
            title: t('colReqAction'),
            render: (_, request) => (
              <Button
                type="link"
                style={{ paddingInline: 0 }}
                onClick={() => navigate(`workbench/requests/${request.id}`)}
              >
                {t('actionView')}
              </Button>
            ),
          },
        ]}
      />
    </section>
  );
}

export function WorkbenchRequestDetail({
  portal,
  requestId,
  navigate,
}: {
  readonly portal: PortalClient;
  readonly requestId: string;
  readonly navigate: (route: string) => void;
}) {
  const [detail, setDetail] = useState<PortalRequestDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, refresh] = useState(0);

  useEffect(() => {
    let live = true;
    setNotFound(false);
    setFailed(false);
    void portal
      .getRequest(requestId)
      .then((request) => {
        if (live) setDetail(request);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setDetail(null);
        if (error instanceof PortalError && error.status === 404) setNotFound(true);
        else setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [portal, requestId, revision]);

  if (notFound)
    return (
      <Result
        status="404"
        title={t('detailNotFound')}
        extra={<Button onClick={() => navigate('workbench/requests')}>{t('backToRequests')}</Button>}
      />
    );
  if (failed)
    return (
      <Result
        status="error"
        title={t('detailFailed')}
        extra={
          <Space>
            <Button onClick={() => refresh((n) => n + 1)}>{translate(language, 'refresh')}</Button>
            <Button onClick={() => navigate('workbench/requests')}>{t('backToRequests')}</Button>
          </Space>
        }
      />
    );
  if (!detail) return <Skeleton active />;

  const approvalText =
    detail.state === 'rejected' && detail.reason
      ? `${requestStateText(detail.state)} · ${t('detailRejectedReason')}：${detail.reason}`
      : requestStateText(detail.state);

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>
            {detail.displayName || detail.employeeName} · {t('detailTitle')}
          </Typography.Title>
          <Typography.Paragraph type="secondary">{detail.employeeName}</Typography.Paragraph>
        </div>
        <Space>
          {requestStateTag(detail.state)}
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('workbench/requests')}>
            {t('backToRequests')}
          </Button>
        </Space>
      </div>
      <Descriptions
        column={1}
        bordered
        size="middle"
        items={[
          { key: 'applicant', label: t('detailApplicant'), children: detail.owner || t('notProvided') },
          { key: 'team', label: t('detailTeam'), children: detail.teamName || detail.teamId || t('notProvided') },
          { key: 'purpose', label: t('detailPurpose'), children: detail.description || t('notProvided') },
          { key: 'model', label: t('detailModel'), children: detail.model || t('notProvided') },
          { key: 'note', label: t('detailNote'), children: detail.note || t('notProvided') },
          { key: 'approval', label: t('detailApproval'), children: approvalText },
          { key: 'deploy', label: t('detailDeploy'), children: deployText(detail) },
        ]}
        style={{ marginBottom: 24 }}
      />
      <Timeline items={requestTimeline(detail)} />
    </section>
  );
}
