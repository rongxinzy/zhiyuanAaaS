import type { ReactNode } from 'react';
import { ADMIN_LANGUAGE, type AdminLanguage, type AdminTranslationKey, translate } from './i18n.js';
import { type ManagedKnowledgeChunk, type ManagedKnowledgeSpans, PortalError } from './portal.js';

const language: AdminLanguage = ADMIN_LANGUAGE;
export type SpanTreeNode = { readonly key: string; readonly title: ReactNode; readonly children?: SpanTreeNode[] };
const copyKeys = {
  knowledgeBaseType: 'knowledgeBaseType',
  knowledgeDocumentBase: 'knowledgeDocumentBase',
  knowledgeFAQBase: 'knowledgeFAQBase',
  title: 'knowledgeManagementTitle',
  description: 'knowledgeManagementDescription',
  add: 'knowledgeCreate',
  refresh: 'statusRefresh',
  empty: 'knowledgeEmptyManaged',
  emptyHint: 'knowledgeEmptyManagedHint',
  name: 'knowledgeName',
  descriptionField: 'knowledgeDescriptionField',
  id: 'knowledgeId',
  documents: 'knowledgeDocuments',
  edit: 'knowledgeEdit',
  remove: 'knowledgeDelete',
  createTitle: 'knowledgeCreateTitle',
  editTitle: 'knowledgeEditTitle',
  nameRequired: 'knowledgeNameRequired',
  save: 'knowledgeSave',
  cancel: 'knowledgeCancel',
  deleteTitle: 'knowledgeDeleteTitle',
  deleteHint: 'knowledgeDeleteHint',
  deleteConfirm: 'knowledgeDeleteConfirm',
  saveDone: 'knowledgeSaved',
  created: 'knowledgeCreated',
  deleted: 'knowledgeDeleted',
  operation: 'knowledgeOperation',
  uncertain: 'knowledgeUncertain',
  docsTitle: 'knowledgeDocsTitle',
  docName: 'knowledgeDocName',
  fileName: 'knowledgeFileName',
  parse: 'knowledgeParseStatus',
  createdAt: 'knowledgeCreatedAt',
  search: 'knowledgeSearchDocs',
  upload: 'knowledgeUpload',
  chooseFile: 'knowledgeChooseFile',
  chooseFolder: 'knowledgeChooseFolder',
  uploadFolder: 'knowledgeUploadFolder',
  addMaterial: 'knowledgeAddMaterial',
  parsingHint: 'knowledgeParsingHint',
  summaryTotal: 'knowledgeSummaryTotal',
  summaryReady: 'knowledgeSummaryReady',
  summaryProcessing: 'knowledgeSummaryProcessing',
  summaryFailed: 'knowledgeSummaryFailed',
  summaryAgents: 'knowledgeSummaryAgents',
  summaryGrants: 'knowledgeSummaryGrants',
  summaryReadyUnknown: 'knowledgeSummaryReadyUnknown',
  summaryLabel: 'knowledgeSummary',
  statusSearchable: 'knowledgeStatusSearchable',
  statusFailedShort: 'knowledgeStatusFailedShort',
  viewReason: 'knowledgeViewReason',
  viewDocument: 'knowledgeViewDocument',
  batchPicked: 'knowledgeBatchPicked',
  batchMove: 'knowledgeBatchMove',
  batchRetry: 'knowledgeBatchRetry',
  batchDelete: 'knowledgeBatchDelete',
  batchBar: 'knowledgeBatchBar',
  batchMoveTitle: 'knowledgeBatchMoveTitle',
  batchMoveTarget: 'knowledgeBatchMoveTarget',
  batchFailed: 'knowledgeBatchFailed',
  uploadTargetFolder: 'knowledgeUploadTargetFolder',
  uncategorized: 'knowledgeUncategorized',
  foldersLabel: 'knowledgeFolders',
  uploadFile: 'knowledgeUploadFile',
  importFolder: 'knowledgeImportFolder',
  allMaterials: 'knowledgeAllMaterials',
  documentCount: 'knowledgeDocumentCount',
  statusAll: 'knowledgeStatusAll',
  documentsTab: 'knowledgeTabDocuments',
  folderQueued: 'knowledgeFolderQueued',
  folderUploading: 'knowledgeFolderUploading',
  folderAccepted: 'knowledgeFolderAccepted',
  folderFailed: 'knowledgeFolderFailed',
  folderRetryFailed: 'knowledgeFolderRetryFailed',
  folderClear: 'knowledgeFolderClear',
  folderFiles: 'knowledgeFolderFiles',
  folderLimit: 'knowledgeFolderLimit',
  folderHint: 'knowledgeFolderHint',
  indexHint: 'knowledgeIndexHint',
  tabDocuments: 'knowledgeTabDocuments',
  tabRetrieval: 'knowledgeTabRetrieval',
  tabAccess: 'knowledgeTabAccess',
  manageDocuments: 'knowledgeManageDocuments',
  columnScope: 'knowledgeColumnScope',
  columnUpdated: 'knowledgeColumnUpdated',
  columnDocs: 'knowledgeColumnDocs',
  baseType: 'knowledgeBaseType',
  notStatistic: 'knowledgeNotStatistic',
  parseProcessing: 'knowledgeParseProcessing',
  parseCompleted: 'knowledgeParseCompleted',
  scopeSummary: 'knowledgeScopeSummary',
  sectionSummary: 'knowledgeSummary',
  fieldTenant: 'knowledgeTenant',
  fieldEmbeddingModel: 'knowledgeEmbeddingModel',
  moreActions: 'knowledgeMoreActions',
  fileLimit: 'knowledgeFileLimit',
  uploadAccepted: 'knowledgeUploadAccepted',
  knowledgeImportUrl: 'knowledgeImportUrl',
  knowledgeImportManual: 'knowledgeImportManual',
  knowledgeUrl: 'knowledgeUrl',
  knowledgeTitle: 'knowledgeTitle',
  knowledgeContent: 'knowledgeContent',
  knowledgeImport: 'knowledgeImport',
  knowledgeRetryParse: 'knowledgeRetryParse',
  knowledgeCancelParse: 'knowledgeCancelParse',
  knowledgeDeleteDocument: 'knowledgeDeleteDocument',
  knowledgeDeleteDocumentHint: 'knowledgeDeleteDocumentHint',
  knowledgeDeleteConfirm: 'knowledgeDeleteConfirm',
  knowledgePreview: 'knowledgePreview',
  knowledgePreviewUnavailable: 'knowledgePreviewUnavailable',
  knowledgeDownload: 'knowledgeDownload',
  knowledgeChunks: 'knowledgeChunks',
  chunkCount: 'knowledgeChunkCount',
  chunkEmpty: 'knowledgeNoChunks',
  knowledgeSpans: 'knowledgeSpans',
  chunkText: 'knowledgeChunkText',
  chunkEnabled: 'knowledgeChunkEnabled',
  chunkDisabled: 'knowledgeChunkDisabled',
  currentStage: 'knowledgeCurrentStage',
  attempt: 'knowledgeAttempt',
  knowledgeNoOriginal: 'knowledgeNoOriginal',
  knowledgeDocumentEnableHint: 'knowledgeDocumentEnableHint',
  knowledgeFileOnlyPreview: 'knowledgeFileOnlyPreview',
  knowledgeSource: 'knowledgeSource',
  knowledgeEnableState: 'knowledgeEnableState',
  sourceFile: 'knowledgeSourceFile',
  sourceUrl: 'knowledgeSourceUrl',
  sourceManual: 'knowledgeSourceManual',
  sourceFaq: 'knowledgeSourceFaq',
  sourceWeb: 'knowledgeSourceWeb',
  sourceFolder: 'knowledgeSourceFolder',
  enableEnabled: 'knowledgeEnableEnabled',
  enableDisabled: 'knowledgeEnableDisabled',
  baseTypeDocument: 'knowledgeBaseTypeDocument',
  baseTypeFaq: 'knowledgeBaseTypeFaq',
  enableDocument: 'knowledgeEnableDocument',
  disableDocument: 'knowledgeDisableDocument',
  keepDisabledAfterParse: 'knowledgeKeepDisabledAfterParse',
  imagePreview: 'knowledgeImagePreview',
  chunkEdit: 'knowledgeChunkEdit',
  chunkRevision: 'knowledgeChunkRevision',
  chunkSaved: 'knowledgeChunkSaved',
  chunkIndexFailed: 'knowledgeChunkIndexFailed',
  chunkIndexStatus: 'knowledgeChunkIndexStatus',
  knowledgeActions: 'knowledgeActions',
  active: 'knowledgeStatusActive',
  completed: 'knowledgeStatusCompleted',
  failed: 'knowledgeStatusFailed',
  cancelled: 'knowledgeStatusCancelled',
  deleting: 'knowledgeStatusDeleting',
  pending: 'knowledgeStatusPending',
  processing: 'knowledgeStatusProcessing',
  finalizing: 'knowledgeStatusFinalizing',
  unknown: 'knowledgeStatusUnknown',
  error: 'knowledgeOperationFailed',
  retry: 'knowledgeRetryRead',
  noSelection: 'knowledgeSelectBase',
  emptyDocs: 'knowledgeNoDocuments',
  page: 'knowledgeCreatedAt',
  writeRecovered: 'knowledgeWriteRecovered',
  byteLimitExceeded: 'knowledgeByteLimitExceeded',
  byteUnit: 'knowledgeByteUnit',
  urlInvalid: 'knowledgeURLInvalid',
  urlScheme: 'knowledgeURLScheme',
  urlUserInfo: 'knowledgeURLUserInfo',
  urlFragment: 'knowledgeURLFragment',
  urlPrivateHost: 'knowledgeURLPrivateHost',
  chunkContent: 'knowledgeChunkContent',
} as const satisfies Record<string, AdminTranslationKey>;
export type CopyKey = keyof typeof copyKeys;
export const t = (key: CopyKey) => translate(language, copyKeys[key]);
export const pollable = new Set(['pending', 'processing', 'finalizing', 'deleting']);
// 目录树里「全部资料」节点的 key：选中它表示不带 folder_path 过滤。
export const ALL_FOLDERS_KEY = '__all__';

/** 按原型的时间样式显示：YYYY-MM-DD HH:mm（空值给占位符，不显示 Invalid Date）。 */
export function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 文件大小换算成可读单位；缺失、非正数或非有限值返回空串，不显示「0 B」。 */
export function formatFileSize(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : Number(value.toFixed(1))} ${units[unit]}`;
}

/** 上游枚举 → 中文（未收录的值原样显示，不隐藏信息）。 */
export const sourceCopy: Readonly<Record<string, CopyKey>> = {
  file: 'sourceFile',
  url: 'sourceUrl',
  link: 'sourceUrl',
  manual: 'sourceManual',
  faq: 'sourceFaq',
  web: 'sourceWeb',
  folder: 'sourceFolder',
};

export function isUncertain(error: unknown): boolean {
  return !(error instanceof PortalError) || error.status >= 500;
}

/**
 * 长度口径：portal 用 Go 的 `len()` 校验这些字段，即 **UTF-8 字节**。
 * 前端按字符数限会把「67 个汉字」当成 67，放行后由后端 400 打回，
 * 而错误文案只有笼统的「名称或描述无效」，所以这里统一按字节判断并给出具体字节数。
 */
export const byteLength = (value: string): number => new TextEncoder().encode(value).length;

export const NAME_MAX_BYTES = 200;
export const DESCRIPTION_MAX_BYTES = 2000;
export const TITLE_MAX_BYTES = 200;
export const URL_MAX_BYTES = 2048;
/** portal 对正文的字段上限是 1<<20，但对整个 JSON body 也是 1<<20；
 *  1,000,000 字节给标题与序列化开销留出余量，不会出现「正好卡在边界被 400」。 */
export const CONTENT_MAX_BYTES = 1_000_000;

export const byteLimitMessage = (label: string, limit: number, bytes: number): string =>
  `${t('byteLimitExceeded')}：${label} ${bytes} ${t('byteUnit')} > ${limit} ${t('byteUnit')}`;

/** 表单规则：值不超过 `limit` 字节，超限时报出字段名与当前字节数。 */
export const byteLimitRule = (label: string, limit: number) => ({
  validator: (_rule: unknown, value: unknown) => {
    const bytes = byteLength(typeof value === 'string' ? value : '');
    if (bytes <= limit) return Promise.resolve();
    return Promise.reject(new Error(byteLimitMessage(label, limit, bytes)));
  },
});

/**
 * portal 的 `validateManagedKnowledgeURL` 拒绝一切非公网字面量地址。这里复刻它的判定集合
 * （IPv4 私网/环回/链路本地/CGNAT/组播保留、IPv6 环回/唯一本地/链路本地/组播）；
 * 形如 `intranet.corp` 的域名控制台无法判定，留给 portal 的 DNS 结果兜底。
 */
function privateHost(host: string): boolean {
  // URL 给 IPv6 保留方括号，portal（Go）的 Hostname() 不带。
  const value = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (value.includes(':')) {
    if (
      value === '::' ||
      value === '::1' ||
      /^f[cd]/.test(value) || // fc00::/7 唯一本地
      /^fe[89ab]/.test(value) || // fe80::/10 链路本地
      /^ff/.test(value) // 组播
    )
      return true;
    // IPv4-mapped（::ffff:0:0/96）会被 URL 序列化成十六进制，取低 32 位回到 IPv4 判定。
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
    if (!mapped) return false;
    const high = Number.parseInt(mapped[1]!, 16);
    const low = Number.parseInt(mapped[2]!, 16);
    return privateHost(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }
  if (!/^[\d.]+$/.test(value)) return false;
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 || // 10/8 私网
    a === 127 || // 127/8 环回
    (a === 169 && b === 254) || // 169.254/16 链路本地
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12 私网
    (a === 192 && b === 168) || // 192.168/16 私网
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10 CGNAT
    a >= 224 // 组播、保留与广播
  );
}

/**
 * 与 portal 的 `validateManagedKnowledgeURL` 同口径的提交前校验：只放行可公开访问的
 * http(s) 来源。控制台不做 DNS 解析，域名解析到内网 IP 的情况仍由 portal 兜底。
 */
function sourceURLError(value: string): CopyKey | null {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return 'urlInvalid';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'urlScheme';
  if (parsed.username || parsed.password) return 'urlUserInfo';
  // portal 明确拒绝带 fragment 的地址（fragment 只对浏览器有意义，上游抓不到）。
  if (parsed.hash) return 'urlFragment';
  const host = parsed.hostname.replace(/\.$/, '').toLowerCase();
  if (!host) return 'urlInvalid';
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return 'urlPrivateHost';
  if (privateHost(host)) return 'urlPrivateHost';
  return null;
}

/** URL 表单规则：先按字节卡长度（portal 用 len()），再做协议/私网预校验。 */
export const sourceURLRule = {
  validator: (_rule: unknown, value: unknown) => {
    const text = typeof value === 'string' ? value : '';
    if (!text.trim()) return Promise.resolve();
    const bytes = byteLength(text);
    if (bytes > URL_MAX_BYTES)
      return Promise.reject(new Error(byteLimitMessage(t('knowledgeUrl'), URL_MAX_BYTES, bytes)));
    const problem = sourceURLError(text);
    return problem ? Promise.reject(new Error(t(problem))) : Promise.resolve();
  },
};

/**
 * 原文件预览按类型分流：文本内联渲染，图片用 <img>，PDF 才用 iframe。
 * 页面自身的 CSP 有 frame-ancestors（原来 'none'），把文本/图片塞进 iframe
 * 会被浏览器直接拦成「该内容被屏蔽了」。
 */
type PreviewKind = 'text' | 'image' | 'pdf';

export interface PreviewEntry {
  readonly kind: PreviewKind;
  readonly url: string;
  readonly name: string;
  /** Only for `text`: decoded 原文，直接内联显示（iframe 会被自身 CSP 的 frame-ancestors 拦掉）。 */
  readonly text?: string;
  /** PDF 路径专用：服务端下发的不是 `application/pdf` 时不进 iframe，改显示提示。 */
  readonly incompatible?: boolean;
}

export interface PreviewState extends PreviewEntry {
  /** 首次拉取中：弹窗先按固定尺寸打开，内容位置先放占位。 */
  readonly loading?: boolean;
}

/** 预览缓存上限：超出后按最久未预览淘汰（blob URL 一并回收，防止内存随浏览增长）。 */
export const PREVIEW_CACHE_LIMIT = 6;

export function previewKindOf(fileName: string): PreviewKind | null {
  if (/\.(txt|md|csv)$/i.test(fileName)) return 'text';
  if (/\.(png|jpe?g|gif|webp)$/i.test(fileName)) return 'image';
  if (/\.pdf$/i.test(fileName)) return 'pdf';
  return null;
}

/**
 * One file of a folder upload. The folder structure travels as WeKnora's
 * `fileName` (the upstream splits it into folder path + file name), so the
 * console only has to keep the browser-provided relative path intact.
 */
export interface FolderUploadItem {
  readonly key: string;
  /** 入库归属：队列跨「切库」存在过，没有它会把 A 库挑的文件静默传进 B 库。 */
  readonly baseId: string;
  readonly label: string;
  readonly relativePath: string;
  readonly file: File;
  readonly status: 'queued' | 'uploading' | 'accepted' | 'failed' | 'uncertain';
  readonly detail?: string;
}

/** Matches WeKnora's own upload queue: a small bound keeps the pipe full
 *  without piling hashing work on the upstream. */
export const FOLDER_UPLOAD_CONCURRENCY = 3;
export const FOLDER_UPLOAD_MAX_FILES = 200;
/** Same ceiling the single-file picker enforces; the portal caps the multipart
 *  body itself, so an oversized member would only fail upstream. */
export const FOLDER_UPLOAD_MAX_FILE_BYTES = 63 * 1024 * 1024;

/** 「文档管理」上方那条口径说明被关掉后记住，别再每次占位。 */
export const DOC_HINT_DISMISSED_KEY = 'admin-knowledge-doc-hint-dismissed';

export type KnowledgeInspectorState =
  | {
      readonly title: string;
      readonly kind: 'chunks';
      readonly documentId: string;
      readonly content: readonly ManagedKnowledgeChunk[];
      readonly total: number;
      readonly page: number;
      readonly pageSize: number;
    }
  | {
      readonly title: string;
      readonly kind: 'spans';
      readonly documentId: string;
      readonly content: ManagedKnowledgeSpans;
    }
  | null;
