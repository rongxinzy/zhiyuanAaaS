// The workbench apply flow: the simplified applicant form (申请名称 / 使用
// 目的 / 所属团队 / 期望服务对象 / 补充说明) that parks a request for an
// administrator, plus the submitted page with the approval/deployment
// timeline. Server-side release-condition violations come back field-
// anchored and are re-attached to the matching form items.
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Radio, Result, Select, Skeleton, Space, Timeline, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { type AdminLanguage, translate } from './i18n.js';
import { AdminNotificationKind, notify } from './notifications.js';
import {
  EMPLOYEE_NAME_PATTERN,
  isSessionExpired,
  type PortalApplyViolation,
  type PortalApplyVisibility,
  type PortalClient,
  PortalError,
  type PortalMe,
  type PortalRequestDetail,
} from './portal.js';
import { requestTimeline } from './WorkbenchRequests.js';
import { workbenchT } from './workbench-copy.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof workbenchT>[0]): string => workbenchT(key, language);

type ApplyFormValues = {
  name: string;
  displayName: string;
  description: string;
  team: string;
  scope: 'self' | 'team' | 'all';
  note?: string;
};

// Friendly label for the violation fields a submitter can realistically
// trigger; unrecognized keys fall back to the message alone so internal
// field names (visibility.teams[0], …) never render in front of employees.
function violationLabel(field: string): string | null {
  if (field === 'models') return t('fieldModels');
  if (field.startsWith('visibility')) return t('labelScope');
  return null;
}

export function WorkbenchApply({
  portal,
  navigate,
}: {
  readonly portal: PortalClient;
  readonly navigate: (route: string) => void;
}) {
  const [form] = Form.useForm<ApplyFormValues>();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [meFailed, setMeFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState<string | null>(null);
  const [violations, setViolations] = useState<readonly PortalApplyViolation[]>([]);
  const scope = Form.useWatch('scope', form);

  useEffect(() => {
    let live = true;
    void portal
      .me()
      .then((value) => {
        if (live) setMe(value);
      })
      .catch(() => {
        if (live) setMeFailed(true);
      });
    return () => {
      live = false;
    };
  }, [portal]);

  useEffect(() => {
    // Preselect the first team once the profile arrives; a cleared choice
    // stays cleared.
    if (me && me.teams.length > 0 && !form.getFieldValue('team')) {
      form.setFieldValue('team', me.teams[0]?.id);
    }
  }, [me, form]);

  const teams = me?.teams ?? [];
  const adminOnly = me?.policyMode === 'admin-only';
  const quotaFull = Boolean(me && me.quota.limit > 0 && me.quota.used >= me.quota.limit);

  const submit = async (values: ApplyFormValues) => {
    if (!me) return;
    setSubmitting(true);
    setSubmitFailed(null);
    setViolations([]);
    try {
      const visibility: PortalApplyVisibility =
        values.scope === 'all'
          ? { mode: 'all' }
          : values.scope === 'team'
            ? { mode: 'restricted', teams: [values.team] }
            : { mode: 'restricted', users: [me.user.id] };
      const result = await portal.apply({
        name: values.name.trim(),
        displayName: values.displayName.trim(),
        description: values.description.trim(),
        team: values.team,
        visibility,
        ...(values.note?.trim() ? { note: values.note.trim() } : {}),
      });
      if (result.kind === 'created') {
        notify(AdminNotificationKind.Success, t('createdNotice'));
        navigate('workbench');
        return;
      }
      if (result.kind === 'pending') {
        if (result.requestId) navigate(`workbench/submitted/${result.requestId}`);
        else navigate('workbench/requests');
        return;
      }
      if (result.status === 401) {
        // The session expired while the form was open: show the localized
        // sign-in-again prompt instead of the portal's raw 401 body.
        setSubmitFailed(t('sessionExpired'));
        return;
      }
      if (result.violations?.length) {
        const fieldMap: Record<string, keyof ApplyFormValues> = {
          name: 'name',
          displayName: 'displayName',
          description: 'description',
          team: 'team',
          visibility: 'scope',
          note: 'note',
        };
        const anchored = result.violations.flatMap((violation) => {
          const field = fieldMap[violation.field];
          return field ? [{ name: field, errors: [violation.message] }] : [];
        });
        const rest = result.violations.filter((violation) => !fieldMap[violation.field]);
        form.setFields(anchored);
        setViolations(rest);
        if (anchored.length === 0) setSubmitFailed(result.message);
        return;
      }
      setSubmitFailed(result.message);
    } catch (error) {
      setSubmitFailed(isSessionExpired(error) ? t('sessionExpired') : t('applyFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>{t('applyTitle')}</Typography.Title>
          <Typography.Paragraph type="secondary">{t('applyDesc')}</Typography.Paragraph>
        </div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('workbench')}>
          {t('backToWorkbench')}
        </Button>
      </div>
      {meFailed && <Alert type="error" showIcon title={t('applyLoadFailed')} style={{ marginBottom: 16 }} />}
      {adminOnly && <Alert type="warning" showIcon title={t('applyPolicyAdminOnly')} style={{ marginBottom: 16 }} />}
      {quotaFull && <Alert type="warning" showIcon title={t('applyQuotaFull')} style={{ marginBottom: 16 }} />}
      {submitFailed && <Alert type="error" showIcon title={submitFailed} style={{ marginBottom: 16 }} />}
      {violations.length > 0 && (
        <Alert
          type="error"
          showIcon
          title={t('violationsTitle')}
          description={
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              {violations.map((violation, index) => {
                const label = violationLabel(violation.field);
                return <li key={index}>{label ? `${label}：${violation.message}` : violation.message}</li>;
              })}
            </ul>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      {!me ? (
        meFailed ? null : (
          <Skeleton active />
        )
      ) : (
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          disabled={submitting || adminOnly || quotaFull || teams.length === 0}
          initialValues={{ scope: 'self' }}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item
            label={t('labelSlug')}
            name="name"
            extra={t('slugExtra')}
            rules={[
              { required: true, whitespace: true, message: t('slugRequired') },
              { pattern: EMPLOYEE_NAME_PATTERN, message: translate(language, 'digitalEmployeesInvalidName') },
            ]}
          >
            <Input placeholder="sales-data-assistant" autoComplete="off" />
          </Form.Item>
          <Form.Item
            label={t('labelName')}
            name="displayName"
            rules={[{ required: true, whitespace: true, message: t('nameRequired') }]}
          >
            <Input placeholder="销售数据助理" autoComplete="off" />
          </Form.Item>
          <Form.Item
            label={t('labelPurpose')}
            name="description"
            rules={[{ required: true, whitespace: true, message: t('purposeRequired') }]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount placeholder={t('purposePlaceholder')} />
          </Form.Item>
          {teams.length === 0 ? (
            <Alert type="warning" showIcon title={t('teamMissing')} style={{ marginBottom: 24 }} />
          ) : (
            <Form.Item label={t('labelTeam')} name="team" rules={[{ required: true, message: t('teamRequired') }]}>
              <Select
                placeholder={t('teamPlaceholder')}
                options={teams.map((team) => ({ value: team.id, label: team.name || team.id }))}
              />
            </Form.Item>
          )}
          <Form.Item label={t('labelScope')} name="scope" rules={[{ required: true, message: t('scopeRequired') }]}>
            <Radio.Group>
              <Radio value="self">{t('scopeSelf')}</Radio>
              <Radio value="team" disabled={teams.length === 0}>
                {t('scopeTeam')}
              </Radio>
              {me.policyMode === 'approval' && <Radio value="all">{t('scopeAll')}</Radio>}
            </Radio.Group>
          </Form.Item>
          {scope === 'all' && <Alert type="info" showIcon title={t('scopeAllHint')} style={{ marginBottom: 24 }} />}
          <Form.Item label={t('labelNote')} name="note">
            <Input.TextArea rows={2} maxLength={500} showCount placeholder={t('notePlaceholder')} />
          </Form.Item>
          {me.defaultModel && (
            <Typography.Paragraph type="secondary">
              {t('defaultModelNote')}：{me.defaultModel}
            </Typography.Paragraph>
          )}
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {t('submitApply')}
            </Button>
            <Button onClick={() => navigate('workbench')}>{translate(language, 'cancel')}</Button>
          </Space>
        </Form>
      )}
    </section>
  );
}

export function WorkbenchSubmitted({
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
    if (!requestId) {
      // Truncated deep link (#workbench/submitted without an id): show the
      // not-found state instead of requesting /api/v1/requests/.
      setNotFound(true);
      return;
    }
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

  if (failed)
    return (
      <Result
        status="error"
        title={t('detailFailed')}
        extra={<Button onClick={() => refresh((n) => n + 1)}>{translate(language, 'refresh')}</Button>}
      />
    );
  if (notFound)
    return (
      <Result
        status="404"
        title={t('detailNotFound')}
        extra={<Button onClick={() => navigate('workbench')}>{t('backToWorkbench')}</Button>}
      />
    );
  if (!detail) return <Skeleton active />;
  return (
    <Result
      status="success"
      title={t('submittedTitle')}
      subTitle={t('submittedDesc')}
      extra={
        <Space>
          <Button type="primary" onClick={() => navigate(`workbench/requests/${detail.id}`)}>
            {t('viewRequest')}
          </Button>
          <Button onClick={() => navigate('workbench')}>{t('backToWorkbench')}</Button>
        </Space>
      }
    >
      <Timeline items={requestTimeline(detail)} />
    </Result>
  );
}
