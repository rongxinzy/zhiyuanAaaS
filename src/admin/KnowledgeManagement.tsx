import {
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  ExclamationCircleOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { MenuProps, TreeDataNode, UploadFile } from 'antd';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Image,
  Input,
  Listy,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADMIN_LANGUAGE, type AdminLanguage, type AdminTranslationKey, translate } from './i18n.js';
import { KnowledgeGrants } from './KnowledgeGrants.js';
import { KnowledgeOperations } from './KnowledgeOperations.js';
import { KnowledgeRetrieval } from './KnowledgeRetrieval.js';
import { knowledgeErrorText } from './knowledge-error.js';
import { usePageCrumb } from './page-crumb.js';
import {
  type ManagedKnowledgeBase,
  type ManagedKnowledgeChunk,
  type ManagedKnowledgeDocument,
  type ManagedKnowledgeFolder,
  type ManagedKnowledgeFolderTree,
  type ManagedKnowledgePage,
  type ManagedKnowledgeReadiness,
  type ManagedKnowledgeSpans,
  type PortalClient,
  PortalError,
} from './portal.js';

const language: AdminLanguage = ADMIN_LANGUAGE;
type SpanTreeNode = { readonly key: string; readonly title: ReactNode; readonly children?: SpanTreeNode[] };
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
  readiness: 'knowledgeReadiness',
  modelReady: 'knowledgeModelConfigured',
  modelMissing: 'knowledgeModelMissing',
  modelUnavailable: 'knowledgeModelUnavailable',
  unverified: 'knowledgeCapabilitiesUnverified',
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
type CopyKey = keyof typeof copyKeys;
const t = (key: CopyKey) => translate(language, copyKeys[key]);
const pollable = new Set(['pending', 'processing', 'finalizing', 'deleting']);
// 目录树里「全部资料」节点的 key：选中它表示不带 folder_path 过滤。
const ALL_FOLDERS_KEY = '__all__';

/** 按原型的时间样式显示：YYYY-MM-DD HH:mm（空值给占位符，不显示 Invalid Date）。 */
function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 文件大小换算成可读单位；缺失、非正数或非有限值返回空串，不显示「0 B」。 */
function formatFileSize(bytes: number | undefined): string {
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
const sourceCopy: Readonly<Record<string, CopyKey>> = {
  file: 'sourceFile',
  url: 'sourceUrl',
  link: 'sourceUrl',
  manual: 'sourceManual',
  faq: 'sourceFaq',
  web: 'sourceWeb',
  folder: 'sourceFolder',
};

function isUncertain(error: unknown): boolean {
  return !(error instanceof PortalError) || error.status >= 500;
}

/**
 * 长度口径：portal 用 Go 的 `len()` 校验这些字段，即 **UTF-8 字节**。
 * 前端按字符数限会把「67 个汉字」当成 67，放行后由后端 400 打回，
 * 而错误文案只有笼统的「名称或描述无效」，所以这里统一按字节判断并给出具体字节数。
 */
const byteLength = (value: string): number => new TextEncoder().encode(value).length;

const NAME_MAX_BYTES = 200;
const DESCRIPTION_MAX_BYTES = 2000;
const TITLE_MAX_BYTES = 200;
const URL_MAX_BYTES = 2048;
/** portal 对正文的字段上限是 1<<20，但对整个 JSON body 也是 1<<20；
 *  1,000,000 字节给标题与序列化开销留出余量，不会出现「正好卡在边界被 400」。 */
const CONTENT_MAX_BYTES = 1_000_000;

const byteLimitMessage = (label: string, limit: number, bytes: number): string =>
  `${t('byteLimitExceeded')}：${label} ${bytes} ${t('byteUnit')} > ${limit} ${t('byteUnit')}`;

/** 表单规则：值不超过 `limit` 字节，超限时报出字段名与当前字节数。 */
const byteLimitRule = (label: string, limit: number) => ({
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
const sourceURLRule = {
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

interface PreviewEntry {
  readonly kind: PreviewKind;
  readonly url: string;
  readonly name: string;
  /** Only for `text`: decoded 原文，直接内联显示（iframe 会被自身 CSP 的 frame-ancestors 拦掉）。 */
  readonly text?: string;
  /** PDF 路径专用：服务端下发的不是 `application/pdf` 时不进 iframe，改显示提示。 */
  readonly incompatible?: boolean;
}

interface PreviewState extends PreviewEntry {
  /** 首次拉取中：弹窗先按固定尺寸打开，内容位置先放占位。 */
  readonly loading?: boolean;
}

/** 预览缓存上限：超出后按最久未预览淘汰（blob URL 一并回收，防止内存随浏览增长）。 */
const PREVIEW_CACHE_LIMIT = 6;

function previewKindOf(fileName: string): PreviewKind | null {
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
interface FolderUploadItem {
  readonly key: string;
  /** 入库归属：队列跨「切库」存在过，没有它会把 A 库挑的文件静默传进 B 库。 */
  readonly baseId: string;
  readonly label: string;
  readonly relativePath: string;
  readonly file: File;
  readonly status: 'queued' | 'uploading' | 'accepted' | 'failed';
  readonly detail?: string;
}

/** Matches WeKnora's own upload queue: a small bound keeps the pipe full
 *  without piling hashing work on the upstream. */
const FOLDER_UPLOAD_CONCURRENCY = 3;
const FOLDER_UPLOAD_MAX_FILES = 200;
/** Same ceiling the single-file picker enforces; the portal caps the multipart
 *  body itself, so an oversized member would only fail upstream. */
const FOLDER_UPLOAD_MAX_FILE_BYTES = 63 * 1024 * 1024;

/** 「文档管理」上方那条口径说明被关掉后记住，别再每次占位。 */
const DOC_HINT_DISMISSED_KEY = 'admin-knowledge-doc-hint-dismissed';

export function KnowledgeManagement({
  portal,
  baseId = null,
  onNavigate,
}: {
  readonly portal: PortalClient;
  /** Route-selected knowledge base; the list page renders when absent. */
  readonly baseId?: string | null;
  /** Route navigation for the list ⇄ detail hop, so the URL stays authoritative. */
  readonly onNavigate?: ((route: string) => void) | undefined;
}) {
  const [readiness, setReadiness] = useState<ManagedKnowledgeReadiness | null>(null);
  const [bases, setBases] = useState<readonly ManagedKnowledgeBase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(baseId);
  const [detailTab, setDetailTab] = useState('documents');
  const [docHintVisible, setDocHintVisible] = useState(() => localStorage.getItem(DOC_HINT_DISMISSED_KEY) !== '1');
  const [docs, setDocs] = useState<ManagedKnowledgePage | null>(null);
  const [docsContext, setDocsContext] = useState('');
  const [detail, setDetail] = useState<ManagedKnowledgeBase | null>(null);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [folderTree, setFolderTree] = useState<ManagedKnowledgeFolderTree | null>(null);
  // null = 全部资料（不带 folder_path 过滤）；上游把「folder_path 存在但为空」当作根目录，
  // 所以「全部」必须是不传该参数，而不是传空串。
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [materialModal, setMaterialModal] = useState<'file' | 'folder' | null>(null);
  const [pickedDocs, setPickedDocs] = useState<readonly string[]>([]);
  const [moveDialog, setMoveDialog] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchFailures, setBatchFailures] = useState<readonly string[]>([]); // 详情摘要：失败数用上游按 parse_status 过滤后的真实 total；关联 Agent 数按员工绑定统计；
  // 「可检索数」上游没有按启用状态统计的接口，保持 null → 界面显示暂未统计，不推断。
  const [summaryFailed, setSummaryFailed] = useState<number | null>(null);
  const [summaryAgents, setSummaryAgents] = useState<number | null>(null);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [folderQueue, setFolderQueue] = useState<readonly FolderUploadItem[]>([]);
  const [folderUploading, setFolderUploading] = useState(false);
  const [docsRefresh, setDocsRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [writeNotice, setWriteNotice] = useState<string | null>(null);
  const [uncertainWrite, setUncertainWrite] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedKnowledgeBase | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importKind, setImportKind] = useState<'url' | 'manual' | null>(null);
  const [importing, setImporting] = useState(false);
  // 进行中的资料级动作按「行」记账（预览/下载/分块/重解析/启停）。单个全局 id 会在切库、
  // 或另一行并发操作时把别的行永久锁死（旧实现里那些守卫只判 `documentActionId` 真值）。
  const [documentActions, setDocumentActions] = useState<readonly string[]>([]);
  const [inspector, setInspector] = useState<
    | {
        readonly title: string;
        readonly kind: 'chunks';
        readonly documentId: string;
        readonly content: readonly ManagedKnowledgeChunk[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
      }
    | { readonly title: string; readonly kind: 'spans'; readonly content: ManagedKnowledgeSpans }
    | null
  >(null);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunkSavingId, setChunkSavingId] = useState<string | null>(null);
  const [chunkEditor, setChunkEditor] = useState<ManagedKnowledgeChunk | null>(null);
  const [chunkEditorText, setChunkEditorText] = useState('');
  const [chunkImageURLs, setChunkImageURLs] = useState<Record<string, string>>({});
  const [chunkImageLoading, setChunkImageLoading] = useState<string | null>(null);
  const chunkImageURLsRef = useRef<Record<string, string>>({});
  const chunkImageRequests = useRef(new Map<string, AbortController>());
  const [preview, setPreview] = useState<PreviewState | null>(null);
  // 预览缓存：同一资料重复点预览不再走网络；超过上限按最久未用淘汰并回收 blob URL。
  const previewCache = useRef(new Map<string, PreviewEntry>());
  const previewGeneration = useRef(0);
  useEffect(
    () => () => {
      for (const entry of previewCache.current.values()) {
        if (entry.url) URL.revokeObjectURL(entry.url);
      }
      previewCache.current.clear();
    },
    [],
  );
  const [form] = Form.useForm<{ name: string; description: string }>();
  const [importForm] = Form.useForm<{ url: string; title: string; content: string }>();
  const [modal, modalContext] = Modal.useModal();
  const listGeneration = useRef(0);
  const docGeneration = useRef(0);
  const pollRounds = useRef(0);
  const chunkRequestGeneration = useRef(0);
  const chunkSaveGeneration = useRef(0);
  // 预览 blob URL 的生命周期交给预览缓存（淘汰与卸载时回收），这里不再逐个 revoke。
  useEffect(
    () => () => {
      chunkRequestGeneration.current += 1;
      chunkImageRequests.current.forEach((controller) => {
        controller.abort();
      });
      chunkImageRequests.current.clear();
      Object.values(chunkImageURLsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
      chunkImageURLsRef.current = {};
    },
    [],
  );
  // The route owns which base is open: a deep link (/knowledge/<id>) selects it,
  // and going back to /knowledge returns to the list.
  useEffect(() => {
    setSelectedId((current) => (current === baseId ? current : baseId));
  }, [baseId]);

  const openBase = (id: string | null) => {
    chunkRequestGeneration.current += 1;
    chunkSaveGeneration.current += 1;
    setSelectedId(id);
    setDetailTab('documents');
    setPage(1);
    setFiles([]);
    setFolderQueue([]);
    setDocumentActions([]);
    setInspector(null);
    setChunksLoading(false);
    setChunkSavingId(null);
    setChunkEditor(null);
    setChunkEditorText('');
    onNavigate?.(id ? `knowledge/${id}` : 'knowledge');
  };

  const selected = useMemo(
    () => (detail?.id === selectedId ? detail : (bases.find((item) => item.id === selectedId) ?? null)),
    [bases, detail, selectedId],
  );
  // 详情页把当前知识库名报给外壳，面包屑渲染成 企业管理后台 / 知识库 / <名称>。
  usePageCrumb(selectedId ? (selected?.name ?? null) : null);
  // 查询上下文必须与加载时写入 docsContext 的格式一致（含状态与目录筛选），
  // 否则旧响应会被当成「不是当前查询」而永远显示空表。
  const queryContext = `${selectedId ?? ''}:${page}:${search}:${statusFilter}:${folderPath ?? ''}`;
  const queryContextRef = useRef(queryContext);
  queryContextRef.current = queryContext;
  const visibleDocs = docsContext === queryContext ? docs : null;
  const error = baseError ?? detailError ?? docsError;
  const canCreate = readiness?.embeddingModel.state === 'configured';
  const writeBlocked = accessBlocked || !!baseError || !!detailError || uncertainWrite;
  // 「结果不确定」的写锁必须有复位路径：任意一次 5xx/断网都会置位，而它把编辑/删除/上传/
  // 导入/开关/分块保存全部锁死。一次成功的读取（列表/详情/文档）说明上游重新可达，就地解锁并告知管理员。
  const uncertainWriteRef = useRef(false);
  const markUncertainWrite = () => {
    uncertainWriteRef.current = true;
    setUncertainWrite(true);
  };
  const clearUncertainWrite = useCallback(() => {
    if (!uncertainWriteRef.current) return;
    uncertainWriteRef.current = false;
    setUncertainWrite(false);
    setWriteNotice(t('writeRecovered'));
  }, []);

  const documentActionBusy = (id: string) => documentActions.includes(id);
  const beginDocumentAction = (id: string) =>
    setDocumentActions((current) => (current.includes(id) ? current : [...current, id]));
  const endDocumentAction = (id: string) => setDocumentActions((current) => current.filter((item) => item !== id));
  const chunkEditorOverLimit = byteLength(chunkEditorText) > CONTENT_MAX_BYTES;

  const loadBases = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++listGeneration.current;
      setLoading(true);
      setBaseError(null);
      const loadList = async () => {
        try {
          const items = await portal.listManagedKnowledgeBases(signal);
          if (generation !== listGeneration.current || signal?.aborted) return;
          setBases(items);
          setAccessBlocked(false);
          clearUncertainWrite();
          setSelectedId((current) => (current && items.some((item) => item.id === current) ? current : null));
        } catch (cause) {
          if (signal?.aborted || generation !== listGeneration.current) return;
          if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
          setBaseError(knowledgeErrorText(cause));
        } finally {
          if (generation === listGeneration.current && !signal?.aborted) setLoading(false);
        }
      };
      // readiness 只是顶部横幅的信息来源；它单独失败（上游字段改名/探针报错）时
      // 不能把知识库列表和详情一起拖下水，所以和列表并发但各自 try/catch。
      const loadReadiness = async () => {
        try {
          const ready = await portal.managedKnowledgeReadiness(signal);
          if (generation === listGeneration.current && !signal?.aborted) setReadiness(ready);
        } catch {
          if (generation === listGeneration.current && !signal?.aborted) setReadiness(null);
        }
      };
      await Promise.all([loadList(), loadReadiness()]);
    },
    [clearUncertainWrite, portal],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadBases(controller.signal);
    return () => {
      controller.abort();
      listGeneration.current += 1;
    };
  }, [loadBases]);

  const loadDetail = useCallback(
    async (id: string, signal?: AbortSignal) => {
      setDetailError(null);
      try {
        const base = await portal.getManagedKnowledgeBase(id, signal);
        if (signal?.aborted) return;
        setDetail(base);
        clearUncertainWrite();
      } catch (cause) {
        if (signal?.aborted) return;
        if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
        setDetailError(knowledgeErrorText(cause));
      }
    },
    [clearUncertainWrite, portal],
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return undefined;
    }
    const controller = new AbortController();
    setDetail(null);
    void loadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadDetail, selectedId]);

  useEffect(() => {
    chunkRequestGeneration.current += 1;
    chunkSaveGeneration.current += 1;
    setInspector(null);
    setChunksLoading(false);
    setChunkSavingId(null);
    setChunkEditor(null);
    setChunkEditorText('');
    // 切库时必须清空队列与进行中的资料动作：它们属于上一个知识库，留着既会写错库，
    // 也会让新库的行显示上一个库残留的忙碌/锁状态。
    setFolderQueue([]);
    setDocumentActions((current) => (current.length === 0 ? current : []));
  }, [selectedId]);

  useEffect(() => {
    if (inspector?.kind !== 'chunks' || !inspector.content.some((chunk) => chunk.id === chunkEditor?.id)) {
      setChunkEditor(null);
      setChunkEditorText('');
    }
  }, [inspector, chunkEditor?.id]);

  const loadDocuments = useCallback(
    async (signal?: AbortSignal) => {
      if (!selectedId) {
        setDocs(null);
        setDocsContext('');
        return;
      }
      const generation = ++docGeneration.current;
      setDocsLoading(true);
      setDocsError(null);
      try {
        const result = await portal.listManagedKnowledgeDocuments(
          selectedId,
          {
            page,
            pageSize: 10,
            ...(search ? { keyword: search } : {}),
            ...(statusFilter === 'all' ? {} : { parseStatus: statusFilter }),
            ...(folderPath === null ? {} : { folderPath, folderRecursive: true }),
          },
          signal,
        );
        if (generation !== docGeneration.current || signal?.aborted) return;
        setDocs(result);
        setDocsContext(`${selectedId}:${page}:${search}:${statusFilter}:${folderPath ?? ''}`);
        clearUncertainWrite();
        if (result.data.some((item) => pollable.has(item.parse_status))) {
          pollRounds.current += 1;
          setPollTick(pollRounds.current);
        }
      } catch (cause) {
        if (signal?.aborted || generation !== docGeneration.current) return;
        if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
        setDocsError(knowledgeErrorText(cause));
      } finally {
        if (generation === docGeneration.current && !signal?.aborted) setDocsLoading(false);
      }
    },
    [clearUncertainWrite, docsRefresh, folderPath, page, portal, search, selectedId, statusFilter],
  );

  const [pollTick, setPollTick] = useState(0);

  // 目录树按选中库读取；读取失败只是没有树，不挡住资料列表（列表自己会报错）。
  useEffect(() => {
    if (!selectedId) {
      setFolderTree(null);
      return undefined;
    }
    const controller = new AbortController();
    // 目录树是展示用读取：拿到就渲染，读不到（或客户端没有这个方法）只当没有树，
    // 不能因此让整个详情页渲染失败。
    const loadFolders = async () => {
      try {
        const tree = await portal.getManagedKnowledgeFolders(selectedId, controller.signal);
        if (!controller.signal.aborted) setFolderTree(tree);
      } catch {
        if (!controller.signal.aborted) setFolderTree(null);
      }
    };
    void loadFolders();
    return () => controller.abort();
  }, [docsRefresh, portal, selectedId]);

  // 摘要里两个派生数字：失败数（过滤后的真实 total）与关联员工数（员工绑定）。
  // 任一项读不到就留 null，界面显示「暂未统计」，不用分页长度或本地推断凑数。
  useEffect(() => {
    if (!selectedId) {
      setSummaryFailed(null);
      setSummaryAgents(null);
      return undefined;
    }
    const controller = new AbortController();
    const loadSummary = async () => {
      try {
        const failedPage = await portal.listManagedKnowledgeDocuments(
          selectedId,
          { page: 1, pageSize: 1, parseStatus: 'failed' },
          controller.signal,
        );
        if (!controller.signal.aborted) setSummaryFailed(failedPage.total);
      } catch {
        if (!controller.signal.aborted) setSummaryFailed(null);
      }
      try {
        const employees = await portal.listEmployees(controller.signal);
        if (!controller.signal.aborted)
          setSummaryAgents(
            employees.filter((employee) => (employee.knowledgeBases ?? []).some((bound) => bound.id === selectedId))
              .length,
          );
      } catch {
        if (!controller.signal.aborted) setSummaryAgents(null);
      }
    };
    void loadSummary();
    return () => controller.abort();
  }, [docsRefresh, portal, selectedId]);

  // 「添加资料」下拉与状态筛选：与原型一致的四个入口 / 上游 parse_status 真正支持的状态。
  const addMaterialItems: MenuProps['items'] = [
    { key: 'file', label: t('uploadFile'), icon: <UploadOutlined />, disabled: writeBlocked || uploading },
    {
      key: 'folder',
      label: t('importFolder'),
      icon: <FolderOpenOutlined />,
      disabled: writeBlocked || folderUploading,
    },
    { type: 'divider' },
    { key: 'url', label: t('knowledgeImportUrl'), icon: <LinkOutlined />, disabled: writeBlocked || importing },
    {
      key: 'manual',
      label: t('knowledgeImportManual'),
      icon: <FileTextOutlined />,
      disabled: writeBlocked || importing,
    },
  ];

  const onAddMaterial = ({ key }: { readonly key: string }) => {
    if (key === 'file') {
      setFiles([]);
      setMaterialModal('file');
      return;
    }
    if (key === 'folder') {
      setFolderQueue([]);
      setMaterialModal('folder');
      return;
    }
    importForm.resetFields();
    setImportKind(key === 'url' ? 'url' : 'manual');
  };

  // 只列出上游 parse_status 真正支持过滤的值；「已停用」属于 enable_status，
  // 上游没有对应的过滤参数，所以不放进筛选，避免给出一个永远筛不到的选项。
  const statusOptions = [
    { value: 'all', label: t('statusAll') },
    { value: 'completed', label: t('completed') },
    { value: 'processing', label: t('processing') },
    { value: 'failed', label: t('failed') },
    { value: 'cancelled', label: t('cancelled') },
  ];

  const summaryText = (template: string, value: number | null | undefined) =>
    value === null || value === undefined ? t('notStatistic') : template.replace('{count}', String(value));

  // 详情摘要：能算的用真实统计，算不出的显示「暂未统计」（可检索数需要上游按启用状态统计的接口）。
  const summaryItems: { key: string; icon: ReactNode; text: string; onClick?: () => void; hint?: string }[] = [
    { key: 'total', icon: <FileTextOutlined />, text: summaryText(t('summaryTotal'), detail?.knowledge_count) },
    {
      key: 'ready',
      icon: <CheckCircleOutlined />,
      text: summaryText(t('summaryReady'), null),
      hint: t('summaryReadyUnknown'),
    },
    {
      key: 'processing',
      icon: <ClockCircleOutlined />,
      text: summaryText(t('summaryProcessing'), detail?.processing_count),
      onClick: () => {
        setStatusFilter('processing');
        setPage(1);
        setDetailTab('documents');
      },
    },
    {
      key: 'failed',
      icon: <ExclamationCircleOutlined />,
      text: summaryText(t('summaryFailed'), summaryFailed),
      onClick: () => {
        setStatusFilter('failed');
        setPage(1);
        setDetailTab('documents');
      },
    },
    { key: 'agents', icon: <RobotOutlined />, text: summaryText(t('summaryAgents'), summaryAgents) },
    {
      key: 'grants',
      icon: <TeamOutlined />,
      text: summaryText(t('summaryGrants'), detail?.scope ? detail.scope.users + detail.scope.teams : null),
      onClick: () => setDetailTab('access'),
    },
  ];

  const folderNodes = useMemo<TreeDataNode[]>(() => {
    const build = (nodes: readonly ManagedKnowledgeFolder[]): TreeDataNode[] =>
      nodes.map((node) => ({
        key: node.path,
        title: (
          <span>
            <FolderOutlined /> {node.name}
            <Typography.Text type="secondary">{`（${node.total_count}）`}</Typography.Text>
          </span>
        ),
        children: build(node.children ?? []),
      }));
    return [
      {
        key: ALL_FOLDERS_KEY,
        title: `${t('allMaterials')}（${folderTree?.total_document_count ?? 0}）`,
      },
      ...build(folderTree?.folders ?? []),
    ];
  }, [folderTree, t]);

  useEffect(() => {
    pollRounds.current = 0;
    setPollTick(0);
  }, [selectedId]);

  useEffect(() => {
    setDocs(null);
    setDocsContext('');
    setDocsError(null);
  }, [queryContext]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDocuments(controller.signal);
    return () => {
      controller.abort();
      docGeneration.current += 1;
    };
  }, [loadDocuments]);

  const hasActiveDocs = visibleDocs?.data.some((item) => pollable.has(item.parse_status)) ?? false;
  useEffect(() => {
    if (!selectedId || !hasActiveDocs || pollTick >= 6) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadDocuments(controller.signal), 8000);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hasActiveDocs, loadDocuments, pollTick, selectedId]);

  // 详情页那条横幅合并了列表/详情/文档三种读取错误，重试必须重放**失败的那一个**请求：
  // 旧实现一律调 loadBases()，详情读取失败时既没重试、detailError 也永不清除，整页一直只读。
  const retryFailed = () => {
    if (baseError) return void loadBases();
    if (detailError && selectedId) return void loadDetail(selectedId);
    if (docsError) return void loadDocuments();
    return void loadBases();
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setEditorOpen(true);
  };
  const openEdit = (base: ManagedKnowledgeBase) => {
    setEditing(base);
    form.setFieldsValue({ name: base.name, description: base.description });
    setEditorOpen(true);
  };

  const saveBase = async () => {
    if (uncertainWrite || uploading) return;
    let values: { name: string; description: string; type?: 'document' | 'faq' };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setWriteNotice(null);
    try {
      const result = editing
        ? await portal.updateManagedKnowledgeBase(editing.id, values)
        : await portal.createManagedKnowledgeBase(values);
      if (editing) setDetail(result.data);
      setWriteNotice(`${editing ? t('saveDone') : t('created')} ${t('operation')}: ${result.operationId}`);
      setEditorOpen(false);
      await loadBases();
      if (!editing) setSelectedId(result.data.id);
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) markUncertainWrite();
      setWriteNotice(
        `${knowledgeErrorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const removeBase = async () => {
    if (!selected || uncertainWrite || uploading) return;
    setDeleting(true);
    setWriteNotice(null);
    try {
      const result = await portal.deleteManagedKnowledgeBase(selected.id);
      setWriteNotice(`${t('deleted')} ${t('operation')}: ${result.operationId}`);
      setSelectedId(null);
      setDocs(null);
      await loadBases();
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) markUncertainWrite();
      setWriteNotice(
        `${knowledgeErrorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
      );
    } finally {
      setDeleting(false);
    }
  };

  const uploadFile = async () => {
    const entry = files[0];
    const file = entry?.originFileObj ?? (entry instanceof File ? entry : undefined);
    if (!file || !selectedId || uncertainWrite) return;
    if (file.size > 63 * 1024 * 1024) {
      setWriteNotice(t('fileLimit'));
      return;
    }
    setUploading(true);
    setWriteNotice(null);
    try {
      // 目录树里选中某目录时，单文件也进那个目录（原型：「目标目录：X」）。
      const uploadPath = folderPath ? `${folderPath}/${file.name}` : file.name;
      const result = await portal.uploadManagedKnowledgeDocument(selectedId, file as File, uploadPath);
      setWriteNotice(`${t('uploadAccepted')} ${t('operation')}: ${result.operationId}`);
      setFiles([]);
      pollRounds.current = 0;
      setPollTick(0);
      setPage(1);
      setDocsRefresh((current) => current + 1);
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) markUncertainWrite();
      setWriteNotice(
        `${knowledgeErrorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
      );
    } finally {
      setUploading(false);
    }
  };

  const queueFolderFiles = (entries: readonly UploadFile[]) => {
    const targetBase = selectedId;
    if (!targetBase) return;
    const items = entries
      .map((entry, index): FolderUploadItem | null => {
        const file = entry.originFileObj;
        if (!file) return null;
        const relativePath = (file as File & { readonly webkitRelativePath?: string }).webkitRelativePath ?? '';
        return {
          key: entry.uid || `folder-${index}-${relativePath || file.name}`,
          baseId: targetBase,
          label: relativePath || file.name,
          relativePath,
          file,
          status: 'queued',
        };
      })
      .filter((item): item is FolderUploadItem => item !== null);
    if (items.length === 0) return;
    if (items.length > FOLDER_UPLOAD_MAX_FILES) {
      setWriteNotice(t('folderLimit'));
      return;
    }
    // Keep the single-file size rule for folder batches too: the portal caps the
    // whole multipart body, so an oversized member would only fail upstream.
    const oversized = items.filter((item) => item.file.size > FOLDER_UPLOAD_MAX_FILE_BYTES);
    const acceptedItems = items.filter((item) => item.file.size <= FOLDER_UPLOAD_MAX_FILE_BYTES);
    if (oversized.length > 0) setWriteNotice(`${t('fileLimit')} (${oversized.length} ${t('folderFiles')})`);
    if (acceptedItems.length === 0) return;
    setFolderQueue((current) => {
      // Re-picking a folder must not double-queue the same file.
      const seen = new Set(current.map((item) => `${item.relativePath}|${item.file.size}`));
      return [...current, ...acceptedItems.filter((item) => !seen.has(`${item.relativePath}|${item.file.size}`))];
    });
  };

  const runFolderUpload = async (items: readonly FolderUploadItem[]) => {
    const baseId = selectedId;
    // 只上传属于当前知识库的条目：队列里可能还留着别的库挑的文件（切库时也会被清空，这里是兜底）。
    const targets = baseId ? items.filter((item) => item.baseId === baseId) : [];
    if (!baseId || targets.length === 0 || folderUploading) return;
    setFolderUploading(true);
    setWriteNotice(null);
    let cursor = 0;
    let accepted = 0;
    let failed = 0;
    const worker = async () => {
      for (;;) {
        const item = targets[cursor];
        cursor += 1;
        if (!item) return;
        setFolderQueue((current) =>
          current.map((entry) => (entry.key === item.key ? { ...entry, status: 'uploading' } : entry)),
        );
        try {
          const result = await portal.uploadManagedKnowledgeDocument(baseId, item.file, item.relativePath);
          accepted += 1;
          setFolderQueue((current) =>
            current.map((entry) =>
              entry.key === item.key
                ? { ...entry, status: 'accepted', detail: `${t('operation')}: ${result.operationId}` }
                : entry,
            ),
          );
        } catch (cause) {
          failed += 1;
          if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
          if (isUncertain(cause)) markUncertainWrite();
          setFolderQueue((current) =>
            current.map((entry) =>
              entry.key === item.key ? { ...entry, status: 'failed', detail: knowledgeErrorText(cause) } : entry,
            ),
          );
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(FOLDER_UPLOAD_CONCURRENCY, targets.length) }, worker));
    setFolderUploading(false);
    setWriteNotice(
      `${t('folderAccepted')} ${accepted} · ${t('folderFailed')} ${failed} · ${targets.length} ${t('folderFiles')}`,
    );
    pollRounds.current = 0;
    setPollTick(0);
    setPage(1);
    setDocsRefresh((current) => current + 1);
  };

  const submitImport = async () => {
    if (!selectedId || !importKind || writeBlocked || importing || uploading) return;
    let values: { url?: string; title?: string; content?: string };
    try {
      values = await importForm.validateFields();
    } catch {
      return;
    }
    setImporting(true);
    setWriteNotice(null);
    try {
      const result =
        importKind === 'url'
          ? await portal.importManagedKnowledgeURL(selectedId, {
              url: values.url ?? '',
              ...(values.title ? { title: values.title } : {}),
            })
          : await portal.importManagedKnowledgeManual(selectedId, {
              title: values.title ?? '',
              content: values.content ?? '',
            });
      setWriteNotice(`${t('uploadAccepted')} ${t('operation')}: ${result.operationId}`);
      setImportKind(null);
      importForm.resetFields();
      setPage(1);
      setDocsRefresh((current) => current + 1);
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) markUncertainWrite();
      setWriteNotice(
        `${knowledgeErrorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
      );
    } finally {
      setImporting(false);
    }
  };

  const runDocumentAction = async (
    document: ManagedKnowledgeDocument,
    action: 'reparse' | 'cancel-parse' | 'delete',
  ) => {
    if (writeBlocked || uploading || importing || documentActionBusy(document.id)) return;
    beginDocumentAction(document.id);
    setWriteNotice(null);
    try {
      const result = await portal.runManagedKnowledgeDocumentAction(document.id, action);
      setWriteNotice(
        `${action === 'delete' ? t('knowledgeDeleteDocument') : action === 'reparse' ? t('knowledgeRetryParse') : t('knowledgeCancelParse')} · ${t('operation')}: ${result.operationId}`,
      );
      setDocsRefresh((current) => current + 1);
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) markUncertainWrite();
      setWriteNotice(
        `${knowledgeErrorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
      );
    } finally {
      endDocumentAction(document.id);
    }
  };

  const setDocumentEnabled = async (document: ManagedKnowledgeDocument, enabled: boolean) => {
    if (writeBlocked || uploading || importing || documentActionBusy(document.id)) return;
    beginDocumentAction(document.id);
    setWriteNotice(null);
    const requestContext = queryContext;
    try {
      const result = await portal.setManagedKnowledgeDocumentEnabled(document.id, enabled);
      if (queryContextRef.current === requestContext) {
        setDocs((current) =>
          current
            ? { ...current, data: current.data.map((item) => (item.id === document.id ? result.data : item)) }
            : current,
        );
      }
      setWriteNotice(
        `${enabled ? t('enableDocument') : t('disableDocument')} · ${t('operation')}: ${result.operationId}`,
      );
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) markUncertainWrite();
      setWriteNotice(
        `${knowledgeErrorText(cause)}${cause instanceof PortalError && cause.operationId ? ` · ${t('operation')}: ${cause.operationId}` : ''}`,
      );
    } finally {
      endDocumentAction(document.id);
    }
  };

  const previewChunkImage = async (documentId: string, chunkId: string, index: number) => {
    const key = `${documentId}:${chunkId}:${index}`;
    const existing = chunkImageURLsRef.current[key];
    if (existing) return;
    const controller = new AbortController();
    const generation = chunkRequestGeneration.current;
    chunkImageRequests.current.get(key)?.abort();
    chunkImageRequests.current.set(key, controller);
    setChunkImageLoading(key);
    try {
      const blob = await portal.getManagedKnowledgeChunkImage(documentId, chunkId, index, controller.signal);
      if (controller.signal.aborted || generation !== chunkRequestGeneration.current) return;
      const objectURL = URL.createObjectURL(blob);
      chunkImageURLsRef.current[key] = objectURL;
      setChunkImageURLs((current) => ({ ...current, [key]: objectURL }));
    } catch (cause) {
      if (controller.signal.aborted || generation !== chunkRequestGeneration.current) return;
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      setWriteNotice(knowledgeErrorText(cause));
    } finally {
      if (chunkImageRequests.current.get(key) === controller) chunkImageRequests.current.delete(key);
      if (!controller.signal.aborted && generation === chunkRequestGeneration.current) setChunkImageLoading(null);
    }
  };

  const inspectDocument = async (document: ManagedKnowledgeDocument, kind: 'chunks' | 'spans') => {
    chunkSaveGeneration.current += 1;
    chunkImageRequests.current.forEach((controller) => {
      controller.abort();
    });
    chunkImageRequests.current.clear();
    const generation = ++chunkRequestGeneration.current;
    beginDocumentAction(document.id);
    try {
      if (kind === 'chunks') {
        setChunksLoading(true);
        const result = await portal.listManagedKnowledgeChunks(document.id, { page: 1, pageSize: 50 });
        if (generation !== chunkRequestGeneration.current) return;
        setInspector({
          title: `${t('knowledgeChunks')} · ${document.name}`,
          kind: 'chunks',
          documentId: document.id,
          content: result.data,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        });
      } else {
        const result: ManagedKnowledgeSpans = await portal.getManagedKnowledgeSpans(document.id);
        if (generation !== chunkRequestGeneration.current) return;
        setInspector({ title: `${t('knowledgeSpans')} · ${document.name}`, kind: 'spans', content: result });
      }
    } catch (cause) {
      if (generation !== chunkRequestGeneration.current) return;
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      setWriteNotice(knowledgeErrorText(cause));
    } finally {
      // 行锁必须无条件释放：旧实现只在代次相同时解锁，切库/关弹窗（代次已被推进）时
      // 会把 documentActionId 永久留在这一行上，之后所有资料动作都被真值守卫静默吞掉。
      endDocumentAction(document.id);
      if (generation === chunkRequestGeneration.current) setChunksLoading(false);
    }
  };

  const changeChunkPage = async (page: number, pageSize: number) => {
    if (inspector?.kind !== 'chunks' || chunksLoading) return;
    const current = inspector;
    const generation = ++chunkRequestGeneration.current;
    setChunksLoading(true);
    try {
      const result = await portal.listManagedKnowledgeChunks(current.documentId, { page, pageSize });
      if (generation !== chunkRequestGeneration.current) return;
      setInspector({
        ...current,
        content: result.data,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      });
    } catch (cause) {
      if (generation !== chunkRequestGeneration.current) return;
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      setWriteNotice(knowledgeErrorText(cause));
    } finally {
      if (generation === chunkRequestGeneration.current) setChunksLoading(false);
    }
  };

  const saveChunk = async (
    chunk: ManagedKnowledgeChunk,
    update: { readonly content?: string; readonly is_enabled?: boolean },
  ) => {
    if (inspector?.kind !== 'chunks' || uncertainWrite || writeBlocked || chunkSavingId) return;
    const targetDocumentId = inspector.documentId;
    const saveGeneration = ++chunkSaveGeneration.current;
    setChunkSavingId(chunk.id);
    setWriteNotice(null);
    try {
      const result = await portal.updateManagedKnowledgeChunk(targetDocumentId, chunk.id, {
        ...update,
        ...(update.content !== undefined ? { expected_revision: chunk.content_revision } : {}),
      });
      if (saveGeneration !== chunkSaveGeneration.current) return;
      setInspector((current) =>
        current?.kind === 'chunks' &&
        current.documentId === targetDocumentId &&
        current.content.some((item) => item.id === chunk.id)
          ? {
              ...current,
              content: current.content.map((item) =>
                item.id === chunk.id
                  ? { ...item, ...result.data, ...(item.images ? { images: item.images } : {}) }
                  : item,
              ),
            }
          : current,
      );
      setWriteNotice(
        `${t('chunkSaved')} ${result.data.index_status === 'failed' ? t('chunkIndexFailed') : t('chunkIndexStatus')}: ${result.data.index_status} · ${t('operation')}: ${result.operationId}`,
      );
      setChunkEditor((current) => (current?.id === chunk.id ? null : current));
    } catch (cause) {
      if (saveGeneration !== chunkSaveGeneration.current) return;
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) markUncertainWrite();
      setWriteNotice(
        `${knowledgeErrorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}`,
      );
    } finally {
      if (saveGeneration === chunkSaveGeneration.current) setChunkSavingId(null);
    }
  };

  const rememberPreview = (key: string, entry: PreviewEntry) => {
    const cache = previewCache.current;
    // 同一资料的并发预览会用新条目覆盖旧条目；旧条目的 url 从此再无人引用，
    // 必须先回收，否则每次并发预览都泄漏一份文件大小的 object URL。
    const previous = cache.get(key);
    if (previous?.url && previous.url !== entry.url) URL.revokeObjectURL(previous.url);
    // Map 的插入顺序就是淘汰顺序：delete 后再 set 把这条挪到队尾。
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > PREVIEW_CACHE_LIMIT) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const dropped = cache.get(oldest);
      cache.delete(oldest);
      if (dropped?.url) URL.revokeObjectURL(dropped.url);
    }
  };

  const openDocumentFile = async (document: ManagedKnowledgeDocument, kind: 'preview' | 'download') => {
    const previewKind = previewKindOf(document.file_name);
    if (kind === 'preview' && !previewKind) {
      setWriteNotice(t('knowledgeNoOriginal'));
      return;
    }
    const name = document.file_name || document.name;
    if (kind === 'preview' && previewKind) {
      const cacheKey = `${document.id}:preview`;
      // 每次进入预览分支都推进 generation：命中缓存的这一次也是新的预览意图，
      // 否则先前在途的请求返回时会盖掉刚点开的缓存内容；关闭弹窗同样推进（见 onCancel）。
      const generation = ++previewGeneration.current;
      const cached = previewCache.current.get(cacheKey);
      if (cached) {
        // 命中即刷新 LRU：只 get 不挪位时，淘汰顺序是「最早插入」而不是注释声称的「最久未用」。
        previewCache.current.delete(cacheKey);
        previewCache.current.set(cacheKey, cached);
        setPreview(cached);
        return;
      }
      // 未命中：先按固定尺寸开弹窗占位，内容到位再填。
      setPreview({ kind: previewKind, url: '', name, loading: true });
      beginDocumentAction(document.id);
      try {
        const blob = await portal.getManagedKnowledgeFile(document.id, 'preview');
        // 文本直接读正文，不需要 object URL；图片/PDF 才建 blob: 链接。
        let entry: PreviewEntry;
        if (previewKind === 'text') {
          entry = { kind: 'text', url: '', name, text: await blob.text() };
        } else if (previewKind === 'pdf' && blob.type !== 'application/pdf') {
          // portal 对预览响应下发 `Content-Security-Policy: sandbox; default-src 'none'`，
          // 但控制台把响应重新包成 blob: 后该响应头不再生效。所以这里自己按 Blob.type 把关：
          // 服务端声称 PDF 却回了别的类型时绝不进 iframe，避免把非预期内容当文档渲染。
          entry = { kind: 'pdf', url: '', name, incompatible: true };
        } else {
          entry = { kind: previewKind, url: URL.createObjectURL(blob), name };
        }
        rememberPreview(cacheKey, entry);
        // 期间又点了别的预览就不要把旧结果盖回去。
        if (previewGeneration.current === generation) setPreview(entry);
      } catch (cause) {
        if (previewGeneration.current === generation) setPreview(null);
        if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
        setWriteNotice(knowledgeErrorText(cause));
      } finally {
        endDocumentAction(document.id);
      }
      return;
    }
    beginDocumentAction(document.id);
    try {
      const blob = await portal.getManagedKnowledgeFile(document.id, kind);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = name || document.id;
      anchor.hidden = true;
      window.document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Give the browser time to start consuming the object URL for download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      setWriteNotice(knowledgeErrorText(cause));
    } finally {
      endDocumentAction(document.id);
    }
  };

  const columns = [
    {
      // 资料主列：名称 + 次级信息（文件名、大小、来源）；上游 DTO 暂无 folder_path，
      // 所以路径不进副标题（补契约后再加）。
      title: t('docName'),
      key: 'name',
      render: (_: unknown, row: ManagedKnowledgeDocument) => {
        const secondary = [
          row.file_name,
          formatFileSize(row.file_size),
          row.source ? (sourceCopy[row.source] ? t(sourceCopy[row.source]!) : row.source) : (row.type ?? ''),
        ]
          .filter((part): part is string => Boolean(part))
          .join(' · ');
        const isPdf = (row.file_type ?? row.file_name ?? '').toLowerCase().includes('pdf');
        return (
          <Space orientation="vertical" size={0}>
            <Space size={6}>
              {isPdf ? (
                <FilePdfOutlined style={{ color: '#cf1322' }} />
              ) : (
                <FileTextOutlined style={{ color: '#1677ff' }} />
              )}
              <Typography.Link onClick={() => void inspectDocument(row, 'spans')}>
                {row.name || row.file_name}
              </Typography.Link>
            </Space>
            {secondary ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {secondary}
              </Typography.Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      // 按原型：状态只说「能不能被检索」，启停动作移入行操作菜单。
      title: t('parse'),
      key: 'parse_status',
      render: (_: unknown, row: ManagedKnowledgeDocument) => {
        const completed = row.parse_status === 'completed';
        const disabled = completed ? row.enable_status === 'disabled' : row.manual_disabled === true;
        if (disabled) {
          return <Tag title={row.enable_status}>{t('enableDisabled')}</Tag>;
        }
        if (completed) {
          return <Tag color="success">{t('statusSearchable')}</Tag>;
        }
        if (row.parse_status === 'failed') {
          return (
            <Space orientation="vertical" size={2}>
              <Tag color="error">{t('statusFailedShort')}</Tag>
              <Button
                type="link"
                size="small"
                style={{ padding: 0 }}
                onClick={() => void inspectDocument(row, 'spans')}
              >
                {t('viewReason')}
              </Button>
            </Space>
          );
        }
        return (
          <Space orientation="vertical" size={2}>
            <Tag color="processing">{t('processing')}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('parsingHint')}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: t('createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) => formatTimestamp(value),
    },
    {
      title: t('knowledgeActions'),
      key: 'actions',
      fixed: 'right' as const,
      render: (_: unknown, row: ManagedKnowledgeDocument) => {
        const actionBusy = documentActionBusy(row.id);
        const canCancel = ['pending', 'processing', 'finalizing'].includes(row.parse_status);
        const writesDisabled = writeBlocked || actionBusy || uploading || importing;
        const completed = row.parse_status === 'completed';
        const enabled = completed ? row.enable_status === 'enabled' : row.manual_disabled !== true;
        const moreItems: MenuProps['items'] = [
          { key: 'chunks', label: t('knowledgeChunks'), disabled: actionBusy },
          { key: 'spans', label: t('knowledgeSpans'), disabled: actionBusy },
          { key: 'download', label: t('knowledgeDownload'), disabled: !row.file_name || actionBusy },
          { type: 'divider' },
          { key: 'reparse', label: t('knowledgeRetryParse'), disabled: writesDisabled },
          ...(canCancel ? [{ key: 'cancel-parse', label: t('knowledgeCancelParse'), disabled: writesDisabled }] : []),
          {
            key: 'toggle',
            label: enabled ? t('disableDocument') : t('enableDocument'),
            disabled: writesDisabled || (!completed && (row.manual_disabled === undefined || enabled)),
          },
          { type: 'divider' },
          { key: 'delete', label: t('knowledgeDeleteDocument'), danger: true, disabled: writesDisabled },
        ];
        return (
          <Space size={4}>
            <Button type="link" size="small" disabled={actionBusy} onClick={() => void inspectDocument(row, 'spans')}>
              {t('viewDocument')}
            </Button>
            <Dropdown
              menu={{
                items: moreItems,
                onClick: ({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  if (key === 'download') return void openDocumentFile(row, 'download');
                  if (key === 'chunks') return void inspectDocument(row, 'chunks');
                  if (key === 'spans') return void inspectDocument(row, 'spans');
                  if (key === 'toggle') return void setDocumentEnabled(row, !enabled);
                  if (key === 'delete')
                    return modal.confirm({
                      title: t('knowledgeDeleteDocument'),
                      content: t('knowledgeDeleteDocumentHint'),
                      okText: t('knowledgeDeleteConfirm'),
                      cancelText: t('cancel'),
                      okButtonProps: { danger: true },
                      onOk: () => runDocumentAction(row, 'delete'),
                    });
                  return void runDocumentAction(row, key === 'cancel-parse' ? 'cancel-parse' : 'reparse');
                },
              }}
            >
              <Button type="text" size="small" aria-label={t('moreActions')} icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  // 查询条件变化就清掉不可见的选择项，避免把上一屏的选择带到新结果上。
  useEffect(() => {
    setPickedDocs([]);
    setBatchFailures([]);
  }, [folderPath, page, search, statusFilter]);

  // 批量重解析/删除如实保留逐项结果：失败项留在提示里并保留选择，可重试。
  const runBatchAction = async (action: 'reparse' | 'delete') => {
    const targets = (visibleDocs?.data ?? []).filter((document) => pickedDocs.includes(document.id));
    if (targets.length === 0) return;
    setBatchBusy(true);
    setBatchFailures([]);
    setWriteNotice(null);
    const failedIds: string[] = [];
    const failedNames: string[] = [];
    for (const document of targets) {
      try {
        await portal.runManagedKnowledgeDocumentAction(document.id, action);
      } catch (cause) {
        if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
        if (isUncertain(cause)) markUncertainWrite();
        failedIds.push(document.id);
        failedNames.push(document.name || document.file_name);
      }
    }
    setBatchFailures(failedNames);
    setPickedDocs(failedIds);
    setBatchBusy(false);
    setDocsRefresh((current) => current + 1);
  };

  // 移动是服务端一次性操作（不是逐项），所以只按服务端结果反馈。
  const runBatchMove = async () => {
    const target = selectedId;
    if (!target || pickedDocs.length === 0) return;
    setBatchBusy(true);
    setWriteNotice(null);
    try {
      const result = await portal.moveManagedKnowledgeDocuments(target, pickedDocs, moveTarget);
      setWriteNotice(`${t('batchMove')} · ${t('operation')}: ${result.operationId}`);
      setPickedDocs([]);
      setMoveDialog(false);
      setDocsRefresh((current) => current + 1);
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) markUncertainWrite();
      setWriteNotice(knowledgeErrorText(cause));
    } finally {
      setBatchBusy(false);
    }
  };

  const folderPathsForMove = useMemo(() => {
    const collect = (nodes: readonly ManagedKnowledgeFolder[]): string[] =>
      nodes.flatMap((node) => [node.path, ...collect(node.children ?? [])]);
    return collect(folderTree?.folders ?? []);
  }, [folderTree]);

  const modelState = readiness?.embeddingModel.state;
  const queuedFolderItems = folderQueue.filter((item) => item.status === 'queued');
  const failedFolderItems = folderQueue.filter((item) => item.status === 'failed');
  const acceptedFolderCount = folderQueue.filter((item) => item.status === 'accepted').length;
  const spanTree = (span: ManagedKnowledgeSpans['trace']): SpanTreeNode => ({
    key: span.span_id,
    title: (
      <Space size={6} wrap>
        <Typography.Text>{span.name || span.kind}</Typography.Text>
        <Tag color={span.status === 'failed' ? 'error' : span.status === 'completed' ? 'success' : 'processing'}>
          {span.status || 'unknown'}
        </Tag>
        {span.duration_ms !== undefined && <Typography.Text type="secondary">{span.duration_ms} ms</Typography.Text>}
        {span.error_code && <Typography.Text type="danger">{span.error_code}</Typography.Text>}
      </Space>
    ),
    ...(span.children?.length ? { children: span.children.map(spanTree) } : {}),
  });
  const baseColumns = [
    {
      title: t('name'),
      key: 'name',
      render: (_: unknown, row: ManagedKnowledgeBase) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{row.name}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {row.id}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('descriptionField'),
      dataIndex: 'description',
      key: 'description',
      render: (value: string | undefined) => value || t('notStatistic'),
    },
    // 文档数 / 解析状态 / 使用范围 / 更新时间：取 portal 下发的真实统计；
    // 任一项缺失（老服务、上游没报、刚创建）都按后台设计约定显示「暂未统计」。
    {
      title: t('columnDocs'),
      key: 'documents',
      render: (_: unknown, row: ManagedKnowledgeBase) => {
        // FAQ 库的知识条目落在 chunk 上，上游对 document 型才填 knowledge_count。
        const count = row.type === 'faq' ? row.chunk_count : row.knowledge_count;
        return typeof count === 'number' ? String(count) : t('notStatistic');
      },
    },
    {
      title: t('parse'),
      key: 'parse',
      render: (_: unknown, row: ManagedKnowledgeBase) =>
        typeof row.processing_count !== 'number'
          ? t('notStatistic')
          : row.processing_count > 0
            ? t('parseProcessing').replace('{count}', String(row.processing_count))
            : t('parseCompleted'),
    },
    {
      title: t('columnScope'),
      key: 'scope',
      render: (_: unknown, row: ManagedKnowledgeBase) =>
        row.scope
          ? t('scopeSummary').replace('{users}', String(row.scope.users)).replace('{teams}', String(row.scope.teams))
          : t('notStatistic'),
    },
    {
      title: t('columnUpdated'),
      key: 'updated',
      render: (_: unknown, row: ManagedKnowledgeBase) =>
        row.updated_at ? new Date(row.updated_at).toLocaleString() : t('notStatistic'),
    },
    {
      title: t('knowledgeActions'),
      key: 'actions',
      render: (_: unknown, row: ManagedKnowledgeBase) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => openBase(row.id)}>
          {t('manageDocuments')}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-4">
      {!selectedId ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Typography.Title level={4} style={{ marginBottom: 4 }}>
                {t('title')}
              </Typography.Title>
              <Typography.Text type="secondary">{t('description')}</Typography.Text>
            </div>
            <Space wrap>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadBases()}>
                {t('refresh')}
              </Button>
              <Button type="primary" icon={<PlusOutlined />} disabled={!canCreate || writeBlocked} onClick={openCreate}>
                {t('add')}
              </Button>
            </Space>
          </div>

          {readiness && (
            <Alert
              showIcon
              type={modelState === 'configured' ? 'info' : 'warning'}
              title={`${t('readiness')} · ${modelState === 'configured' ? t('modelReady') : modelState === 'unavailable' ? t('modelUnavailable') : t('modelMissing')}`}
              description={`${t('unverified')} (${readiness.storage}, ${readiness.parser})`}
            />
          )}
          {error && (
            <Alert
              type="error"
              showIcon
              title={error}
              action={
                <Button size="small" onClick={() => void loadBases()}>
                  {t('retry')}
                </Button>
              }
            />
          )}
          {writeNotice && (
            <Alert type="info" showIcon title={writeNotice} closable={{ onClose: () => setWriteNotice(null) }} />
          )}

          <Card size="small">
            <Table<ManagedKnowledgeBase>
              rowKey="id"
              size="small"
              loading={loading}
              columns={baseColumns}
              dataSource={bases}
              locale={{ emptyText: error ? t('error') : t('empty') }}
              pagination={false}
              scroll={{ x: 760 }}
            />
          </Card>
        </>
      ) : (
        <>
          <Card size="small" loading={loading && !selected}>
            {!selected ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? t('error') : t('noSelection')} />
            ) : (
              <div className="flex flex-col gap-4">
                {error && (
                  <Alert
                    type="error"
                    showIcon
                    title={error}
                    action={
                      <Button size="small" onClick={retryFailed}>
                        {t('retry')}
                      </Button>
                    }
                  />
                )}
                {writeNotice && (
                  <Alert type="info" showIcon title={writeNotice} closable={{ onClose: () => setWriteNotice(null) }} />
                )}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-white"
                      style={{ background: '#1677ff' }}
                    >
                      <BookOutlined />
                    </span>
                    <div className="min-w-0">
                      <Typography.Title level={3} style={{ margin: 0 }}>
                        {selected.name}
                      </Typography.Title>
                      {selected.description ? (
                        <Typography.Text type="secondary">{selected.description}</Typography.Text>
                      ) : null}
                      <div>
                        <Typography.Text code copyable={{ text: selected.id }} style={{ fontSize: 12 }}>
                          {selected.id}
                        </Typography.Text>
                      </div>
                    </div>
                  </div>
                  <Space wrap>
                    <Button
                      icon={<SettingOutlined />}
                      disabled={writeBlocked || uploading}
                      onClick={() => openEdit(selected)}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      loading={deleting}
                      disabled={writeBlocked || uploading}
                      onClick={() =>
                        modal.confirm({
                          title: t('deleteTitle'),
                          content: t('deleteHint'),
                          okText: t('deleteConfirm'),
                          cancelText: t('cancel'),
                          okButtonProps: { danger: true },
                          onOk: removeBase,
                        })
                      }
                    >
                      {t('remove')}
                    </Button>
                    <Dropdown trigger={['click']} menu={{ items: addMaterialItems, onClick: onAddMaterial }}>
                      <Button type="primary" icon={<PlusOutlined />} disabled={writeBlocked}>
                        {t('addMaterial')} <DownOutlined />
                      </Button>
                    </Dropdown>
                  </Space>
                </div>

                <section aria-label={t('summaryLabel')}>
                  <Space size={16} wrap>
                    {summaryItems.map((item) => (
                      <Tooltip key={item.key} title={item.hint}>
                        {item.onClick ? (
                          <Button type="link" size="small" style={{ padding: 0 }} onClick={item.onClick}>
                            {item.icon} {item.text}
                          </Button>
                        ) : (
                          <Typography.Text type="secondary">
                            {item.icon} {item.text}
                          </Typography.Text>
                        )}
                      </Tooltip>
                    ))}
                  </Space>
                </section>
                <Tabs
                  activeKey={detailTab}
                  onChange={setDetailTab}
                  items={[
                    {
                      key: 'documents',
                      label: t('tabDocuments'),
                      children: (
                        <>
                          <div className="flex flex-col gap-4 lg:flex-row">
                            <div className="w-full shrink-0 lg:w-56">
                              <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                                <Typography.Text strong>{t('foldersLabel')}</Typography.Text>
                                <Tree
                                  blockNode
                                  defaultExpandAll
                                  aria-label={t('foldersLabel')}
                                  selectedKeys={[folderPath ?? ALL_FOLDERS_KEY]}
                                  treeData={folderNodes}
                                  onSelect={(keys) => {
                                    const next = keys[0];
                                    if (typeof next !== 'string') return;
                                    setFolderPath(next === ALL_FOLDERS_KEY ? null : next);
                                    setPage(1);
                                  }}
                                />
                              </Space>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-3">
                              <div className="flex flex-wrap items-end justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Typography.Text strong>
                                    {folderPath === null
                                      ? t('allMaterials')
                                      : (folderPath.split('/').pop() ?? folderPath)}
                                  </Typography.Text>
                                  <Typography.Text type="secondary">
                                    {t('documentCount').replace('{count}', String(visibleDocs?.total ?? 0))}
                                  </Typography.Text>
                                </div>
                                <Space wrap>
                                  <Input
                                    allowClear
                                    value={keyword}
                                    placeholder={t('search')}
                                    aria-label={t('search')}
                                    onChange={(event) => setKeyword(event.target.value)}
                                    onPressEnter={() => {
                                      setPage(1);
                                      setSearch(keyword.trim());
                                    }}
                                    onClear={() => {
                                      setKeyword('');
                                      setSearch('');
                                      setPage(1);
                                    }}
                                    style={{ width: 200 }}
                                  />
                                  <Button
                                    icon={<SearchOutlined />}
                                    aria-label={t('search')}
                                    onClick={() => {
                                      setPage(1);
                                      setSearch(keyword.trim());
                                    }}
                                  />
                                  <Select
                                    aria-label={t('parse')}
                                    value={statusFilter}
                                    options={statusOptions}
                                    style={{ width: 130 }}
                                    onChange={(next: string) => {
                                      setStatusFilter(next);
                                      setPage(1);
                                    }}
                                  />
                                  <Button
                                    icon={<ReloadOutlined />}
                                    aria-label={t('refresh')}
                                    loading={docsLoading}
                                    onClick={() => void loadDocuments()}
                                  />
                                </Space>
                              </div>
                              {folderQueue.length > 0 && (
                                <div className="flex flex-col gap-2 rounded-md border border-dashed border-neutral-400 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Typography.Text type="secondary">
                                      {`${t('folderHint')} ${t('folderAccepted')} ${acceptedFolderCount} / ${folderQueue.length}`}
                                    </Typography.Text>
                                    <Space size="small">
                                      <Button
                                        size="small"
                                        disabled={folderUploading || failedFolderItems.length === 0}
                                        onClick={() => void runFolderUpload(failedFolderItems)}
                                      >
                                        {t('folderRetryFailed')}
                                      </Button>
                                      <Button
                                        size="small"
                                        disabled={folderUploading}
                                        onClick={() => setFolderQueue([])}
                                      >
                                        {t('folderClear')}
                                      </Button>
                                    </Space>
                                  </div>
                                  <div className="max-h-48 overflow-auto">
                                    {folderQueue.map((item) => (
                                      <div
                                        key={item.key}
                                        className="flex items-center justify-between gap-2 py-0.5 text-xs"
                                      >
                                        <span className="truncate" title={item.relativePath || item.file.name}>
                                          {item.label}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                          {item.detail ? (
                                            <Typography.Text type="secondary">{item.detail}</Typography.Text>
                                          ) : null}
                                          <Tag
                                            color={
                                              item.status === 'accepted'
                                                ? 'green'
                                                : item.status === 'failed'
                                                  ? 'red'
                                                  : item.status === 'uploading'
                                                    ? 'blue'
                                                    : 'default'
                                            }
                                          >
                                            {item.status === 'accepted'
                                              ? t('folderAccepted')
                                              : item.status === 'failed'
                                                ? t('folderFailed')
                                                : item.status === 'uploading'
                                                  ? t('folderUploading')
                                                  : t('folderQueued')}
                                          </Tag>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {docHintVisible && (
                                <Alert
                                  showIcon
                                  closable
                                  type="info"
                                  title={t('knowledgeDocumentEnableHint')}
                                  description={t('knowledgeFileOnlyPreview')}
                                  onClose={() => {
                                    localStorage.setItem(DOC_HINT_DISMISSED_KEY, '1');
                                    setDocHintVisible(false);
                                  }}
                                />
                              )}
                              {pickedDocs.length > 0 && (
                                <section aria-label={t('batchBar')}>
                                  <Space wrap>
                                    <Typography.Text>
                                      {t('batchPicked').replace('{count}', String(pickedDocs.length))}
                                    </Typography.Text>
                                    <Button
                                      size="small"
                                      icon={<FolderOpenOutlined />}
                                      disabled={batchBusy || writeBlocked}
                                      onClick={() => {
                                        setMoveTarget(folderPath ?? '');
                                        setMoveDialog(true);
                                      }}
                                    >
                                      {t('batchMove')}
                                    </Button>
                                    <Button
                                      size="small"
                                      icon={<ReloadOutlined />}
                                      disabled={batchBusy || writeBlocked}
                                      onClick={() => void runBatchAction('reparse')}
                                    >
                                      {t('batchRetry')}
                                    </Button>
                                    <Button
                                      size="small"
                                      danger
                                      disabled={batchBusy || writeBlocked}
                                      onClick={() =>
                                        modal.confirm({
                                          title: t('batchDelete'),
                                          content: t('knowledgeDeleteDocumentHint'),
                                          okText: t('knowledgeDeleteConfirm'),
                                          cancelText: t('cancel'),
                                          okButtonProps: { danger: true },
                                          onOk: () => runBatchAction('delete'),
                                        })
                                      }
                                    >
                                      {t('batchDelete')}
                                    </Button>
                                  </Space>
                                </section>
                              )}
                              {batchFailures.length > 0 && (
                                <Alert
                                  showIcon
                                  type="warning"
                                  closable
                                  title={t('batchFailed')}
                                  description={batchFailures.join('、')}
                                  onClose={() => setBatchFailures([])}
                                />
                              )}
                              <Table<ManagedKnowledgeDocument>
                                rowKey="id"
                                size="small"
                                loading={docsLoading}
                                rowSelection={{
                                  selectedRowKeys: [...pickedDocs],
                                  onChange: (keys) => setPickedDocs(keys.map((key) => String(key))),
                                }}
                                columns={columns}
                                dataSource={visibleDocs?.data ?? []}
                                locale={{ emptyText: docsError ? t('error') : t('emptyDocs') }}
                                pagination={{
                                  current: visibleDocs?.page ?? page,
                                  pageSize: visibleDocs?.pageSize ?? 10,
                                  total: visibleDocs?.total ?? 0,
                                  showSizeChanger: false,
                                  onChange: (next) => setPage(next),
                                  showTotal: (total) => `共 ${total} 篇资料`,
                                  hideOnSinglePage: true,
                                }}
                                scroll={{ x: 800 }}
                              />
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <Typography.Text type="secondary">
                                  {pickedDocs.length > 0
                                    ? t('batchPicked').replace('{count}', String(pickedDocs.length))
                                    : `共 ${visibleDocs?.total ?? 0} 篇资料`}
                                </Typography.Text>
                                <Typography.Text type="secondary">{t('indexHint')}</Typography.Text>
                              </div>
                              {selected.type === 'faq' ? (
                                <KnowledgeOperations
                                  key={`operations:${selected.id}`}
                                  portal={portal}
                                  baseId={selected.id}
                                  baseType={selected.type}
                                  documentIds={visibleDocs?.data.map((document) => document.id) ?? []}
                                  disabled={writeBlocked || uploading}
                                />
                              ) : null}
                            </div>
                          </div>
                        </>
                      ),
                    },
                    {
                      key: 'retrieval',
                      label: t('tabRetrieval'),
                      children: (
                        <KnowledgeRetrieval key={`retrieval:${selected.id}`} portal={portal} baseId={selected.id} />
                      ),
                    },
                    {
                      key: 'access',
                      label: t('tabAccess'),
                      children: (
                        <KnowledgeGrants
                          key={`grants:${selected.id}`}
                          portal={portal}
                          baseId={selected.id}
                          disabled={writeBlocked || uploading}
                        />
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </Card>
        </>
      )}

      {modalContext}
      <Modal
        title={editing ? t('editTitle') : t('createTitle')}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={() => void saveBase()}
        confirmLoading={saving}
        okText={t('save')}
        cancelText={t('cancel')}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          {!editing && (
            <Form.Item name="type" label={t('knowledgeBaseType')} initialValue="document" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'document', label: t('knowledgeDocumentBase') },
                  { value: 'faq', label: t('knowledgeFAQBase') },
                ]}
              />
            </Form.Item>
          )}
          <Form.Item
            name="name"
            label={t('name')}
            rules={[
              { required: true, whitespace: true, message: t('nameRequired') },
              byteLimitRule(t('name'), NAME_MAX_BYTES),
            ]}
          >
            <Input maxLength={NAME_MAX_BYTES} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('descriptionField')}
            rules={[byteLimitRule(t('descriptionField'), DESCRIPTION_MAX_BYTES)]}
          >
            <Input.TextArea rows={3} maxLength={DESCRIPTION_MAX_BYTES} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('batchMoveTitle')}
        open={moveDialog}
        onCancel={() => setMoveDialog(false)}
        okText={t('batchMove')}
        cancelText={t('cancel')}
        confirmLoading={batchBusy}
        okButtonProps={{ disabled: writeBlocked || batchBusy || pickedDocs.length === 0 }}
        onOk={() => void runBatchMove()}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {t('batchPicked').replace('{count}', String(pickedDocs.length))}
          </Typography.Text>
          <Select
            aria-label={t('batchMoveTarget')}
            value={moveTarget}
            onChange={setMoveTarget}
            style={{ width: '100%' }}
            options={[
              { value: '', label: t('uncategorized') },
              ...folderPathsForMove.map((path) => ({ value: path, label: path })),
            ]}
          />
        </Space>
      </Modal>
      {/* 「添加资料」的文件/文件夹入口：选择后才提交，进度与失败重试仍走下面的队列面板 */}
      <Modal
        title={materialModal === 'folder' ? t('importFolder') : t('uploadFile')}
        open={materialModal !== null}
        onCancel={() => setMaterialModal(null)}
        okText={materialModal === 'folder' ? t('uploadFolder') : t('upload')}
        cancelText={t('cancel')}
        confirmLoading={materialModal === 'folder' ? folderUploading : uploading}
        okButtonProps={{
          disabled: writeBlocked || (materialModal === 'folder' ? queuedFolderItems.length === 0 : files.length === 0),
        }}
        onOk={() => {
          const closeOnSuccess = () => setMaterialModal(null);
          const keepOnFailure = () => undefined;
          if (materialModal === 'folder') void runFolderUpload(queuedFolderItems).then(closeOnSuccess, keepOnFailure);
          else void uploadFile().then(closeOnSuccess, keepOnFailure);
        }}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {t('uploadTargetFolder').replace('{path}', folderPath ?? t('uncategorized'))}
          </Typography.Text>
          {materialModal === 'folder' ? (
            <>
              <Upload
                directory
                multiple
                showUploadList={false}
                fileList={[]}
                disabled={folderUploading || writeBlocked}
                beforeUpload={() => false}
                onChange={(info) => queueFolderFiles(info.fileList)}
              >
                <Button icon={<FolderOpenOutlined />} disabled={folderUploading}>
                  {t('chooseFolder')}
                </Button>
              </Upload>
              <Typography.Text type="secondary">{t('folderHint')}</Typography.Text>
            </>
          ) : (
            <Upload
              accept=".txt,.pdf"
              maxCount={1}
              fileList={files}
              disabled={uploading || writeBlocked}
              beforeUpload={() => false}
              onChange={(info) => setFiles(info.fileList.slice(-1))}
              onRemove={() => {
                setFiles([]);
                return true;
              }}
            >
              <Button icon={<UploadOutlined />} disabled={uploading}>
                {t('chooseFile')}
              </Button>
            </Upload>
          )}
        </Space>
      </Modal>
      <Modal
        title={importKind === 'url' ? t('knowledgeImportUrl') : t('knowledgeImportManual')}
        open={importKind !== null}
        onCancel={() => {
          if (!importing) setImportKind(null);
        }}
        onOk={() => void submitImport()}
        confirmLoading={importing}
        okText={t('knowledgeImport')}
        cancelText={t('cancel')}
        destroyOnHidden
      >
        <Form form={importForm} layout="vertical" preserve={false}>
          {importKind === 'url' ? (
            <>
              <Form.Item name="url" label={t('knowledgeUrl')} rules={[{ required: true }, sourceURLRule]}>
                <Input type="url" maxLength={URL_MAX_BYTES} />
              </Form.Item>
              <Form.Item
                name="title"
                label={t('knowledgeTitle')}
                rules={[byteLimitRule(t('knowledgeTitle'), TITLE_MAX_BYTES)]}
              >
                <Input maxLength={TITLE_MAX_BYTES} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="title"
                label={t('knowledgeTitle')}
                rules={[{ required: true, whitespace: true }, byteLimitRule(t('knowledgeTitle'), TITLE_MAX_BYTES)]}
              >
                <Input maxLength={TITLE_MAX_BYTES} />
              </Form.Item>
              <Form.Item
                name="content"
                label={t('knowledgeContent')}
                rules={[{ required: true, whitespace: true }, byteLimitRule(t('knowledgeContent'), CONTENT_MAX_BYTES)]}
              >
                <Input.TextArea rows={10} maxLength={CONTENT_MAX_BYTES} showCount />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
      <Modal
        title={inspector?.title}
        open={inspector !== null}
        footer={null}
        onCancel={() => {
          chunkRequestGeneration.current += 1;
          chunkSaveGeneration.current += 1;
          chunkImageRequests.current.forEach((controller) => {
            controller.abort();
          });
          chunkImageRequests.current.clear();
          setChunksLoading(false);
          setInspector(null);
        }}
        width={900}
        destroyOnHidden
      >
        {inspector?.kind === 'chunks' && (
          <Spin spinning={chunksLoading}>
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text type="secondary">
                {t('chunkCount')}: {inspector.total}
              </Typography.Text>
              {inspector.content.length > 0 ? (
                <Listy
                  items={[...inspector.content]}
                  rowKey="id"
                  itemRender={(chunk) => (
                    <div>
                      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                        <Space wrap>
                          <Typography.Text strong>#{chunk.seq_id}</Typography.Text>
                          <Tag>{chunk.chunk_type || t('chunkText')}</Tag>
                          <Tag color={chunk.is_enabled ? 'success' : 'default'}>
                            {chunk.is_enabled ? t('chunkEnabled') : t('chunkDisabled')}
                          </Tag>
                          <Button
                            size="small"
                            disabled={writeBlocked || uncertainWrite || chunkSavingId !== null}
                            onClick={() => {
                              setChunkEditor(chunk);
                              setChunkEditorText(chunk.content);
                            }}
                          >
                            {t('chunkEdit')}
                          </Button>
                          <Switch
                            size="small"
                            checked={chunk.is_enabled}
                            loading={chunkSavingId === chunk.id}
                            disabled={writeBlocked || uncertainWrite || chunkSavingId !== null}
                            aria-label={chunk.is_enabled ? t('chunkDisabled') : t('chunkEnabled')}
                            onChange={(checked) => void saveChunk(chunk, { is_enabled: checked })}
                          />
                        </Space>
                        <Typography.Paragraph
                          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 0 }}
                        >
                          {chunk.content}
                        </Typography.Paragraph>
                        {chunk.index_status === 'failed' && (
                          <Alert type="warning" showIcon title={t('chunkIndexFailed')} />
                        )}
                        {chunk.images?.map((image) => {
                          const imageKey = `${inspector.documentId}:${chunk.id}:${image.index}`;
                          const imageURL = chunkImageURLs[imageKey];
                          return (
                            <Space key={image.index} orientation="vertical" size={4}>
                              {imageURL ? (
                                <Image src={imageURL} alt={`${t('imagePreview')} ${image.index + 1}`} width={120} />
                              ) : (
                                <Button
                                  size="small"
                                  loading={chunkImageLoading === imageKey}
                                  onClick={() => void previewChunkImage(inspector.documentId, chunk.id, image.index)}
                                >
                                  {t('imagePreview')} {image.index + 1}
                                </Button>
                              )}
                            </Space>
                          );
                        })}
                      </Space>
                    </div>
                  )}
                />
              ) : (
                <Empty description={t('chunkEmpty')} />
              )}
              {inspector.total > inspector.pageSize && (
                <Pagination
                  current={inspector.page}
                  pageSize={inspector.pageSize}
                  total={inspector.total}
                  pageSizeOptions={[20, 50, 100]}
                  showSizeChanger
                  showTotal={(total) => `${t('chunkCount')}: ${total}`}
                  disabled={chunksLoading}
                  onChange={(nextPage, nextPageSize) => void changeChunkPage(nextPage, nextPageSize)}
                />
              )}
            </Space>
          </Spin>
        )}
        {inspector?.kind === 'spans' && (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label={t('parse')}>{inspector.content.parse_status || '—'}</Descriptions.Item>
              <Descriptions.Item label={t('currentStage')}>{inspector.content.current_stage || '—'}</Descriptions.Item>
              <Descriptions.Item label={t('attempt')}>
                {inspector.content.attempt} / {inspector.content.latest_attempt}
              </Descriptions.Item>
            </Descriptions>
            <Tree style={{ width: '100%' }} treeData={[spanTree(inspector.content.trace)]} defaultExpandAll />
          </Space>
        )}
      </Modal>
      <Modal
        title={t('chunkEdit')}
        open={chunkEditor !== null}
        onCancel={() => setChunkEditor(null)}
        onOk={() => chunkEditor && void saveChunk(chunkEditor, { content: chunkEditorText })}
        confirmLoading={chunkSavingId === chunkEditor?.id}
        okButtonProps={{
          disabled: writeBlocked || uncertainWrite || !chunkEditorText.trim() || chunkEditorOverLimit,
        }}
        okText={t('save')}
        cancelText={t('cancel')}
        destroyOnHidden
      >
        <Typography.Text type="secondary">
          {t('chunkRevision')}: {chunkEditor?.content_revision}
        </Typography.Text>
        {chunkEditorOverLimit && (
          <Alert
            type="warning"
            showIcon
            title={byteLimitMessage(t('chunkContent'), CONTENT_MAX_BYTES, byteLength(chunkEditorText))}
          />
        )}
        <Input.TextArea
          value={chunkEditorText}
          onChange={(event) => setChunkEditorText(event.target.value)}
          rows={10}
          maxLength={CONTENT_MAX_BYTES}
          showCount
        />
      </Modal>
      <Modal
        title={preview?.name ?? t('knowledgePreview')}
        open={preview !== null}
        footer={null}
        onCancel={() => {
          // 关闭也要推进 generation：在途预览返回时不能再把弹窗重新弹开。
          previewGeneration.current += 1;
          setPreview(null);
        }}
        width={960}
        destroyOnHidden
      >
        {preview &&
          (preview.loading ? (
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                height: '70vh',
                justifyContent: 'center',
              }}
            >
              <Spin />
            </div>
          ) : (
            // 固定高度：不随文件长短跳动；内容超出在框内滚动/缩放。
            <div style={{ height: '70vh', overflow: 'auto' }}>
              {preview.kind === 'text' ? (
                <pre className="whitespace-pre-wrap break-words" style={{ fontSize: 13, margin: 0 }}>
                  {preview.text}
                </pre>
              ) : preview.kind === 'image' ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  style={{ display: 'block', margin: '0 auto', maxHeight: '100%', maxWidth: '100%' }}
                />
              ) : preview.incompatible ? (
                <Alert
                  type="warning"
                  showIcon
                  title={t('knowledgePreviewUnavailable')}
                  description={`${t('fileName')}: ${preview.name}`}
                />
              ) : (
                <iframe
                  title={preview.name}
                  src={preview.url}
                  style={{ border: 0, display: 'block', height: '100%', width: '100%' }}
                />
              )}
            </div>
          ))}
      </Modal>
    </div>
  );
}
