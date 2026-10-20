import { Alert } from 'antd';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { knowledgeErrorText } from './knowledge-error.js';
import { isUncertain } from './knowledge-management-support.js';
import { PortalError } from './portal.js';

export type WriteNoticeKind = 'success' | 'error' | 'info';

export function useWriteNotice() {
  const [writeNotice, setWriteNoticeState] = useState<{ readonly kind: WriteNoticeKind; readonly text: string } | null>(
    null,
  );
  const writeNoticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clearWriteNotice = useCallback(() => {
    clearTimeout(writeNoticeTimer.current);
    writeNoticeTimer.current = undefined;
    setWriteNoticeState(null);
  }, []);
  const setWriteNotice = useCallback((text: string | null, kind: WriteNoticeKind = 'info') => {
    clearTimeout(writeNoticeTimer.current);
    writeNoticeTimer.current = undefined;
    if (text === null) {
      setWriteNoticeState(null);
      return;
    }
    setWriteNoticeState({ kind, text });
    if (kind !== 'error')
      writeNoticeTimer.current = setTimeout(() => setWriteNoticeState(null), kind === 'success' ? 3000 : 4000);
  }, []);
  useEffect(() => () => clearTimeout(writeNoticeTimer.current), []);
  const writeNoticeFromCause = (cause: unknown) =>
    `${knowledgeErrorText(cause)}${isUncertain(cause) ? ` ${translate(ADMIN_LANGUAGE, 'knowledgeUncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${translate(ADMIN_LANGUAGE, 'knowledgeOperation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${translate(ADMIN_LANGUAGE, 'knowledgeId')}: ${cause.resourceId}` : ''}`;
  const writeNoticeAlert: ReactElement | null = writeNotice ? (
    <Alert
      type={writeNotice.kind === 'error' ? 'error' : writeNotice.kind === 'success' ? 'success' : 'info'}
      showIcon
      title={writeNotice.text}
      closable={{ onClose: clearWriteNotice }}
    />
  ) : null;
  return { setWriteNotice, writeNoticeFromCause, writeNoticeAlert };
}
