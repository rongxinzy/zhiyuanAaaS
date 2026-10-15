import type { PlatformUser } from '@aep/sdk-node';
import { Col, Form, Row, Select, Typography, theme } from 'antd';
import { useId, useState } from 'react';
import { gatewayT as t } from './gateway-ui.js';

type User = Pick<PlatformUser, 'id' | 'username' | 'displayName' | 'teamIds' | 'roleIds'>;
type Group = { readonly id: string; readonly name: string };

export function GatewayUserSelect({
  users,
  teams,
  roles,
  value,
  onChange,
  disabled = false,
  loading = false,
  id,
  'aria-label': ariaLabel,
}: {
  users: readonly User[];
  teams: readonly Group[];
  roles: readonly Group[];
  value?: string | undefined;
  onChange?: ((value: string | undefined) => void) | undefined;
  disabled?: boolean;
  loading?: boolean;
  id?: string | undefined;
  'aria-label'?: string | undefined;
}) {
  const { token } = theme.useToken();
  const filterId = useId();
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const matches = (user: User, teams: string[], roles: string[]) =>
    (teams.length === 0 || teams.some((team) => user.teamIds?.includes(team))) &&
    (roles.length === 0 || roles.some((role) => user.roleIds?.includes(role)));
  function filter(teams: string[], roles: string[]) {
    setTeamIds(teams);
    setRoleIds(roles);
    if (value && !users.some((user) => user.id === value && matches(user, teams, roles))) onChange?.(undefined);
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token.marginSM, minWidth: 0 }}>
      <Row gutter={[token.margin, token.marginSM]}>
        <Col xs={24} sm={12}>
          <Form.Item label={t('gatewayFilterTeams')} htmlFor={`${filterId}-teams`} style={{ marginBottom: 0 }}>
            <Select
              id={`${filterId}-teams`}
              mode="multiple"
              value={teamIds}
              onChange={(next) => filter(next, roleIds)}
              options={teams.map((team) => ({ value: team.id, label: team.name }))}
              placeholder={t('gatewayAllTeams')}
              allowClear
              showSearch
              optionFilterProp="label"
              disabled={disabled || loading || teams.length === 0}
              loading={loading}
              maxTagCount="responsive"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label={t('gatewayFilterRoles')} htmlFor={`${filterId}-roles`} style={{ marginBottom: 0 }}>
            <Select
              id={`${filterId}-roles`}
              mode="multiple"
              value={roleIds}
              onChange={(next) => filter(teamIds, next)}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
              placeholder={t('gatewayAllRoles')}
              allowClear
              showSearch
              optionFilterProp="label"
              disabled={disabled || loading || roles.length === 0}
              loading={loading}
              maxTagCount="responsive"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>
      <Select
        id={id ?? `${filterId}-user`}
        aria-label={ariaLabel ?? t('gatewayUser')}
        value={value || undefined}
        onChange={(next) => onChange?.(next)}
        options={users
          .filter((user) => matches(user, teamIds, roleIds))
          .map((user) => ({
            value: user.id,
            label:
              user.username && user.username !== user.displayName
                ? `${user.displayName} (${user.username})`
                : user.displayName,
          }))}
        placeholder={t('gatewaySearchUser')}
        notFoundContent={loading ? undefined : t('gatewayNoMatchingUsers')}
        allowClear
        showSearch
        optionFilterProp="label"
        disabled={disabled || loading}
        loading={loading}
        virtual={false}
        style={{ width: '100%' }}
      />
      <Typography.Text type="secondary">{t('gatewayUserFilterHint')}</Typography.Text>
    </div>
  );
}
