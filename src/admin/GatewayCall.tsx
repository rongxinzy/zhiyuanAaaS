import type { AdminModel } from '@aep/sdk-node';
import { CopyOutlined, PlayCircleOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Row,
  Space,
  Switch,
  Typography,
  theme,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type GatewayCallResult, runGatewayCall } from './gateway-test.js';
import {
  GatewayField,
  GatewayHeading,
  GatewayLoadError,
  GatewayPage,
  type GatewayProps,
  gatewayT as t,
  useGatewayRemote,
} from './gateway-ui.js';
import { notify } from './notifications.js';

export function GatewayCall({ client, identity, onObserve }: GatewayProps & { onObserve: () => void }) {
  const { token } = theme.useToken();
  const catalog = useGatewayRemote(useCallback(() => client.models(identity), [client, identity]));
  const capabilities = useGatewayRemote(useCallback(() => client.getGatewayCapabilities(), [client]));
  const models = catalog.value?.models.filter((model) => model.enabled && model.sourceType === 'gateway') ?? [];
  const [selected, setSelected] = useState('');
  const model: AdminModel | undefined = models.find((item) => item.id === selected) ?? models[0];
  const [prompt, setPrompt] = useState(t('gatewayPrompt'));
  const [stream, setStream] = useState(true);
  const [tools, setTools] = useState(false);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<GatewayCallResult>();
  const [text, setText] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  async function run() {
    if (!model || running || !prompt.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setRunning(true);
    setFailed(false);
    setText('');
    setResult(undefined);
    try {
      const next = await runGatewayCall(client, model, prompt, {
        stream,
        tools,
        signal: controller.signal,
        onText: (value) => {
          if (active.current === controller) setText(value);
        },
      });
      if (active.current === controller) {
        setResult(next);
        setText(next.text);
      }
    } catch {
      if (active.current === controller) setFailed(true);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setRunning(false);
      }
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', t('gatewayCopied'));
    } catch {
      notify('error', t('gatewayCopyFailed'));
    }
  }
  return (
    <GatewayPage>
      <GatewayHeading title="gatewayCall" description="gatewayCallDescription">
        <Button
          icon={<ReloadOutlined aria-hidden />}
          loading={catalog.loading || capabilities.loading}
          onClick={() => {
            catalog.retry();
            capabilities.retry();
          }}
        >
          {t('gatewayRefresh')}
        </Button>
      </GatewayHeading>
      {catalog.error ? <GatewayLoadError retry={catalog.retry} /> : null}
      {capabilities.error ? <GatewayLoadError retry={capabilities.retry} /> : null}
      {!capabilities.loading && capabilities.value?.sources.testAccess === false ? (
        <Alert type="warning" showIcon title={t('gatewayTestUnavailable')} />
      ) : null}
      <Row gutter={[token.marginLG, token.marginLG]}>
        <Col xs={24} xl={10}>
          <Card title={t('gatewayCallInfo')} loading={catalog.loading}>
            {models.length ? (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <GatewayField
                  label={t('gatewayModel')}
                  value={model?.id}
                  onChange={(value) => {
                    setSelected(value);
                    setResult(undefined);
                    setText('');
                    setFailed(false);
                  }}
                  options={models.map((item) => ({ value: item.id, label: item.displayName }))}
                  disabled={running}
                />
                <Descriptions
                  column={1}
                  items={[
                    {
                      key: 'protocol',
                      label: t('gatewayProtocol'),
                      children: t(model?.protocol === 'anthropic' ? 'gatewayAnthropic' : 'gatewayOpenAI'),
                    },
                  ]}
                />
                <Form layout="vertical">
                  <Form.Item label={t('gatewayContent')} htmlFor="gateway-prompt">
                    <Input.TextArea
                      id="gateway-prompt"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      maxLength={4000}
                      autoSize={{ minRows: 4, maxRows: 10 }}
                      disabled={running}
                    />
                  </Form.Item>
                </Form>
                <Space wrap>
                  <Switch aria-label={t('gatewayStreaming')} checked={stream} onChange={setStream} disabled={running} />
                  <Typography.Text>{t('gatewayStreaming')}</Typography.Text>
                </Space>
                <Space wrap>
                  <Switch
                    aria-label={t('gatewayToolDefinition')}
                    checked={tools}
                    onChange={setTools}
                    disabled={running}
                  />
                  <Typography.Text>{t('gatewayToolDefinition')}</Typography.Text>
                </Space>
                <Typography.Text type="secondary">{t('gatewayTestScope')}</Typography.Text>
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined aria-hidden />}
                    loading={running}
                    disabled={!prompt.trim() || !capabilities.value?.sources.testAccess}
                    onClick={() => void run()}
                  >
                    {t('gatewayRun')}
                  </Button>
                  {running ? (
                    <Button icon={<StopOutlined aria-hidden />} onClick={() => active.current?.abort()}>
                      {t('gatewayStop')}
                    </Button>
                  ) : null}
                </Space>
              </Space>
            ) : (
              <Empty description={t('gatewayNoModels')} />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card
            title={t('gatewayResponse')}
            extra={
              <Button icon={<CopyOutlined aria-hidden />} disabled={!text} onClick={() => void copy()}>
                {t('gatewayCopyResponse')}
              </Button>
            }
          >
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              {failed ? (
                <Alert showIcon type="error" title={t('gatewayCallFailed')} description={t('gatewayCallFailedHint')} />
              ) : null}
              {result ? (
                <Alert
                  showIcon
                  type={result.status < 200 || result.status >= 300 ? 'error' : 'success'}
                  title={`HTTP ${result.status}`}
                  description={result.requestId ? `${t('gatewayRequestId')}: ${result.requestId}` : undefined}
                />
              ) : null}
              {text ? (
                <section
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the native response.
                  tabIndex={0}
                  aria-label={t('gatewayResponse')}
                  style={{
                    margin: 0,
                    padding: token.padding,
                    minHeight: token.controlHeight * 6,
                    maxHeight: token.controlHeight * 16,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    background: token.colorFillAlter,
                    borderRadius: token.borderRadius,
                    fontFamily: token.fontFamilyCode,
                  }}
                >
                  <pre style={{ margin: 0, font: 'inherit', whiteSpace: 'inherit' }}>{text}</pre>
                </section>
              ) : (
                <Empty description={t(running ? 'gatewayRunning' : 'gatewayNoResponse')} />
              )}
              <Button onClick={onObserve}>{t('gatewayViewObserve')}</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </GatewayPage>
  );
}
