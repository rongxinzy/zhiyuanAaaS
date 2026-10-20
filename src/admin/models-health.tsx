import type { AdminModel } from '@aep/sdk-node';
import { Tag, Tooltip } from 'antd';
import type { modelsT } from './models-copy.js';
import { formatDateTime, t } from './models-shared.js';

/**
 * Probe-published health fields (control plane >= rev10). The pinned SDK
 * release predates them, so they are typed locally until the next bump.
 */
export type ModelHealthFields = {
  readonly healthStatus?: string;
  readonly healthCheckedAt?: string | null;
  readonly healthSince?: string | null;
  readonly healthDetail?: string | null;
};

const HEALTH_PRESENTATION: Record<string, { color: string; copy: Parameters<typeof modelsT>[0] }> = {
  healthy: { color: 'success', copy: 'healthHealthy' },
  unknown: { color: 'default', copy: 'healthUnknown' },
  credential_invalid: { color: 'error', copy: 'healthCredentialInvalid' },
  denied: { color: 'error', copy: 'healthDenied' },
  model_missing: { color: 'error', copy: 'healthModelMissing' },
  unreachable: { color: 'warning', copy: 'healthUnreachable' },
  error: { color: 'warning', copy: 'healthError' },
};

// HealthStateCell renders the active-probe verdict: endpoint reachability,
// credential validity, and upstream model availability.
export function HealthStateCell({ model }: { model: AdminModel & ModelHealthFields }) {
  const presentation = HEALTH_PRESENTATION[model.healthStatus ?? 'unknown'] ?? {
    color: 'default',
    copy: 'healthUnknown' as const,
  };
  const lines = [
    t('healthHint'),
    model.healthCheckedAt ? `${t('healthCheckedAt')}${formatDateTime(model.healthCheckedAt)}` : t('healthNever'),
    model.healthDetail ?? undefined,
  ].filter((line): line is string => Boolean(line));
  return (
    <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{lines.join('\n')}</span>}>
      <Tag color={presentation.color}>{t(presentation.copy)}</Tag>
    </Tooltip>
  );
}
