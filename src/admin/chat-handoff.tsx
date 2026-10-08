// Chat handoff shared by the console's employee roster and the workbench:
// mint the portal session and select the employee in the background
// (cookies land on the shared host), then open the chat UI in a new tab —
// no portal entry page flashing in between. Falls back to the
// fragment-token handoff when the background mint fails.
//
// Popup blockers routinely reject window.open calls made after an await,
// and a click that dispatched the call is not evidence the conversation
// opened. When the automatic open does not succeed, the modal surfaces a
// state-specific handoff: with a minted session a plain token-free link the
// user can click, otherwise clear feedback plus retry. The access token is
// handed to the portal at most once and is never rendered or logged.
import { MessageOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, Space } from 'antd';
import { useCallback, useState } from 'react';
import type { AdminConsoleClient } from './client.js';
import { employeesT } from './employees-copy.js';
import { type AdminLanguage, translate } from './i18n.js';
import { chatUIBaseURL, type PortalClient, type PortalEmployee, portalChatBaseURL } from './portal.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof employeesT>[0]): string => employeesT(key, language);

export type ChatHandoff =
  | { readonly employee: PortalEmployee; readonly kind: 'blocked' }
  | { readonly employee: PortalEmployee; readonly kind: 'blocked-no-session' }
  | { readonly employee: PortalEmployee; readonly kind: 'no-session' };

export function useChatHandoff({
  client,
  portal,
}: {
  readonly client: AdminConsoleClient;
  readonly portal: PortalClient;
}) {
  const [handoff, setHandoff] = useState<ChatHandoff | null>(null);
  const openChat = useCallback(
    async (employee: PortalEmployee) => {
      setHandoff(null);
      if (await portal.mintChatSession(employee.name)) {
        const opened = window.open(`${chatUIBaseURL()}/workspace`, '_blank', 'noopener');
        if (opened) return;
        setHandoff({ employee, kind: 'blocked' });
        return;
      }
      const token = await client.getAccessToken();
      if (!token) {
        setHandoff({ employee, kind: 'no-session' });
        return;
      }
      const href = `${portalChatBaseURL()}/chat?employee=${encodeURIComponent(employee.name)}#token=${encodeURIComponent(token)}`;
      const opened = window.open(href, '_blank', 'noopener');
      if (opened) return;
      setHandoff({ employee, kind: 'blocked-no-session' });
    },
    [client, portal],
  );
  const retry = useCallback(() => {
    if (handoff) void openChat(handoff.employee);
  }, [handoff, openChat]);
  const close = useCallback(() => setHandoff(null), []);
  return { handoff, openChat, retry, close } as const;
}

export function ChatHandoffModal({
  handoff,
  onRetry,
  onClose,
}: {
  readonly handoff: ChatHandoff | null;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}) {
  return (
    <Modal open={handoff !== null} title={t('chatBlockedTitle')} footer={null} onCancel={onClose} destroyOnHidden>
      {handoff?.kind === 'blocked' ? (
        <>
          <Alert type="info" showIcon title={t('chatBlockedMinted')} style={{ marginBottom: 16 }} />
          <Button
            type="primary"
            icon={<MessageOutlined />}
            href={`${chatUIBaseURL()}/workspace`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('chatOpenLink')}
          </Button>
        </>
      ) : handoff ? (
        <>
          <Alert
            type={handoff.kind === 'no-session' ? 'error' : 'warning'}
            showIcon
            title={handoff.kind === 'no-session' ? t('chatNoSession') : t('chatBlockedFallback')}
            style={{ marginBottom: 16 }}
          />
          <Space>
            <Button type="primary" onClick={onRetry}>
              {t('chatRetry')}
            </Button>
            <Button onClick={onClose}>{translate(language, 'cancel')}</Button>
          </Space>
        </>
      ) : null}
    </Modal>
  );
}
