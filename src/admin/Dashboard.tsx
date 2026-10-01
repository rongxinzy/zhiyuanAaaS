import { useEffect, useState } from "react";
import { Alert, Card, Col, Empty, Row, Statistic, Table, Tag } from "antd";
import {
  CheckCircleOutlined,
  CommentOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";

import { translate } from "./i18n.js";
import { PortalClient, type PortalUsageStats } from "./portal.js";

const language = "zh" as const;

export function Dashboard({
  client,
  portal: injectedPortal,
}: {
  readonly client: { getAccessToken(): Promise<string | null> };
  readonly portal?: PortalClient | undefined;
}) {
  const [portal] = useState(
    () => injectedPortal ?? new PortalClient(() => client.getAccessToken()),
  );
  const [stats, setStats] = useState<PortalUsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void portal.usageStats().then(setStats).catch((cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => setLoading(false));
  }, [portal]);

  if (error) {
    return (
      <section className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <Alert type="error" message={error} showIcon />
      </section>
    );
  }

  const t = stats?.totals;

  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <div>
        <p className="text-xs text-tertiary-foreground">
          {translate(language, "workspaceLabel")}
        </p>
        <h2 className="mt-1 text-lg font-semibold leading-snug">
          {translate(language, "dashboardTitle")}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {translate(language, "dashboardDescription")}
        </p>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title={translate(language, "dashboardConversations")}
              value={t?.conversations ?? 0}
              prefix={<CommentOutlined />}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {translate(language, "dashboardToday")}: {t?.todayConversations ?? 0}
            </p>
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title={translate(language, "dashboardRuns")}
              value={t?.runs ?? 0}
              prefix={<ThunderboltOutlined />}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {translate(language, "dashboardToday")}: {t?.todayRuns ?? 0}
            </p>
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title={translate(language, "dashboardEmployees")}
              value={t?.readyEmployees ?? 0}
              suffix={`/ ${t?.employees ?? 0}`}
              prefix={<RobotOutlined />}
              valueStyle={{ color: (t?.readyEmployees ?? 0) === (t?.employees ?? 0) ? "#52c41a" : "#faad14" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title={translate(language, "dashboardDepartments")}
              value={Object.keys(stats?.byDepartment ?? {}).length}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title={translate(language, "dashboardByDepartment")}>
        {Object.keys(stats?.byDepartment ?? {}).length === 0 ? (
          <Empty description={translate(language, "dashboardNoData")} />
        ) : (
          <Table
            dataSource={Object.entries(stats?.byDepartment ?? {}).map(([id, d]) => ({
              key: id,
              id,
              ...d,
              threads7d: stats?.threadsByDepartment7d?.[id] ?? 0,
            }))}
            pagination={false}
            size="small"
          >
            <Table.Column
              title={translate(language, "departmentsColumnId")}
              dataIndex="id"
              key="id"
              render={(id: string) => (
                <Tag color={id === "(unassigned)" ? "default" : "blue"}>{id}</Tag>
              )}
            />
            <Table.Column title={translate(language, "dashboardEmployees")} dataIndex="employees" key="employees" />
            <Table.Column
              title={translate(language, "dashboardReady")}
              dataIndex="ready"
              key="ready"
              render={(ready: number, record: { employees: number }) => (
                <span style={{ color: ready === record.employees ? "#52c41a" : "#faad14" }}>
                  <CheckCircleOutlined /> {ready}/{record.employees}
                </span>
              )}
            />
            <Table.Column title={translate(language, "dashboardThreads7d")} dataIndex="threads7d" key="threads7d" />
          </Table>
        )}
      </Card>

      <Card size="small" title={translate(language, "dashboardModelUsage")}>
        {Object.keys(stats?.modelCalls7d ?? {}).length === 0 ? (
          <Empty description={translate(language, "dashboardNoData")} />
        ) : (
          <Row gutter={[16, 16]}>
            {Object.entries(stats?.modelCalls7d ?? {}).map(([model, calls]) => (
              <Col key={model} xs={12} sm={8} lg={6}>
                <Statistic title={model} value={calls} suffix={translate(language, "dashboardCalls")} />
              </Col>
            ))}
          </Row>
        )}
      </Card>
    </section>
  );
}
