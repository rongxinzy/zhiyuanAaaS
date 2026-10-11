// 管理端"开始使用"跳转：员工对话由独立前端 zhiyuanBotUI 承载（自带登录），
// 这里只做深链（#/emp/<name>），不再铸造 portal 会话。
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Button, Modal } from 'antd';
import { botUIBaseURL, type PortalEmployee } from './portal.js';

interface ChatHandoff {
  readonly employee: PortalEmployee;
  readonly kind: 'blocked';
}

export function useChatHandoff(_: {
  readonly client?: unknown;
  readonly portal?: unknown;
}): {
  readonly handoff: ChatHandoff | null;
  readonly openChat: (employee: PortalEmployee) => void;
  readonly retry: () => void;
  readonly close: () => void;
} {
  const [handoff, setHandoff] = useState<ChatHandoff | null>(null);
  const openChat = useCallback((employee: PortalEmployee) => {
    const href = `${botUIBaseURL()}/#/emp/${encodeURIComponent(employee.name)}`;
    const opened = window.open(href, '_blank', 'noopener');
    if (opened) return;
    setHandoff({ employee, kind: 'blocked' });
  }, []);
  const retry = useCallback(() => {
    if (handoff) openChat(handoff.employee);
  }, [handoff, openChat]);
  const close = useCallback(() => setHandoff(null), []);
  return { handoff, openChat, retry, close };
}

export function ChatHandoffModal({
  handoff,
  onRetry,
  onClose,
}: {
  readonly handoff: ChatHandoff | null;
  readonly onRetry: () => void;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}) {
  if (!handoff) return null;
  return (
    <Modal
      open
      okText="重试打开"
      cancelText="关闭"
      onOk={onRetry}
      onCancel={onClose}
      title="对话窗口被浏览器拦截"
    >
      <Alert
        type="warning"
        showIcon
        message={`新标签页打开员工对话被拦截；请允许弹窗后重试，或直接访问 ${botUIBaseURL()}`}
      />
    </Modal>
  );
}
