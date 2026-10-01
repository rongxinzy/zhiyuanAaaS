import type { PlatformUser } from '@aep/sdk-node';
import { UserOutlined } from '@ant-design/icons';
import { Badge, Checkbox, Input, Typography, theme } from 'antd';
import { useMemo, useState } from 'react';
import { type AdminLanguage, translate } from './i18n.js';

const language: AdminLanguage = 'zh';

export function UserMultiPicker({
  users,
  selected,
  onToggle,
  disabled = false,
}: {
  readonly users: readonly PlatformUser[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (userId: string) => void;
  readonly disabled?: boolean;
}) {
  const { token } = theme.useToken();
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query
      ? users.filter(
          (user) => user.displayName.toLowerCase().includes(query) || user.username.toLowerCase().includes(query),
        )
      : users;
  }, [users, filter]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token.marginXXS }}>
      <Input
        aria-label={translate(language, 'searchUsers')}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder={translate(language, 'searchUsers')}
        disabled={disabled}
        allowClear
      />
      <fieldset
        aria-label={translate(language, 'selectUsers')}
        style={{
          maxHeight: 240,
          overflowY: 'auto',
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadius,
          padding: token.paddingXXS,
        }}
      >
        {filtered.length === 0 ? (
          <Typography.Text type="secondary" style={{ display: 'block', padding: token.paddingSM }}>
            {translate(language, 'noMatchingUsers')}
          </Typography.Text>
        ) : (
          filtered.map((user) => (
            <div key={user.id} style={{ padding: `${token.paddingXXS}px ${token.paddingXS}px` }}>
              <Checkbox checked={selected.has(user.id)} onChange={() => onToggle(user.id)} disabled={disabled}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: token.marginXXS }}>
                  <UserOutlined aria-hidden="true" />
                  <span>
                    <span style={{ display: 'block' }}>{user.displayName}</span>
                    <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      {user.username}
                    </Typography.Text>
                  </span>
                </span>
              </Checkbox>
            </div>
          ))
        )}
      </fieldset>
      <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {translate(language, 'selectedUsersLabel')}
        <Badge
          count={selected.size}
          showZero
          color={token.colorPrimary}
          style={{ marginInlineStart: token.marginXXS }}
        />
      </Typography.Text>
    </div>
  );
}
