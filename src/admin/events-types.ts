import type { ReactNode } from 'react';
import type { AdminConsoleClient, AdminIdentity } from './client.js';
export type AuditTabItem = { readonly key: string; readonly label: ReactNode; readonly children: ReactNode };
export type EventsProps = {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly initialTab?: string | undefined;
  readonly knowledgeBaseId?: string | undefined;
};
