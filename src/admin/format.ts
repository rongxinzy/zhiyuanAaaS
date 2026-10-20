export function formatTimestamp(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * 审计记录的时间戳：同一秒内可能落多条记录，分钟精度不足以区分，因此固定到秒。
 * 列表与概览用本地可读格式（不再附带 GMT+8 / 时区缩写）；原始 ISO 只留在技术详情。
 */
export function formatTimestampSeconds(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
