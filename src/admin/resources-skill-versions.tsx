import { UploadOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Popconfirm, Space, Table, Tag, Typography, Upload } from 'antd';
import { useState } from 'react';
import type { AdminConsoleClient, AdminSkill, AdminSkillVersion } from './client.js';
import { formatTimestamp } from './format.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { resourcesCopy as rc } from './resources-copy.js';
import {
  PAGINATION,
  problemCode,
  publishFailureCopy,
  t,
  UnknownText,
  uploadFailureCopy,
  useMutationRunner,
} from './resources-shared.js';
import { versionStateLabel } from './resources-subjects.js';

export function VersionManager({
  client,
  skill,
  canWrite,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly skill: AdminSkill;
  readonly canWrite: boolean;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [version, setVersion] = useState('');
  const [archive, setArchive] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const busy = uploading || pending || pendingVersion !== null;
  const upload = async () => {
    if (!version.trim() || !archive) {
      notify(AdminNotificationKind.Error, t('skillUploadFailed'));
      return;
    }
    setUploading(true);
    try {
      await client.uploadSkillVersion(skill.id, version.trim(), new Uint8Array(await archive.arrayBuffer()));
      setVersion('');
      setArchive(null);
      await onChanged();
      notify(AdminNotificationKind.Success, t('versionUploaded'));
    } catch (error) {
      const code = problemCode(error);
      notify(AdminNotificationKind.Error, t((code ? uploadFailureCopy[code] : undefined) ?? 'skillUploadFailed'));
    } finally {
      setUploading(false);
    }
  };
  const publish = async (candidate: string) => {
    setPendingVersion(candidate);
    try {
      await client.publishSkillVersion(skill.id, candidate);
      await onChanged();
      notify(AdminNotificationKind.Success, t('changesSaved'));
    } catch (error) {
      const code = problemCode(error);
      notify(AdminNotificationKind.Error, t((code ? publishFailureCopy[code] : undefined) ?? 'skillPublishFailed'));
    } finally {
      setPendingVersion(null);
    }
  };
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {canWrite ? (
        <Space size={8} wrap align="start">
          <Input
            aria-label={t('skillVersion')}
            placeholder={t('skillVersion')}
            value={version}
            disabled={busy}
            onChange={(event) => setVersion(event.target.value)}
            style={{ width: 160 }}
          />
          <Upload
            accept=".zip,application/zip"
            maxCount={1}
            disabled={busy}
            beforeUpload={(file) => {
              setArchive(file);
              return false;
            }}
            onRemove={() => {
              setArchive(null);
            }}
          >
            <Button icon={<UploadOutlined />} disabled={busy}>
              {t('chooseSkillPackage')}
            </Button>
          </Upload>
          <Button
            type="primary"
            loading={uploading}
            disabled={busy || !version.trim() || !archive}
            onClick={() => void upload()}
          >
            {t('uploadVersion')}
          </Button>
        </Space>
      ) : null}
      {skill.versions.length === 0 ? (
        <Empty description={t('noVersions')} />
      ) : (
        <Table<AdminSkillVersion>
          rowKey="version"
          size="small"
          pagination={PAGINATION}
          dataSource={[...skill.versions]}
          columns={[
            { title: t('skillVersion'), dataIndex: 'version', key: 'version' },
            {
              title: t('status'),
              key: 'state',
              render: (_, item) => (
                <Tag color={item.state === 'published' ? 'green' : item.state === 'draft' ? 'gold' : 'default'}>
                  {t(versionStateLabel(item.state))}
                </Tag>
              ),
            },
            {
              title: rc.versionSize,
              key: 'size',
              render: (_, item) => `${item.size} ${t('bytes')}`,
            },
            {
              title: rc.versionSha,
              key: 'sha256',
              render: (_, item) => (
                <Typography.Text copyable={{ text: item.sha256 }} style={{ fontSize: 12 }}>
                  {`${item.sha256.slice(0, 12)}…`}
                </Typography.Text>
              ),
            },
            {
              title: rc.versionCreatedAt,
              key: 'createdAt',
              render: (_, item) =>
                item.createdAt ? formatTimestamp(item.createdAt) || <UnknownText /> : <UnknownText />,
            },
            ...(canWrite
              ? [
                  {
                    title: t('actions'),
                    key: 'actions',
                    align: 'right' as const,
                    render: (_: unknown, item: AdminSkillVersion) => (
                      <Space size={0} wrap>
                        {item.state === 'draft' ? (
                          <Button
                            type="link"
                            size="small"
                            loading={pendingVersion === item.version}
                            disabled={busy}
                            onClick={() => void publish(item.version)}
                          >
                            {rc.publishAction}
                          </Button>
                        ) : null}
                        <Popconfirm
                          title={t('withdrawVersionTitle')}
                          description={t('withdrawVersionDescription')}
                          okText={t('confirmWithdrawVersion')}
                          cancelText={t('cancel')}
                          okButtonProps={{ danger: true }}
                          onConfirm={() =>
                            void run(async () => {
                              await client.deleteSkillVersion(skill.id, item.version);
                            })
                          }
                        >
                          <Button type="link" size="small" danger disabled={busy}>
                            {rc.withdrawAction}
                          </Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </Space>
  );
}
