import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  QRCode,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { AdminConsoleClient } from './client.js';
import { ADMIN_LANGUAGE, type AdminLanguage, type AdminTranslationKey, translate } from './i18n.js';
import { type ChannelProvider, type ChannelQR, type EmployeeChannel, PortalClient, PortalError } from './portal.js';

const names: Record<ChannelProvider, AdminTranslationKey> = {
  feishu: 'channelFeishu',
  wecom: 'channelWecom',
  wechat: 'channelWechat',
};
const instructions: Record<ChannelProvider, AdminTranslationKey> = {
  feishu: 'channelFeishuSetup',
  wecom: 'channelWecomSetup',
  wechat: 'channelWechatSetup',
};
const qrLabels = {
  pending: 'channelQRPending',
  scanned: 'channelQRScanned',
  verification_required: 'channelQRVerify',
  confirmed: 'channelQRConfirmed',
  expired: 'channelQRExpired',
  failed: 'channelQRFailed',
} as const;
const CHANNEL_POLL_INTERVAL_MS = 5000;
const RUNTIME_RECOVERY_GRACE_MS = 60_000;

function errorText(error: unknown, language: AdminLanguage): string {
  return error instanceof PortalError && error.code ? error.message : translate(language, 'channelLoadFailed');
}

export function Channels({
  client,
  portal: supplied,
  language = ADMIN_LANGUAGE,
}: {
  readonly client: AdminConsoleClient;
  readonly portal?: PortalClient;
  readonly language?: AdminLanguage;
}) {
  const t = (key: AdminTranslationKey) => translate(language, key);
  const [portal] = useState(
    () => supplied ?? new PortalClient((rejectedToken) => client.getAccessToken(rejectedToken)),
  );
  const employeesQuery = useQuery({
    queryKey: ['portal', 'employees'],
    queryFn: ({ signal }) => portal.listEmployees(signal),
  });
  const employees = employeesQuery.data ?? [];
  const loading = employeesQuery.isFetching;
  const error = employeesQuery.error ? errorText(employeesQuery.error, language) : '';
  const [selected, setSelected] = useState<string>();
  useEffect(() => {
    const items = employeesQuery.data;
    if (!items) return;
    setSelected((current) =>
      items.some((item) => item.name === current)
        ? current
        : (items.find((item) => item.phase === 'Ready') ?? items[0])?.name,
    );
  }, [employeesQuery.data]);
  return (
    <section className="admin-table-section">
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>{t('channelTitle')}</Typography.Title>
          <Typography.Paragraph type="secondary">{t('channelDescription')}</Typography.Paragraph>
        </div>
      </div>
      <Space wrap>
        <Typography.Text>{t('channelEmployee')}</Typography.Text>
        <Select
          aria-label={t('channelEmployee')}
          value={selected}
          onChange={setSelected}
          loading={loading}
          disabled={loading}
          placeholder={t('channelEmployeePlaceholder')}
          showSearch={{ optionFilterProp: 'label' }}
          style={{ minWidth: 240 }}
          options={employees.map((employee) => ({
            value: employee.name,
            label: `${employee.displayName || employee.name} · ${employee.phase}`,
          }))}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void employeesQuery.refetch()} loading={loading}>
          {t('channelEmployeeRefresh')}
        </Button>
      </Space>
      {error ? (
        <Alert type="error" showIcon title={error} />
      ) : !loading && !employees.length ? (
        <Empty description={t('channelNoEmployees')} />
      ) : (
        selected && <EmployeeChannelsPanel key={selected} portal={portal} employeeName={selected} language={language} />
      )}
    </section>
  );
}

export function EmployeeChannelsDrawer({
  portal,
  employeeName,
  language,
  open,
  onClose,
}: {
  readonly portal: PortalClient;
  readonly employeeName: string;
  readonly language: AdminLanguage;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Drawer open={open} title={translate(language, 'channelManage')} onClose={onClose} width={960} destroyOnHidden>
      <EmployeeChannelsPanel portal={portal} employeeName={employeeName} language={language} />
    </Drawer>
  );
}

export function EmployeeChannelsPanel({
  portal,
  employeeName,
  language = ADMIN_LANGUAGE,
}: {
  readonly portal: PortalClient;
  readonly employeeName: string;
  readonly language?: AdminLanguage;
}) {
  const t = (key: AdminTranslationKey) => translate(language, key);
  const { modal } = App.useApp();
  const queryClient = useQueryClient();
  const channelsKey = ['portal', 'employee-channels', employeeName] as const;
  const channelsQuery = useQuery({
    queryKey: channelsKey,
    queryFn: ({ signal }) => portal.employeeChannels(employeeName, signal),
    refetchInterval: (query) => {
      const current = query.state.data;
      if (!current) return false;
      if (current.phase === 'Error' || current.phase === 'Sleeping') return false;
      if (current.phase === 'Ready' && current.runtimeAvailable) return false;
      return CHANNEL_POLL_INTERVAL_MS;
    },
  });
  const data = channelsQuery.data;
  const loading = channelsQuery.isFetching;
  const reload = () => void queryClient.invalidateQueries({ queryKey: channelsKey });
  const [busy, setBusy] = useState(false);
  const [busyProvider, setBusyProvider] = useState<ChannelProvider>();
  const [actionError, setActionError] = useState('');
  const error = actionError || (channelsQuery.error ? errorText(channelsQuery.error, language) : '');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<EmployeeChannel>();
  const [qr, setQR] = useState<ChannelQR>();
  const [qrOpen, setQROpen] = useState(false);
  const [qrBusy, setQRBusy] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [form] = Form.useForm<Record<string, string>>();
  const live = useRef(true);
  const qrID = useRef<string | undefined>(undefined);
  const qrRequest = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      qrRequest.current?.abort();
      if (qrID.current) void portal.channelQR(employeeName, 'qr-cancel', qrID.current).catch(() => undefined);
    };
  }, [portal, employeeName]);
  const readyRuntimeUnavailable = data?.phase === 'Ready' && data.runtimeAvailable === false;
  const runtimeUnavailableSince = useRef<number | undefined>(undefined);
  const [runtimeGraceElapsed, setRuntimeGraceElapsed] = useState(false);
  useEffect(() => {
    if (!readyRuntimeUnavailable) {
      runtimeUnavailableSince.current = undefined;
      setRuntimeGraceElapsed(false);
      return;
    }
    const since = runtimeUnavailableSince.current ?? Date.now();
    runtimeUnavailableSince.current = since;
    setRuntimeGraceElapsed(false);
    const timer = setTimeout(
      () => setRuntimeGraceElapsed(true),
      Math.max(0, since + RUNTIME_RECOVERY_GRACE_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [readyRuntimeUnavailable]);

  async function run(
    action: () => Promise<void>,
    success: AdminTranslationKey,
    provider?: ChannelProvider,
  ): Promise<boolean> {
    setBusy(true);
    setBusyProvider(provider);
    setActionError('');
    setNotice('');
    try {
      await action();
      if (live.current) {
        setNotice(t(success));
        reload();
      }
      return true;
    } catch (cause) {
      if (live.current) setActionError(errorText(cause, language));
      return false;
    } finally {
      if (live.current) {
        setBusy(false);
        setBusyProvider(undefined);
      }
    }
  }

  async function connect(item: EmployeeChannel, values: Record<string, string>): Promise<boolean> {
    setBusy(true);
    setBusyProvider(item.provider);
    setActionError('');
    setNotice('');
    try {
      await portal.configureChannel(employeeName, item.provider, values);
      const fresh = await portal.employeeChannels(employeeName);
      if (live.current) {
        queryClient.setQueryData(channelsKey, fresh);
        const state = fresh.providers.find((provider) => provider.provider === item.provider)?.workerState;
        setNotice(t(state === 'connected' ? 'channelSaved' : 'channelSavedNotConnected'));
      }
      return true;
    } catch (cause) {
      if (live.current) setActionError(errorText(cause, language));
      return false;
    } finally {
      if (live.current) {
        setBusy(false);
        setBusyProvider(undefined);
      }
    }
  }

  async function startQR() {
    setQRBusy(true);
    setActionError('');
    setQR(undefined);
    setVerifyCode('');
    setQROpen(true);
    const controller = new AbortController();
    qrRequest.current = controller;
    try {
      const result = await portal.channelQR(employeeName, 'qr-login', undefined, undefined, controller.signal);
      if (live.current && !controller.signal.aborted && result) {
        qrID.current = result.id;
        setQR(result);
      }
    } catch (cause) {
      if (live.current && !controller.signal.aborted) setActionError(errorText(cause, language));
    } finally {
      if (live.current) setQRBusy(false);
    }
  }

  async function pollQR(code?: string) {
    if (!qr || qrBusy) return;
    setQRBusy(true);
    setActionError('');
    const controller = new AbortController();
    qrRequest.current = controller;
    try {
      const result = await portal.channelQR(employeeName, 'qr-poll', qr.id, code, controller.signal);
      if (live.current && !controller.signal.aborted && result) {
        setQR(result);
        if (result.status === 'confirmed') {
          qrID.current = undefined;
          setNotice(t('channelQRConfirmed'));
          reload();
        }
      }
    } catch (cause) {
      if (live.current && !controller.signal.aborted) setActionError(errorText(cause, language));
    } finally {
      if (live.current) setQRBusy(false);
    }
  }

  async function closeQR() {
    qrRequest.current?.abort();
    setQROpen(false);
    setQR(undefined);
    setVerifyCode('');
    const id = qrID.current;
    qrID.current = undefined;
    if (id) {
      try {
        await portal.channelQR(employeeName, 'qr-cancel', id);
      } catch (cause) {
        if (live.current) setActionError(errorText(cause, language));
      }
    }
  }

  const unavailable = !data?.runtimeAvailable || data.phase !== 'Ready';
  const unavailableNotice: AdminTranslationKey | undefined = !data
    ? undefined
    : data.phase === 'Error'
      ? 'channelEmployeeFailed'
      : data.phase === 'Sleeping'
        ? 'channelUnavailable'
        : data.phase === 'Ready'
          ? readyRuntimeUnavailable && !runtimeGraceElapsed
            ? 'channelRuntimeRestarting'
            : 'channelUnavailable'
          : 'channelRolloutPending';
  return (
    <div className="admin-table-section">
      <Space wrap>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void channelsQuery.refetch()}>
          {t('channelRefresh')}
        </Button>
        {data?.checkedAt && (
          <Typography.Text type="secondary">{new Date(data.checkedAt).toLocaleString()}</Typography.Text>
        )}
      </Space>
      {error && <Alert type="error" showIcon title={error} />}
      {notice && <Alert type="success" showIcon title={notice} closable={{ afterClose: () => setNotice('') }} />}
      {data?.hibernationEnabled && <Alert type="warning" showIcon title={t('channelHibernationConflict')} />}
      {data && unavailable && unavailableNotice && (
        <Alert
          type={unavailableNotice === 'channelRuntimeRestarting' ? 'info' : 'warning'}
          showIcon
          title={t(unavailableNotice).replace('{phase}', data.phase)}
          action={
            data.phase === 'Sleeping' ? (
              <Button
                loading={busy}
                onClick={() => void run(() => portal.wakeChannelEmployee(employeeName), 'channelWakeDone')}
              >
                {t('channelWake')}
              </Button>
            ) : undefined
          }
        />
      )}
      <Table<EmployeeChannel>
        rowKey="provider"
        loading={loading}
        dataSource={data ? [...data.providers] : []}
        pagination={false}
        scroll={{ x: 780 }}
        locale={{ emptyText: error ? t('channelLoadFailed') : t('channelEmployeePlaceholder') }}
        columns={[
          {
            title: t('channelPlatform'),
            dataIndex: 'provider',
            render: (provider: ChannelProvider) => t(names[provider]),
          },
          {
            title: t('channelConfiguration'),
            render: (_, item) => (
              <Tag color={item.configured ? 'blue' : 'default'}>
                {!item.enabled
                  ? t('channelDisabled')
                  : unavailable
                    ? t('channelUnknown')
                    : !item.runtimeReady
                      ? t('channelPending')
                      : item.configured
                        ? t('channelConfigured')
                        : t('channelUnconfigured')}
              </Tag>
            ),
          },
          {
            title: t('channelWorker'),
            render: (_, item) => (
              <Tag
                color={
                  item.workerState === 'connected' ? 'success' : item.workerState === 'stopped' ? 'warning' : 'default'
                }
              >
                {t(
                  item.workerState === 'connected'
                    ? 'channelConnected'
                    : item.workerState === 'running'
                      ? 'channelRunning'
                      : item.workerState === 'stopped'
                        ? 'channelStopped'
                        : 'channelUnknown',
                )}
              </Tag>
            ),
          },
          {
            title: t('channelActions'),
            render: (_, item) => (
              <Space wrap>
                {!item.enabled ? (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={busy || loading || data?.hibernationEnabled === true || data?.phase === 'Error'}
                    onClick={() =>
                      void run(
                        () => portal.activateChannel(employeeName, item.provider, true),
                        'channelActivationSaved',
                      )
                    }
                  >
                    {t('channelEnable')}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="primary"
                      disabled={busy || loading || unavailable || !item.runtimeReady}
                      onClick={() => {
                        form.resetFields();
                        form.setFieldsValue(item.values);
                        setEditing(item);
                      }}
                    >
                      {t(item.configured ? 'channelUpdate' : 'channelConfigure')}
                    </Button>
                    {item.provider === 'wechat' && (
                      <Button
                        disabled={busy || qrBusy || unavailable || !item.runtimeReady}
                        onClick={() => void startQR()}
                      >
                        {t('channelQRStart')}
                      </Button>
                    )}
                    {item.configured && (
                      <Button
                        loading={busy && busyProvider === item.provider}
                        disabled={busy || unavailable}
                        onClick={() =>
                          void run(
                            () => portal.restartChannel(employeeName, item.provider),
                            'channelRestarted',
                            item.provider,
                          )
                        }
                      >
                        {t('channelRestart')}
                      </Button>
                    )}
                    <Button
                      danger
                      disabled={busy || loading || !data || !['Ready', 'Error'].includes(data.phase)}
                      onClick={() =>
                        modal.confirm({
                          title: t('channelDisableTitle'),
                          content: t('channelDisableDetail'),
                          okText: t('channelDisable'),
                          cancelText: t('channelCancel'),
                          okButtonProps: { danger: true },
                          onOk: async () => {
                            if (
                              !(await run(
                                () => portal.activateChannel(employeeName, item.provider, false),
                                'channelDisabledDone',
                              ))
                            )
                              throw new Error('Channel disable failed');
                          },
                        })
                      }
                    >
                      {t('channelDisable')}
                    </Button>
                    {busy && busyProvider === item.provider && (
                      <Typography.Text type="secondary">{t('channelConnecting')}</Typography.Text>
                    )}
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />
      {data && <Typography.Text type="secondary">{t('channelStatusScope')}</Typography.Text>}
      <Modal
        open={Boolean(editing)}
        title={editing ? `${t(names[editing.provider])} · ${t('channelConfigure')}` : ''}
        destroyOnHidden
        onCancel={() => {
          if (!busy) {
            form.resetFields();
            setEditing(undefined);
          }
        }}
        onOk={() => form.submit()}
        confirmLoading={busy}
        okText={t('channelSave')}
        cancelText={t('channelCancel')}
        cancelButtonProps={{ disabled: busy }}
        mask={{ closable: !busy }}
      >
        {editing && (
          <>
            {error && <Alert type="error" showIcon title={error} />}
            <Typography.Paragraph>{t(instructions[editing.provider])}</Typography.Paragraph>
            {editing.provider === 'feishu' && (
              <Typography.Paragraph>
                <Typography.Link href="https://open.feishu.cn/app" target="_blank" rel="noopener noreferrer">
                  {t('channelFeishuCreateApp')}
                </Typography.Link>
              </Typography.Paragraph>
            )}
            {editing.provider === 'wecom' && (
              <Typography.Paragraph>
                <Typography.Link
                  href="https://open.work.weixin.qq.com/help2/pc/21677"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('channelWecomCredentialHelp')}
                </Typography.Link>
              </Typography.Paragraph>
            )}
            <Form
              form={form}
              layout="vertical"
              clearOnDestroy
              preserve={false}
              onFinish={async (values: Record<string, string>) => {
                const sanitized = Object.fromEntries(
                  Object.entries(values)
                    .filter(([, value]) => Boolean(value?.trim()))
                    .map(([key, value]) => [key, value.trim()]),
                );
                if (await connect(editing, sanitized)) {
                  form.resetFields();
                  setEditing(undefined);
                }
              }}
            >
              {editing.provider !== 'wechat' && (
                <Form.Item
                  name={editing.provider === 'feishu' ? 'app_id' : 'bot_id'}
                  label={t(editing.provider === 'feishu' ? 'channelAppId' : 'channelBotId')}
                  rules={[{ required: true, whitespace: true, message: t('channelRequired') }]}
                >
                  <Input autoComplete="off" maxLength={4096} />
                </Form.Item>
              )}
              <Form.Item
                name={
                  editing.provider === 'feishu'
                    ? 'app_secret'
                    : editing.provider === 'wecom'
                      ? 'bot_secret'
                      : 'bot_token'
                }
                label={t(
                  editing.provider === 'feishu'
                    ? 'channelAppSecret'
                    : editing.provider === 'wecom'
                      ? 'channelBotSecret'
                      : 'channelBotToken',
                )}
                extra={editing.hasSecret ? t('channelSecretSaved') : undefined}
                rules={[{ required: !editing.hasSecret, whitespace: true, message: t('channelRequired') }]}
              >
                <Input.Password autoComplete="new-password" maxLength={4096} />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
      <Modal
        open={qrOpen}
        title={t('channelQRStart')}
        footer={<Button onClick={() => void closeQR()}>{t('channelClose')}</Button>}
        onCancel={() => void closeQR()}
        destroyOnHidden
      >
        {error && <Alert type="error" showIcon title={error} />}
        <Typography.Paragraph>{t('channelWechatSetup')}</Typography.Paragraph>
        {qr && (
          <Space orientation="vertical">
            <QRCode
              type="svg"
              value={qr.qrcode_content || ' '}
              status={
                qr.status === 'expired' || qr.status === 'failed'
                  ? 'expired'
                  : qr.status === 'scanned'
                    ? 'scanned'
                    : 'active'
              }
            />
            <Typography.Text>{t(qrLabels[qr.status])}</Typography.Text>
            {qr.status === 'verification_required' ? (
              <Space>
                <Input
                  aria-label={t('channelVerifyCode')}
                  value={verifyCode}
                  maxLength={16}
                  onChange={(event) => setVerifyCode(event.target.value.replace(/\D/g, ''))}
                />
                <Button loading={qrBusy} disabled={!verifyCode} onClick={() => void pollQR(verifyCode)}>
                  {t('channelVerifySubmit')}
                </Button>
              </Space>
            ) : (
              ['pending', 'scanned'].includes(qr.status) && (
                <Button loading={qrBusy} onClick={() => void pollQR()}>
                  {t('channelQRPoll')}
                </Button>
              )
            )}
          </Space>
        )}
        {!qr && (
          <Button loading={qrBusy} onClick={() => void startQR()}>
            {t('channelQRStart')}
          </Button>
        )}
      </Modal>
    </div>
  );
}
