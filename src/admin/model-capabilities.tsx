// 模型「能力标签」的渲染层：目录列、友好标签映射、表单多选与详情文案。
// 从 Models.tsx 抽出以保持源文件在行数基线内。

import type { AdminModel } from '@aep/sdk-node';
import { Form, Select, Space, Tag, Typography } from 'antd';

import type { AdminLanguage } from './i18n.js';
import { modelsT } from './models-copy.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof modelsT>[0]): string => modelsT(key, language);

const MODEL_CAPABILITY_OPTIONS = [
  { value: 'text', copyKey: 'capabilityText' },
  { value: 'vision', copyKey: 'capabilityVision' },
  { value: 'vision-ocr', copyKey: 'capabilityVisionOcr' },
  { value: 'embedding', copyKey: 'capabilityEmbedding' },
  { value: 'audio-transcription', copyKey: 'capabilityAudioTranscription' },
  { value: 'speech-synthesis', copyKey: 'capabilitySpeechSynthesis' },
  { value: 'image-generation', copyKey: 'capabilityImageGeneration' },
  { value: 'video-generation', copyKey: 'capabilityVideoGeneration' },
] as const;

function capabilityLabel(value: string): string {
  const option = MODEL_CAPABILITY_OPTIONS.find((entry) => entry.value === value);
  return option ? t(option.copyKey) : value;
}

function modelCapabilityOptions() {
  return MODEL_CAPABILITY_OPTIONS.map(({ value, copyKey }) => ({ value, label: t(copyKey) }));
}

export function modelCapabilitiesColumn() {
  return {
    title: t('labelCapabilities'),
    key: 'capabilities',
    width: 150,
    render: (_: unknown, model: AdminModel) =>
      model.capabilities && model.capabilities.length > 0 ? (
        <Space size={4} wrap>
          {model.capabilities.map((capability) => (
            <Tag key={capability}>{capabilityLabel(capability)}</Tag>
          ))}
        </Space>
      ) : (
        <Typography.Text type="secondary">{t('notProvided')}</Typography.Text>
      ),
  };
}

export function ModelCapabilitiesFormItem({
  pending,
  initialValue,
}: {
  readonly pending: boolean;
  readonly initialValue?: readonly string[];
}) {
  return (
    <Form.Item
      name="capabilities"
      label={t('labelCapabilities')}
      {...(initialValue ? { initialValue } : {})}
      extra={t('labelCapabilitiesHint')}
    >
      <Select disabled={pending} mode="multiple" options={modelCapabilityOptions()} />
    </Form.Item>
  );
}

export function modelCapabilitiesText(model: AdminModel): string {
  return model.capabilities && model.capabilities.length > 0
    ? model.capabilities.map(capabilityLabel).join('、')
    : t('notProvided');
}
