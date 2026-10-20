// 员工详情抽屉的三个只读标签页视图：能力（知识库/技能）、可见范围与空态，
// 从 DigitalEmployees.tsx 抽出以保持源文件在行数基线内。

import { Empty, Space, Tag, Typography } from 'antd';

import { employeesT } from './employees-copy.js';
import type { AdminLanguage } from './i18n.js';
import type { PortalEmployee } from './portal.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof employeesT>[0]): string => employeesT(key, language);

export function EmptyDetails({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={title}>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 480, margin: '0 auto' }}>
        {description}
      </Typography.Paragraph>
    </Empty>
  );
}

// Knowledge bases and skills registered at creation. null/undefined means
// the legacy policy (nothing was configured when the employee was made);
// an empty list is an explicit deny-all knowledge policy.
export function CapabilitiesView({ employee }: { readonly employee: PortalEmployee }) {
  const bases = employee.knowledgeBases ?? null;
  const skills = employee.skills ?? null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Typography.Text strong>{t('capabilitiesKnowledgeTitle')}</Typography.Text>
        <div style={{ marginTop: 8 }}>
          {bases === null ? (
            <Typography.Text type="secondary">{t('capabilitiesKnowledgeLegacy')}</Typography.Text>
          ) : bases.length === 0 ? (
            <Typography.Text type="secondary">{t('capabilitiesKnowledgeNone')}</Typography.Text>
          ) : (
            <Space wrap size={6}>
              {bases.map((kb) => (
                <Tag key={kb.id}>{kb.name || kb.id}</Tag>
              ))}
            </Space>
          )}
        </div>
      </div>
      <div>
        <Typography.Text strong>{t('capabilitiesSkillsTitle')}</Typography.Text>
        <div style={{ marginTop: 8 }}>
          {skills === null || skills.length === 0 ? (
            <Typography.Text type="secondary">{t('capabilitiesSkillsNone')}</Typography.Text>
          ) : (
            <Space wrap size={6}>
              {skills.map((skill) => (
                <Tag key={skill.id}>
                  {skill.name || skill.id} · {skill.version}
                </Tag>
              ))}
            </Space>
          )}
        </div>
      </div>
    </div>
  );
}

// The explicit open scope from creation; null keeps the legacy
// owner/team rule text instead of pretending an audience was configured.
export function VisibilityView({ employee }: { readonly employee: PortalEmployee }) {
  const visibility = employee.visibility ?? null;
  if (visibility === null) {
    return <Typography.Text type="secondary">{t('scopeLegacy')}</Typography.Text>;
  }
  if (visibility.mode === 'all') {
    return <Tag color="warning">{t('scopeModeAllTag')}</Tag>;
  }
  const teams = visibility.teams ?? [];
  const users = visibility.users ?? [];
  if (teams.length + users.length === 0) {
    return (
      <span>
        <Tag>{t('scopeModeRestrictedTag')}</Tag>
        <Typography.Text type="secondary">{t('scopeOwnerOnly')}</Typography.Text>
      </span>
    );
  }
  return (
    <span>
      <Tag>{t('scopeModeRestrictedTag')}</Tag>
      <Space wrap size={6} style={{ marginLeft: 4 }}>
        {teams.map((team) => (
          <Tag key={`team-${team.id}`} color="blue">
            {team.name || team.id}
          </Tag>
        ))}
        {users.map((user) => (
          <Tag key={`user-${user.id}`}>{user.name || user.id}</Tag>
        ))}
      </Space>
    </span>
  );
}
