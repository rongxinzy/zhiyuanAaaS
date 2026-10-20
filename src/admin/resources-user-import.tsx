import type { JsonObject } from '@aep/sdk-node';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import type { AdminConsoleClient } from './client.js';
import { t } from './resources-shared.js';

export type UserImportResult = {
  readonly created: number;
  readonly rejected: number;
  readonly errors: readonly string[];
};

// 用户导入弹窗
export function UserImportModal({
  client,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: (result: UserImportResult) => Promise<void>;
  readonly onError: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open) {
      setFile(null);
      setPending(false);
      setFailed(false);
    }
  }, [open]);
  const submit = async () => {
    if (!file) {
      setFailed(true);
      return;
    }
    setPending(true);
    setFailed(false);
    try {
      const name = file.name.toLowerCase();
      const payload = name.endsWith('.json')
        ? normalizeUserImport(JSON.parse(await file.text()))
        : normalizeUserImport(parseUserImportTable(await file.text()));
      const result = await client.importUsers(payload);
      const created = typeof result.created === 'number' ? result.created : 0;
      const rejected = typeof result.rejected === 'number' ? result.rejected : 0;
      const errors = Array.isArray(result.errors)
        ? result.errors.filter((item): item is string => typeof item === 'string').slice(0, 20)
        : [];
      onOpenChange(false);
      await onChanged({ created, rejected, errors });
    } catch {
      setFailed(true);
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      width={700}
      title={t('importUsersTitle')}
      okText={t('importUsers')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => void submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, flex: 1 }}>
          {t('importUsersDescription')}
        </Typography.Paragraph>
      </div>
      {failed ? <Alert type="error" showIcon title={t('importUsersFailed')} style={{ marginBottom: 16 }} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '24px 0px' }}>
        <Upload
          accept=".csv,.xlsx,.xls,.json,application/json,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          maxCount={1}
          disabled={pending}
          style={{ textAlign: 'center' }}
          fileList={file ? [{ uid: 'users-import', name: file.name, size: file.size }] : []}
          beforeUpload={(candidate) => {
            setFile(candidate);
            setFailed(false);
            return false;
          }}
          onChange={({ fileList }) => setFile(fileList[0]?.originFileObj ?? null)}
          onRemove={() => setFile(null)}
        >
          <Button icon={<UploadOutlined />} aria-label={t('importUsersFile')} disabled={pending}>
            {t('importUsersFile')}
          </Button>
        </Upload>
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        {t('importUsersHint')}
        <Button
          type="link"
          icon={<DownloadOutlined />}
          disabled={pending}
          onClick={downloadUserImportTemplate}
          style={{ flexShrink: 0, paddingInlineEnd: 0 }}
        >
          {t('downloadTemplate')}
        </Button>
      </Typography.Paragraph>
    </Modal>
  );
}

function downloadUserImportTemplate(): void {
  const columns: ReadonlyArray<{ readonly label: string; readonly required: boolean }> = [
    { label: '用户名', required: true },
    { label: '显示名称', required: true },
    { label: '邮箱', required: false },
    { label: '临时密码', required: true },
    { label: '选择角色', required: true },
    { label: '选择团队', required: true },
    { label: '首次登录要求修改密码', required: false },
  ];
  const example = [
    'zhangsan',
    '张三',
    'zhangsan@example.com',
    'TempPass123456',
    'role-admin;role-viewer',
    'team-a',
    '是',
  ];
  const escapeHtml = (cell: string): string => cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const headerCells = columns
    .map((column) =>
      column.required
        ? `<th style="color:#ff0000;border:1px solid #000000;padding:4px 8px;">${escapeHtml(`*${column.label}`)}</th>`
        : `<th style="border:1px solid #000000;padding:4px 8px;">${escapeHtml(column.label)}</th>`,
    )
    .join('');
  const exampleCells = example
    .map((cell) => `<td style="border:1px solid #000000;padding:4px 8px;">${escapeHtml(cell)}</td>`)
    .join('');
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="UTF-8" /><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;"><tr>${headerCells}</tr><tr>${exampleCells}</tr></table></body></html>`;
  const blob = new Blob([`﻿${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '用户导入模板.xls';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function splitIds(cell: string): string[] {
  return cell
    .split(/[;；，,、\s|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseUserImportTable(text: string): { readonly users: readonly Record<string, unknown>[] } {
  const content = text.replace(/^\uFEFF/, '');
  if (/<table[\s>]/i.test(content)) {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const rows = [...doc.querySelectorAll('table tr')].map((row) =>
      [...row.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim() ?? ''),
    );
    return buildUserImportUsers(rows.filter((row) => row.some((cell) => cell !== '')));
  }
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (quoted) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      current.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i += 1;
      current.push(field);
      field = '';
      if (current.some((cell) => cell.trim() !== '')) rows.push(current);
      current = [];
    } else field += char;
  }
  current.push(field);
  if (current.some((cell) => cell.trim() !== '')) rows.push(current);
  return buildUserImportUsers(rows);
}

function buildUserImportUsers(rows: readonly string[][]): {
  readonly users: readonly Record<string, unknown>[];
} {
  if (rows.length < 2) throw new Error('Empty user import table.');
  const [headerRow] = rows;
  if (!headerRow) throw new Error('Empty user import table.');
  const header = headerRow.map((cell) => cell.trim().replace(/^[*＊]+\s*/, ''));
  const indexOf = (...names: readonly string[]): number => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const usernameIdx = indexOf('用户名', 'username');
  const displayNameIdx = indexOf('显示名称', 'displayName');
  const emailIdx = indexOf('邮箱', 'email');
  const passwordIdx = indexOf('临时密码', 'temporaryPassword');
  const rolesIdx = indexOf('选择角色', '角色ID', '角色', 'roleIds', 'roles');
  const teamsIdx = indexOf('选择团队', '团队ID', '团队', 'teamIds', 'teams');
  const requireChangeIdx = indexOf('首次登录要求修改密码', 'requirePasswordChange');
  if (usernameIdx < 0 || displayNameIdx < 0 || passwordIdx < 0 || rolesIdx < 0 || teamsIdx < 0)
    throw new Error('Invalid user import header.');
  return {
    users: rows.slice(1).map((cells, rowIndex) => {
      const at = (index: number): string => (cells[index] ?? '').trim();
      const requireText = requireChangeIdx >= 0 ? at(requireChangeIdx).trim().toLowerCase() : '';
      return {
        externalRowId: `row-${rowIndex + 2}`,
        username: at(usernameIdx),
        displayName: at(displayNameIdx),
        email: emailIdx >= 0 ? at(emailIdx) || null : null,
        temporaryPassword: at(passwordIdx),
        roleIds: splitIds(at(rolesIdx)),
        teamIds: splitIds(at(teamsIdx)),
        requirePasswordChange: ['', '是', 'yes', 'true', '1', 'y'].includes(requireText),
      };
    }),
  };
}

function normalizeUserImport(value: unknown): JsonObject {
  const users = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { readonly users?: unknown }).users)
      ? (value as { readonly users: unknown[] }).users
      : null;
  if (!users || users.length === 0 || users.length > 1000) throw new Error('Invalid user import row count.');
  for (const row of users) {
    if (!row || typeof row !== 'object') throw new Error('Invalid user import row.');
    const item = row as Record<string, unknown>;
    for (const key of ['externalRowId', 'username', 'displayName', 'temporaryPassword']) {
      if (typeof item[key] !== 'string' || item[key].trim() === '') throw new Error(`Missing ${key}.`);
    }
    if ((item.temporaryPassword as string).length < 12) throw new Error('Temporary password is too short.');
    for (const key of ['teamIds', 'roleIds']) {
      if (
        item[key] !== undefined &&
        (!Array.isArray(item[key]) || item[key].some((entry) => typeof entry !== 'string'))
      )
        throw new Error(`Invalid ${key}.`);
      if (!Array.isArray(item[key]) || item[key].length === 0) throw new Error(`Missing ${key}.`);
    }
    if (item.requirePasswordChange !== undefined && typeof item.requirePasswordChange !== 'boolean')
      throw new Error('Invalid requirePasswordChange.');
  }
  return { users } as JsonObject;
}
