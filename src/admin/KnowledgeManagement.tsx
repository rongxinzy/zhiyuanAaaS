import {
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
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
  theme,
  Upload,
} from 'antd';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeDocumentInspector } from './KnowledgeDocumentInspector.js';
import { KnowledgeGrants } from './KnowledgeGrants.js';
import { KnowledgeOperations } from './KnowledgeOperations.js';
import { knowledgeBaseColumns } from './knowledge-base-columns.js';
import { useKnowledgeDetailRetrieval } from './knowledge-detail-retrieval.js';
import { knowledgeErrorText } from './knowledge-error.js';
import {
  ALL_FOLDERS_KEY,
  byteLength,
  byteLimitRule,
  CONTENT_MAX_BYTES,
  type CopyKey,
  DESCRIPTION_MAX_BYTES,
  DOC_HINT_DISMISSED_KEY,
  FOLDER_UPLOAD_CONCURRENCY,
  FOLDER_UPLOAD_MAX_FILE_BYTES,
  FOLDER_UPLOAD_MAX_FILES,
  type FolderUploadItem,
  formatFileSize,
  formatTimestamp,
  isUncertain,
  type KnowledgeInspectorState,
  NAME_MAX_BYTES,
  PREVIEW_CACHE_LIMIT,
  type PreviewEntry,
  type PreviewState,
  pollable,
  previewKindOf,
  sourceCopy,
  sourceURLRule,
  TITLE_MAX_BYTES,
  t,
  URL_MAX_BYTES,
} from './knowledge-management-support.js';
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
  const { token } = theme.useToken();
  const [readiness, setReadiness] = useState<ManagedKnowledgeReadiness | null>(null);
  const [bases, setBases] = useState<readonly ManagedKnowledgeBase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(baseId);
  const retrieval = useKnowledgeDetailRetrieval(portal, selectedId);
  const [docHintVisible, setDocHintVisible] = useState(() => localStorage.getItem(DOC_HINT_DISMISSED_KEY) !== '1');
  const [docs, setDocs] = useState<ManagedKnowledgePage | null>(null);
  const [docsContext, setDocsContext] = useState('');
  const [detail, setDetail] = useState<ManagedKnowledgeBase | null>(null);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [folderTree, setFolderTree] = useState<ManagedKnowledgeFolderTree | null>(null);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  // null = 全部资料（不带 folder_path 过滤）；上游把「folder_path 存在但为空」当作根目录，
  // 所以「全部」必须是不传该参数，而不是传空串。
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [materialModal, setMaterialModal] = useState<'file' | 'folder' | null>(null);
  const [pickedDocs, setPickedDocs] = useState<readonly string[]>([]);
  const [moveDialog, setMoveDialog] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchFailures, setBatchFailures] = useState<readonly string[]>([]);
  // 详情摘要：失败数用上游按 parse_status 过滤后的真实 total；关联 Agent 数按员工绑定统计；
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
  const [fileOutcomeUncertain, setFileOutcomeUncertain] = useState(false);
  const [importKind, setImportKind] = useState<'url' | 'manual' | null>(null);
  const [importing, setImporting] = useState(false);
  // 进行中的资料级动作按「行」记账（预览/下载/分块/重解析/启停）。单个全局 id 会在切库、
  // 或另一行并发操作时把别的行永久锁死（旧实现里那些守卫只判 `documentActionId` 真值）。
  const [documentActions, setDocumentActions] = useState<readonly string[]>([]);
  const [inspector, setInspector] = useState<KnowledgeInspectorState>(null);
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
    retrieval.setDetailTab('documents');
    setPage(1);
    setFiles([]);
    setFolderQueue([]);
    setFolderManagerOpen(false);
    setMaterialModal(null);
    setFolderPath(null);
    setFolderTree(null);
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
      // readiness 用于新建权限和模型信息；读取失败不影响知识库列表和详情。
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
    setFiles([]);
    setFileOutcomeUncertain(false);
    setFolderManagerOpen(false);
    setMaterialModal(null);
    setFolderPath(null);
    setFolderTree(null);
    setPage(1);
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
        retrieval.setDetailTab('documents');
      },
    },
    {
      key: 'failed',
      icon: <ExclamationCircleOutlined />,
      text: summaryText(t('summaryFailed'), summaryFailed),
      onClick: () => {
        setStatusFilter('failed');
        setPage(1);
        retrieval.setDetailTab('documents');
      },
    },
    { key: 'agents', icon: <RobotOutlined />, text: summaryText(t('summaryAgents'), summaryAgents) },
    {
      key: 'grants',
      icon: <TeamOutlined />,
      text: summaryText(t('summaryGrants'), detail?.scope ? detail.scope.users + detail.scope.teams : null),
      onClick: () => retrieval.setDetailTab('access'),
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
    if (!file || !selectedId || writeBlocked || uploading || fileOutcomeUncertain) return false;
    if (file.size > 63 * 1024 * 1024) {
      setWriteNotice(t('fileLimit'));
      return false;
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
      return true;
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) markUncertainWrite();
      setWriteNotice(
        `${knowledgeErrorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
      );
      if (isUncertain(cause)) setFileOutcomeUncertain(true);
      return false;
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
    if (!baseId || targets.length === 0 || folderUploading || writeBlocked) return false;
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
              entry.key === item.key
                ? {
                    ...entry,
                    status: isUncertain(cause) ? 'uncertain' : 'failed',
                    detail: `${knowledgeErrorText(cause)}${cause instanceof PortalError && cause.operationId ? ` · ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` · ${t('id')}: ${cause.resourceId}` : ''}`,
                  }
                : entry,
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
    return failed === 0;
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
        setInspector({
          title: `${t('knowledgeSpans')} · ${document.name}`,
          kind: 'spans',
          documentId: document.id,
          content: result,
        });
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
                <FilePdfOutlined style={{ color: token.colorError }} />
              ) : (
                <FileTextOutlined style={{ color: token.colorPrimary }} />
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
        return (
          <Space orientation="vertical" size={2}>
            <Tag color={completed ? 'success' : row.parse_status === 'failed' ? 'error' : 'processing'}>
              {pollable.has(row.parse_status) || ['completed', 'failed', 'cancelled'].includes(row.parse_status)
                ? t(row.parse_status as CopyKey)
                : t('unknown')}
            </Tag>
            <Space size={4}>
              <Typography.Text type="secondary">
                {disabled
                  ? t('enableDisabled')
                  : row.enable_status === 'enabled'
                    ? t('enableEnabled')
                    : t('notStatistic')}
              </Typography.Text>
              <Switch
                checked={completed ? row.enable_status === 'enabled' : row.manual_disabled === true}
                aria-label={
                  completed
                    ? row.enable_status === 'enabled'
                      ? t('disableDocument')
                      : t('enableDocument')
                    : t('keepDisabledAfterParse')
                }
                loading={documentActionBusy(row.id)}
                disabled={
                  writeBlocked ||
                  uploading ||
                  importing ||
                  documentActionBusy(row.id) ||
                  (!completed && (row.manual_disabled === undefined || row.manual_disabled))
                }
                onChange={(next) => void setDocumentEnabled(row, completed ? next : false)}
              />
            </Space>
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
            <Button
              type="link"
              size="small"
              aria-label={t('knowledgePreview')}
              disabled={actionBusy}
              onClick={() => void openDocumentFile(row, 'preview')}
            >
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
        if (!isUncertain(cause)) failedIds.push(document.id);
        failedNames.push(
          `${document.name || document.file_name}: ${knowledgeErrorText(cause)}${cause instanceof PortalError && cause.operationId ? ` · ${t('operation')}: ${cause.operationId}` : ''}`,
        );
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
      setWriteNotice(
        `${knowledgeErrorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}`,
      );
    } finally {
      setBatchBusy(false);
    }
  };

  const folderPathsForMove = useMemo(() => {
    const collect = (nodes: readonly ManagedKnowledgeFolder[]): string[] =>
      nodes.flatMap((node) => [node.path, ...collect(node.children ?? [])]);
    return collect(folderTree?.folders ?? []);
  }, [folderTree]);

  const queuedFolderItems = folderQueue.filter((item) => item.status === 'queued');
  const failedFolderItems = folderQueue.filter((item) => item.status === 'failed');
  const acceptedFolderCount = folderQueue.filter((item) => item.status === 'accepted').length;
  const baseColumns = knowledgeBaseColumns(openBase);

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
          {writeNotice && materialModal === null && (
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
                {writeNotice && materialModal === null && (
                  <Alert type="info" showIcon title={writeNotice} closable={{ onClose: () => setWriteNotice(null) }} />
                )}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
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
                      <Space wrap>
                        <Tag>{selected.type === 'faq' ? t('baseTypeFaq') : t('baseTypeDocument')}</Tag>
                        <Typography.Text type="secondary">
                          {readiness?.embeddingModel.name || readiness?.embeddingModel.id || t('notStatistic')}
                        </Typography.Text>
                      </Space>
                    </div>
                  </div>
                  <Space wrap>
                    {onNavigate && (
                      <Button onClick={() => onNavigate(`audit/knowledge/${encodeURIComponent(selected.id)}`)}>
                        {translate(ADMIN_LANGUAGE, 'knowledgeViewAudit')}
                      </Button>
                    )}
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
                  activeKey={retrieval.detailTab}
                  onChange={retrieval.setDetailTab}
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
                                {selected.type !== 'faq' && (
                                  <Button size="small" onClick={() => setFolderManagerOpen(true)}>
                                    {translate(ADMIN_LANGUAGE, 'knowledgeManageFolders')}
                                  </Button>
                                )}
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
                              {folderQueue.length > 0 && materialModal === null && (
                                <div
                                  className="flex flex-col gap-2 rounded-md border border-dashed p-3"
                                  style={{ borderColor: token.colorBorder }}
                                >
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
                                                : item.status === 'uncertain'
                                                  ? 'warning'
                                                  : item.status === 'failed'
                                                    ? 'red'
                                                    : item.status === 'uploading'
                                                      ? 'blue'
                                                      : 'default'
                                            }
                                          >
                                            {item.status === 'accepted'
                                              ? t('folderAccepted')
                                              : item.status === 'uncertain'
                                                ? translate(ADMIN_LANGUAGE, 'knowledgeOutcomeUncertain')
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
                                        setWriteNotice(null);
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
                                  showTotal: (total) =>
                                    translate(ADMIN_LANGUAGE, 'knowledgeMaterialCount').replace(
                                      '{count}',
                                      String(total),
                                    ),
                                  hideOnSinglePage: true,
                                }}
                                scroll={{ x: 800 }}
                              />
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <Typography.Text type="secondary">
                                  {pickedDocs.length > 0
                                    ? t('batchPicked').replace('{count}', String(pickedDocs.length))
                                    : translate(ADMIN_LANGUAGE, 'knowledgeMaterialCount').replace(
                                        '{count}',
                                        String(visibleDocs?.total ?? 0),
                                      )}
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
                                  onFoldersChanged={() => {
                                    setFolderPath(null);
                                    setPage(1);
                                    setDocsRefresh((current) => current + 1);
                                  }}
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
                      children: retrieval.panel,
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
                          onOpenRetrieval={retrieval.openAgentCheck}
                          onManageAgents={onNavigate ? () => onNavigate('employees') : undefined}
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
          {writeNotice && <Alert type="info" showIcon title={writeNotice} />}
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
        onCancel={() => {
          if (!uploading && !folderUploading) setMaterialModal(null);
        }}
        cancelButtonProps={{ disabled: uploading || folderUploading }}
        closable={!uploading && !folderUploading}
        keyboard={!uploading && !folderUploading}
        mask={{ closable: !uploading && !folderUploading }}
        okText={materialModal === 'folder' ? t('uploadFolder') : t('upload')}
        cancelText={t('cancel')}
        confirmLoading={materialModal === 'folder' ? folderUploading : uploading}
        okButtonProps={{
          disabled:
            writeBlocked ||
            (materialModal === 'folder' ? queuedFolderItems.length === 0 : files.length === 0 || fileOutcomeUncertain),
        }}
        onOk={() => {
          const closeOnSuccess = (succeeded: boolean) => {
            if (succeeded) setMaterialModal(null);
          };
          if (materialModal === 'folder') void runFolderUpload(queuedFolderItems).then(closeOnSuccess);
          else void uploadFile().then(closeOnSuccess);
        }}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {t('uploadTargetFolder').replace('{path}', folderPath ?? t('uncategorized'))}
          </Typography.Text>
          {writeNotice && <Alert type="info" showIcon title={writeNotice} />}
          {materialModal === 'folder' && folderQueue.length > 0 && (
            <>
              {folderQueue.map((item) => (
                <div key={item.key}>
                  <Typography.Text>{item.label}</Typography.Text>{' '}
                  <Tag>
                    {item.status === 'uncertain'
                      ? translate(ADMIN_LANGUAGE, 'knowledgeOutcomeUncertain')
                      : item.status === 'accepted'
                        ? t('folderAccepted')
                        : item.status === 'failed'
                          ? t('folderFailed')
                          : item.status === 'uploading'
                            ? t('folderUploading')
                            : t('folderQueued')}
                  </Tag>
                  {item.detail && <Typography.Text type="secondary">{item.detail}</Typography.Text>}
                </div>
              ))}
              <Button
                disabled={writeBlocked || folderUploading || failedFolderItems.length === 0}
                onClick={() => {
                  void runFolderUpload(failedFolderItems).then((succeeded) => {
                    if (succeeded) setMaterialModal(null);
                  });
                }}
              >
                {t('folderRetryFailed')}
              </Button>
            </>
          )}
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
              onChange={(info) => {
                setFiles(info.fileList.slice(-1));
                setFileOutcomeUncertain(false);
              }}
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
        title={translate(ADMIN_LANGUAGE, 'knowledgeManageFolders')}
        open={folderManagerOpen}
        onCancel={() => setFolderManagerOpen(false)}
        footer={null}
        width={800}
        destroyOnHidden
      >
        {selected && folderManagerOpen && (
          <KnowledgeOperations
            key={selected.id}
            portal={portal}
            baseId={selected.id}
            baseType={selected.type}
            documentIds={visibleDocs?.data.map((document) => document.id) ?? []}
            disabled={writeBlocked || uploading}
            onFoldersChanged={() => {
              setFolderPath(null);
              setPage(1);
              setDocsRefresh((current) => current + 1);
            }}
          />
        )}
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
      <KnowledgeDocumentInspector
        inspector={inspector}
        chunksLoading={chunksLoading}
        chunkSavingId={chunkSavingId}
        chunkEditor={chunkEditor}
        chunkEditorText={chunkEditorText}
        chunkEditorOverLimit={chunkEditorOverLimit}
        chunkImageURLs={chunkImageURLs}
        chunkImageLoading={chunkImageLoading}
        preview={preview}
        writeBlocked={writeBlocked}
        uncertainWrite={uncertainWrite}
        saveChunk={saveChunk}
        previewChunkImage={previewChunkImage}
        changeChunkPage={changeChunkPage}
        onCloseInspector={() => {
          chunkRequestGeneration.current += 1;
          chunkSaveGeneration.current += 1;
          chunkImageRequests.current.forEach((controller) => {
            controller.abort();
          });
          chunkImageRequests.current.clear();
          setChunksLoading(false);
          setInspector(null);
        }}
        onInspectorTabChange={(key) => {
          const row = visibleDocs?.data.find((item) => item.id === inspector?.documentId);
          if (!row || !inspector || key === inspector.kind) return;
          void inspectDocument(row, key === 'chunks' ? 'chunks' : 'spans');
        }}
        onEditChunk={(chunk) => {
          setChunkEditor(chunk);
          setChunkEditorText(chunk.content);
        }}
        onCloseEditor={() => setChunkEditor(null)}
        onEditText={setChunkEditorText}
        onClosePreview={() => {
          // 关闭也要推进 generation：在途预览返回时不能再把弹窗重新弹开。
          previewGeneration.current += 1;
          setPreview(null);
        }}
      />
    </div>
  );
}
