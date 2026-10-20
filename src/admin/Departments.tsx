import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Drawer, Empty, Form, Input, Modal, Space, Table, Tooltip, Typography } from 'antd';
import { useEffect, useState } from 'react';

import { translate } from './i18n.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { PortalClient, type PortalDepartment } from './portal.js';

const language = 'zh' as const;
const departmentsKey = ['portal', 'departments'] as const;

type DepartmentMember = {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
};

export function Departments({
  client,
  portal: injectedPortal,
}: {
  readonly client: unknown;
  readonly portal?: PortalClient | undefined;
}) {
  const [portal] = useState(
    () =>
      injectedPortal ??
      new PortalClient((rejectedToken) =>
        (client as { getAccessToken(rejectedToken?: string): Promise<string | null> }).getAccessToken(rejectedToken),
      ),
  );
  const queryClient = useQueryClient();
  const departmentsQuery = useQuery({
    queryKey: departmentsKey,
    queryFn: () => portal.listDepartments(),
  });
  const departments = departmentsQuery.data ?? null;
  const loading = departmentsQuery.isFetching;
  const loadError = departmentsQuery.error;
  const error = loadError ? (loadError instanceof Error ? loadError.message : String(loadError)) : null;
  const reload = () => void queryClient.invalidateQueries({ queryKey: departmentsKey });
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<PortalDepartment | null>(null);
  const [members, setMembers] = useState<DepartmentMember[] | null>(null);
  const [membersDept, setMembersDept] = useState<string | null>(null);

  const loadMembers = async (deptId: string) => {
    setMembersDept(deptId);
    try {
      const result = await (
        portal as unknown as {
          listDepartmentMembers(id: string): Promise<readonly DepartmentMember[]>;
        }
      ).listDepartmentMembers(deptId);
      setMembers([...result]);
    } catch {
      setMembers([]);
    }
  };

  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <div className="flex w-full flex-col gap-5">
        <div>
          <p className="text-xs text-tertiary-foreground">{translate(language, 'workspaceLabel')}</p>
          <h2 className="mt-1 text-lg font-semibold leading-snug">{translate(language, 'departmentsTitle')}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{translate(language, 'departmentsDescription')}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button icon={<ReloadOutlined />} onClick={() => void departmentsQuery.refetch()} loading={loading}>
            {translate(language, 'refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {translate(language, 'departmentsCreate')}
          </Button>
        </div>
        {error ? <Alert type="error" message={error} showIcon /> : null}
        <div className="overflow-hidden rounded-lg border border-border">
          <Table
            dataSource={departments ?? []}
            loading={loading && departments === null}
            rowKey={(record) => record.id}
            locale={{
              emptyText: <Empty description={translate(language, 'departmentsEmpty')} />,
            }}
            pagination={false}
          >
            <Table.Column
              title={translate(language, 'departmentsColumnId')}
              dataIndex="id"
              key="id"
              render={(id: string) => <Typography.Text code>{id}</Typography.Text>}
            />
            <Table.Column title={translate(language, 'departmentsColumnName')} dataIndex="name" key="name" />
            <Table.Column
              title=""
              key="actions"
              width={200}
              render={(_: unknown, record: PortalDepartment) => (
                <Space>
                  <Tooltip title={translate(language, 'departmentsMembers')}>
                    <Button size="small" icon={<TeamOutlined />} onClick={() => void loadMembers(record.id)} />
                  </Tooltip>
                  <Tooltip title={translate(language, 'departmentsRename')}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => setRenaming(record)} />
                  </Tooltip>
                  <Tooltip title={translate(language, 'departmentsDelete')}>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        Modal.confirm({
                          title: translate(language, 'departmentsDeleteConfirm'),
                          content: record.name,
                          onOk: async () => {
                            try {
                              await (
                                portal as unknown as {
                                  deleteDepartment(id: string): Promise<void>;
                                }
                              ).deleteDepartment(record.id);
                              notify(AdminNotificationKind.Success, translate(language, 'departmentsDeleted'));
                              reload();
                            } catch (cause) {
                              notify(
                                AdminNotificationKind.Error,
                                cause instanceof Error ? cause.message : String(cause),
                              );
                            }
                          },
                        });
                      }}
                    />
                  </Tooltip>
                </Space>
              )}
            />
          </Table>
        </div>
      </div>

      <CreateDepartmentModal portal={portal} open={creating} onClose={() => setCreating(false)} onCreated={reload} />
      <RenameDepartmentModal
        portal={portal}
        department={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={reload}
      />
      <Drawer
        title={`${translate(language, 'departmentsMembers')}: ${membersDept ?? ''}`}
        open={members !== null}
        onClose={() => {
          setMembers(null);
          setMembersDept(null);
        }}
        width={400}
      >
        {members === null ? null : members.length === 0 ? (
          <Empty description={translate(language, 'departmentsNoMembers')} />
        ) : (
          <Table dataSource={members} rowKey={(record) => record.userId} pagination={false} size="small">
            <Table.Column title="User" dataIndex="username" key="username" />
            <Table.Column title="Name" dataIndex="displayName" key="displayName" />
          </Table>
        )}
      </Drawer>
    </section>
  );
}

function CreateDepartmentModal({
  portal,
  open,
  onClose,
  onCreated,
}: {
  readonly portal: PortalClient;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}) {
  const [form] = Form.useForm<{ name: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      form.resetFields();
      setError(null);
    }
  }, [open, form]);

  const submit = async (values: { name: string }) => {
    setPending(true);
    setError(null);
    try {
      const result = await portal.createDepartment(values.name.trim());
      if (result.kind === 'rejected') {
        setError(result.message);
        return;
      }
      notify(AdminNotificationKind.Success, result.message);
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      title={translate(language, 'departmentsCreate')}
      open={open}
      onCancel={onClose}
      confirmLoading={pending}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={(v) => void submit(v)}>
        <Form.Item name="name" label={translate(language, 'departmentsFieldName')} rules={[{ required: true }]}>
          <Input placeholder="研发部" />
        </Form.Item>
        {error ? <Alert type="error" message={error} showIcon /> : null}
      </Form>
    </Modal>
  );
}

function RenameDepartmentModal({
  portal,
  department,
  onClose,
  onRenamed,
}: {
  readonly portal: PortalClient;
  readonly department: PortalDepartment | null;
  readonly onClose: () => void;
  readonly onRenamed: () => void;
}) {
  const [form] = Form.useForm<{ name: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (department) {
      form.setFieldsValue({ name: department.name });
      setError(null);
    }
  }, [department, form]);

  const submit = async (values: { name: string }) => {
    if (!department) return;
    setPending(true);
    setError(null);
    try {
      await (
        portal as unknown as {
          renameDepartment(id: string, name: string): Promise<void>;
        }
      ).renameDepartment(department.id, values.name.trim());
      notify(AdminNotificationKind.Success, translate(language, 'departmentsRenamed'));
      onRenamed();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      title={translate(language, 'departmentsRename')}
      open={department !== null}
      onCancel={onClose}
      confirmLoading={pending}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={(v) => void submit(v)}>
        <Form.Item name="name" label={translate(language, 'departmentsFieldName')} rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        {error ? <Alert type="error" message={error} showIcon /> : null}
      </Form>
    </Modal>
  );
}
