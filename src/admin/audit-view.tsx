/**
 * 审计页共用的展示片段：时间到秒、结果标签、详情抽屉四段结构。
 *
 * 原始码、原始 ID、原始纳秒 ISO 时间只出现在「技术详情」；列表与正文一律中文。
 */
import { Descriptions, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { auditCopy as c } from './audit-copy.js';
import { auditCodeLabel, changeFieldLabel, changeValueText, resultLabel } from './audit-labels.js';
import { formatTimestampSeconds } from './format.js';

export type AuditDetailRow = { readonly key: string; readonly label: ReactNode; readonly children: ReactNode };

/** 缺值时如实写「未记录」，不编造内容。 */
export const shown = (value?: string | null) => value || c.unknown;

/** 主表时间统一到秒并带时区；原始纳秒 ISO 只留在技术详情。 */
export const timeCell = (value?: string | null) => formatTimestampSeconds(value) || c.unknown;

/** 事件码 / 动作列：登记过给中文，未登记原样显示英文码，缺值写未记录。 */
export function codeCell(value?: string | null) {
  return auditCodeLabel(value) ?? shown(value);
}

/** 结果标签：颜色按原始取值判定，文案走共用中文映射，未登记取值原样显示。 */
export function resultCell(value?: string) {
  if (!value) return c.unknown;
  const color =
    value === 'success' || value === 'succeeded' || value === 'accepted'
      ? 'success'
      : value === 'failure'
        ? 'error'
        : value === 'denied'
          ? 'warning'
          : value === 'pending'
            ? 'processing'
            : null;
  return color ? <Tag color={color}>{resultLabel(value)}</Tag> : <Tag>{resultLabel(value)}</Tag>;
}

/** 变化字段摘要：只列 before/after 里出现过的字段，完整取值交给「变更前 / 变更后」。 */
function changedFields(changes: Record<string, unknown>): readonly string[] {
  const keys = new Set<string>();
  for (const side of ['before', 'after'] as const) {
    const value = changes[side];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const key of Object.keys(value)) keys.add(key);
  }
  return [...keys];
}

/** 一行一个字段：登记过的字段名与枚举值用中文（枚举括注原值），未知字段原样保留。 */
function changeLines(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value) ?? c.unknown;
  return Object.entries(value)
    .map(([key, entry]) => `${changeFieldLabel(key)}: ${changeValueText(key, entry)}`)
    .join('\n');
}

function Block({ title, rows }: { readonly title: string; readonly rows: readonly AuditDetailRow[] }) {
  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 20 }}>
        {title}
      </Typography.Title>
      <Descriptions column={1} bordered items={[...rows]} />
    </>
  );
}

function ChangeLines({ value }: { readonly value: unknown }) {
  return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{changeLines(value)}</div>;
}

/**
 * 详情抽屉正文。`changes` 为空表示这次操作没有变更记录，如实写「无变更记录」，
 * 不把整份 JSON 再渲染一遍；`failure` 为 null 表示该记录没有失败信息。
 */
export function AuditDetail({
  overview,
  changes,
  failure,
  technical,
}: {
  readonly overview: readonly AuditDetailRow[];
  readonly changes?: Record<string, unknown> | null;
  readonly failure?: readonly AuditDetailRow[] | null;
  readonly technical: readonly AuditDetailRow[];
}) {
  const hasBefore = changes != null && 'before' in changes;
  const hasAfter = changes != null && 'after' in changes;
  const fields = changes ? changedFields(changes) : [];
  return (
    <>
      <Block title={c.overview} rows={overview} />
      {changes ? (
        <Block
          title={c.changes}
          rows={[
            {
              key: 'fields',
              label: c.changeFields,
              children: fields.length > 0 ? fields.map((key) => changeFieldLabel(key)).join('、') : c.unknown,
            },
            ...(hasBefore
              ? [{ key: 'before', label: c.changedBefore, children: <ChangeLines value={changes.before} /> }]
              : []),
            ...(hasAfter
              ? [{ key: 'after', label: c.changedAfter, children: <ChangeLines value={changes.after} /> }]
              : []),
          ]}
        />
      ) : (
        <>
          <Typography.Title level={5} style={{ marginTop: 20 }}>
            {c.changes}
          </Typography.Title>
          <Typography.Text type="secondary">{c.noChanges}</Typography.Text>
        </>
      )}
      {failure && <Block title={c.failure} rows={failure} />}
      <Block title={c.technical} rows={technical} />
    </>
  );
}
