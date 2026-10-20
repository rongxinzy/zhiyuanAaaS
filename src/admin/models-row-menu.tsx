import type { AdminModel } from '@aep/sdk-node';
import { MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';
import { useState } from 'react';
import type { AdminConsoleClient } from './client.js';
import { translate } from './i18n.js';
import { language } from './models-shared.js';

export function ModelRowMenu({
  client,
  model,
  assignmentCount: _assignmentCount,
  onChanged,
  onError,
  onDelete,
}: {
  readonly client: AdminConsoleClient;
  readonly model: AdminModel;
  readonly assignmentCount: number;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onDelete: () => void;
}) {
  const [pending, setPending] = useState(false);
  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    try {
      await operation();
      await onChanged();
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          ...(model.isDefault
            ? []
            : [
                {
                  key: 'default',
                  label: translate(language, 'makeDefault'),
                  onClick: () =>
                    void run(async () => {
                      await client.updateModel(model.id, { isDefault: true });
                    }),
                },
              ]),
          {
            key: 'toggle',
            label: translate(language, model.enabled ? 'disable' : 'enable'),
            onClick: () =>
              void run(async () => {
                await client.updateModel(model.id, { enabled: !model.enabled });
              }),
          },
          { type: 'divider' as const },
          { key: 'delete', label: translate(language, 'delete'), danger: true, onClick: onDelete },
        ],
      }}
    >
      <Button
        type="text"
        size="small"
        icon={<MoreOutlined />}
        aria-label={translate(language, 'actions')}
        disabled={pending}
        onClick={(event) => event.stopPropagation()}
      />
    </Dropdown>
  );
}
