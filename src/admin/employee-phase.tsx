import { Tag } from 'antd';
import { employeesT } from './employees-copy.js';
import { ADMIN_LANGUAGE } from './i18n.js';

const t = (key: Parameters<typeof employeesT>[0]) => employeesT(key, ADMIN_LANGUAGE);

// "Ready" only claims the runtime instance is deployed — it says nothing
// about model auth or publish completeness. Unknown values render raw.
export function PhaseTag({ phase }: { readonly phase: string }) {
  if (phase === 'Ready') return <Tag color="success">{t('phaseReady')}</Tag>;
  if (phase === 'Pending') return <Tag color="processing">{t('phasePending')}</Tag>;
  // Idle-hibernated runtime: no pod is resident, first chat wakes it.
  if (phase === 'Sleeping') return <Tag color="default">💤 {t('phaseSleeping')}</Tag>;
  if (phase === 'Error') return <Tag color="error">{t('phaseError')}</Tag>;
  if (!phase) return <Tag>{t('phaseUnknown')}</Tag>;
  return <Tag>{phase}</Tag>;
}
