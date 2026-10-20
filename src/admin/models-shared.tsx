import { type AdminModel, AepProblem, type ModelAssignment } from '@aep/sdk-node';
import { AdminModelSubjectType } from './client.js';
import { type AdminLanguage, translate } from './i18n.js';
import { modelsT } from './models-copy.js';

export const ModelSourceType = { Gateway: 'gateway' } as const;

export const ModelProtocol = { OpenAiCompatible: 'openai-compatible', Anthropic: 'anthropic' } as const;

export const MODEL_PROTOCOL_OPTIONS = [
  { value: ModelProtocol.OpenAiCompatible, label: 'OpenAI-compatible' },
  { value: ModelProtocol.Anthropic, label: 'Anthropic' },
];

export const language: AdminLanguage = 'zh';

export const t = (key: Parameters<typeof modelsT>[0]): string => modelsT(key, language);

export type ModelGrantTarget = {
  readonly model: AdminModel;
  readonly assignments: readonly ModelAssignment[];
};

export function modelSaveMessage(error: unknown): string {
  if (error instanceof AepProblem && (error.code === 'MODEL_EXISTS' || error.status === 409))
    return translate(language, 'modelIdExists');
  return translate(language, 'operationUnavailable');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// A model is catalog-publishable when it is enabled and its gateway mapping
// is complete; the publish endpoint derives routes from exactly this set.
export function catalogPublishable(model: AdminModel): boolean {
  return Boolean(
    model.enabled &&
      model.sourceType === ModelSourceType.Gateway &&
      (model.protocol === ModelProtocol.OpenAiCompatible || model.protocol === ModelProtocol.Anthropic) &&
      model.endpoint?.trim() &&
      model.upstreamModel?.trim(),
  );
}

export function subjectTypeLabel(type: string): string {
  if (type === AdminModelSubjectType.User) return t('subjectTypeUser');
  if (type === AdminModelSubjectType.Role) return t('subjectTypeRole');
  if (type === AdminModelSubjectType.Team) return t('subjectTypeTeam');
  return type;
}
