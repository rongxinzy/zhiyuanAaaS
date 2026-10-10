import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Image,
  Input,
  Listy,
  Modal,
  Pagination,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ADMIN_LANGUAGE, type AdminLanguage, type AdminTranslationKey, translate } from './i18n.js';
import {
  type ManagedKnowledgeBase,
  type ManagedKnowledgeChunk,
  type ManagedKnowledgeDocument,
  type ManagedKnowledgePage,
  type ManagedKnowledgeReadiness,
  type ManagedKnowledgeSpans,
  type PortalClient,
  PortalError,
} from './portal.js';

const language: AdminLanguage = ADMIN_LANGUAGE;
type SpanTreeNode = { readonly key: string; readonly title: ReactNode; readonly children?: SpanTreeNode[] };
const copyKeys = {
  title: 'knowledgeManagementTitle',
  description: 'knowledgeManagementDescription',
  bases: 'knowledgeBasesManaged',
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
  protected: 'knowledgeProtected',
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
  knowledgeToggleUnavailable: 'knowledgeToggleUnavailable',
  knowledgeFileOnlyPreview: 'knowledgeFileOnlyPreview',
  knowledgeSource: 'knowledgeSource',
  knowledgeEnableState: 'knowledgeEnableState',
  enableDocument: 'knowledgeEnableDocument',
  disableDocument: 'knowledgeDisableDocument',
  keepDisabledAfterParse: 'knowledgeKeepDisabledAfterParse',
  imagePreview: 'knowledgeImagePreview',
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
  notConfigured: 'knowledgeNotConfiguredManaged',
  forbidden: 'knowledgeForbiddenManaged',
  configError: 'knowledgeConfigErrorManaged',
  loginExpired: 'knowledgeLoginExpired',
} as const satisfies Record<string, AdminTranslationKey>;
type CopyKey = keyof typeof copyKeys;
const t = (key: CopyKey) => translate(language, copyKeys[key]);
const pollable = new Set(['pending', 'processing', 'finalizing', 'deleting']);
const parseStatusCopy: Readonly<Record<string, CopyKey>> = {
  pending: 'pending',
  processing: 'processing',
  finalizing: 'finalizing',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  deleting: 'deleting',
};

function errorText(error: unknown): string {
  if (error instanceof PortalError) {
    if (error.status === 401) return t('loginExpired');
    if (error.status === 403) return t('forbidden');
    if (error.code === 'KNOWLEDGE_NOT_CONFIGURED' || error.code === 'KNOWLEDGE_CREDENTIAL_UNAVAILABLE')
      return t('configError');
    if (error.code === 'KNOWLEDGE_BASE_IN_USE') return t('protected');
  }
  return error instanceof Error ? error.message : String(error);
}

function isUncertain(error: unknown): boolean {
  return !(error instanceof PortalError) || error.status >= 500;
}

export function KnowledgeManagement({ portal }: { readonly portal: PortalClient }) {
  const [readiness, setReadiness] = useState<ManagedKnowledgeReadiness | null>(null);
  const [bases, setBases] = useState<readonly ManagedKnowledgeBase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [docs, setDocs] = useState<ManagedKnowledgePage | null>(null);
  const [docsContext, setDocsContext] = useState('');
  const [detail, setDetail] = useState<ManagedKnowledgeBase | null>(null);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<UploadFile[]>([]);
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
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);
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
  const [chunkImageURLs, setChunkImageURLs] = useState<Record<string, string>>({});
  const [chunkImageLoading, setChunkImageLoading] = useState<string | null>(null);
  const chunkImageURLsRef = useRef<Record<string, string>>({});
  const chunkImageRequests = useRef(new Map<string, AbortController>());
  const [preview, setPreview] = useState<{ readonly url: string; readonly name: string } | null>(null);
  const [form] = Form.useForm<{ name: string; description: string }>();
  const [importForm] = Form.useForm<{ url: string; title: string; content: string }>();
  const [modal, modalContext] = Modal.useModal();
  const listGeneration = useRef(0);
  const docGeneration = useRef(0);
  const pollRounds = useRef(0);
  const chunkRequestGeneration = useRef(0);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
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
  const selected = useMemo(
    () => (detail?.id === selectedId ? detail : (bases.find((item) => item.id === selectedId) ?? null)),
    [bases, detail, selectedId],
  );
  const queryContext = `${selectedId ?? ''}:${page}:${search}`;
  const queryContextRef = useRef(queryContext);
  queryContextRef.current = queryContext;
  const visibleDocs = docsContext === queryContext ? docs : null;
  const error = baseError ?? detailError ?? docsError;
  const canCreate = readiness?.embeddingModel.state === 'configured';
  const writeBlocked = accessBlocked || !!baseError || !!detailError || uncertainWrite;

  const loadBases = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++listGeneration.current;
      setLoading(true);
      setBaseError(null);
      try {
        const [ready, items] = await Promise.all([
          portal.managedKnowledgeReadiness(signal),
          portal.listManagedKnowledgeBases(signal),
        ]);
        if (generation !== listGeneration.current || signal?.aborted) return;
        setReadiness(ready);
        setBases(items);
        setAccessBlocked(false);
        setSelectedId((current) =>
          current && items.some((item) => item.id === current) ? current : (items[0]?.id ?? null),
        );
      } catch (cause) {
        if (signal?.aborted || generation !== listGeneration.current) return;
        if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
        setBaseError(errorText(cause));
      } finally {
        if (generation === listGeneration.current && !signal?.aborted) setLoading(false);
      }
    },
    [portal],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadBases(controller.signal);
    return () => {
      controller.abort();
      listGeneration.current += 1;
    };
  }, [loadBases]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return undefined;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailError(null);
    void portal
      .getManagedKnowledgeBase(selectedId, controller.signal)
      .then((base) => {
        if (!controller.signal.aborted) setDetail(base);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
          setDetailError(errorText(cause));
        }
      });
    return () => controller.abort();
  }, [portal, selectedId]);

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
          { page, pageSize: 10, ...(search ? { keyword: search } : {}) },
          signal,
        );
        if (generation !== docGeneration.current || signal?.aborted) return;
        setDocs(result);
        setDocsContext(`${selectedId}:${page}:${search}`);
        if (result.data.some((item) => pollable.has(item.parse_status))) {
          pollRounds.current += 1;
          setPollTick(pollRounds.current);
        }
      } catch (cause) {
        if (signal?.aborted || generation !== docGeneration.current) return;
        if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
        setDocsError(errorText(cause));
      } finally {
        if (generation === docGeneration.current && !signal?.aborted) setDocsLoading(false);
      }
    },
    [docsRefresh, page, portal, search, selectedId],
  );

  const [pollTick, setPollTick] = useState(0);

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
    let values: { name: string; description: string };
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
      if (isUncertain(cause)) setUncertainWrite(true);
      setWriteNotice(
        `${errorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
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
      if (isUncertain(cause)) setUncertainWrite(true);
      setWriteNotice(
        `${errorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
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
      const result = await portal.uploadManagedKnowledgeDocument(selectedId, file as File);
      setWriteNotice(`${t('uploadAccepted')} ${t('operation')}: ${result.operationId}`);
      setFiles([]);
      pollRounds.current = 0;
      setPollTick(0);
      setPage(1);
      setDocsRefresh((current) => current + 1);
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) setUncertainWrite(true);
      setWriteNotice(
        `${errorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
      );
    } finally {
      setUploading(false);
    }
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
      if (isUncertain(cause)) setUncertainWrite(true);
      setWriteNotice(
        `${errorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
      );
    } finally {
      setImporting(false);
    }
  };

  const runDocumentAction = async (
    document: ManagedKnowledgeDocument,
    action: 'reparse' | 'cancel-parse' | 'delete',
  ) => {
    if (writeBlocked || uploading || importing || documentActionId) return;
    setDocumentActionId(document.id);
    setWriteNotice(null);
    try {
      const result = await portal.runManagedKnowledgeDocumentAction(document.id, action);
      setWriteNotice(
        `${action === 'delete' ? t('knowledgeDeleteDocument') : action === 'reparse' ? t('knowledgeRetryParse') : t('knowledgeCancelParse')} · ${t('operation')}: ${result.operationId}`,
      );
      setDocsRefresh((current) => current + 1);
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      if (isUncertain(cause)) setUncertainWrite(true);
      setWriteNotice(
        `${errorText(cause)}${isUncertain(cause) ? ` ${t('uncertain')}` : ''}${cause instanceof PortalError && cause.operationId ? ` ${t('operation')}: ${cause.operationId}` : ''}${cause instanceof PortalError && cause.resourceId ? ` ${t('id')}: ${cause.resourceId}` : ''}`,
      );
    } finally {
      setDocumentActionId(null);
    }
  };

  const setDocumentEnabled = async (document: ManagedKnowledgeDocument, enabled: boolean) => {
    if (writeBlocked || uploading || importing || documentActionId) return;
    setDocumentActionId(document.id);
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
      if (isUncertain(cause)) setUncertainWrite(true);
      setWriteNotice(
        `${errorText(cause)}${cause instanceof PortalError && cause.operationId ? ` · ${t('operation')}: ${cause.operationId}` : ''}`,
      );
    } finally {
      setDocumentActionId(null);
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
      setWriteNotice(errorText(cause));
    } finally {
      if (chunkImageRequests.current.get(key) === controller) chunkImageRequests.current.delete(key);
      if (!controller.signal.aborted && generation === chunkRequestGeneration.current) setChunkImageLoading(null);
    }
  };

  const inspectDocument = async (document: ManagedKnowledgeDocument, kind: 'chunks' | 'spans') => {
    chunkImageRequests.current.forEach((controller) => {
      controller.abort();
    });
    chunkImageRequests.current.clear();
    const generation = ++chunkRequestGeneration.current;
    setDocumentActionId(document.id);
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
      setWriteNotice(errorText(cause));
    } finally {
      if (generation === chunkRequestGeneration.current) {
        setChunksLoading(false);
        setDocumentActionId(null);
      }
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
      setWriteNotice(errorText(cause));
    } finally {
      if (generation === chunkRequestGeneration.current) setChunksLoading(false);
    }
  };

  const openDocumentFile = async (document: ManagedKnowledgeDocument, kind: 'preview' | 'download') => {
    if (kind === 'preview' && !/\.(pdf|png|jpe?g|gif|webp|txt|md|csv)$/i.test(document.file_name)) {
      setWriteNotice(t('knowledgeNoOriginal'));
      return;
    }
    setDocumentActionId(document.id);
    try {
      const blob = await portal.getManagedKnowledgeFile(document.id, kind);
      const url = URL.createObjectURL(blob);
      if (kind === 'preview') {
        setPreview({ url, name: document.file_name || document.name });
      } else {
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download = document.file_name || document.name || document.id;
        anchor.hidden = true;
        window.document.body.append(anchor);
        anchor.click();
        anchor.remove();
        // Give the browser time to start consuming the object URL for download.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setAccessBlocked(true);
      setWriteNotice(errorText(cause));
    } finally {
      setDocumentActionId(null);
    }
  };

  const columns = [
    {
      title: t('docName'),
      dataIndex: 'name',
      key: 'name',
      render: (value: string, row: ManagedKnowledgeDocument) => value || row.file_name,
    },
    { title: t('fileName'), dataIndex: 'file_name', key: 'file_name' },
    {
      title: t('parse'),
      dataIndex: 'parse_status',
      key: 'parse_status',
      render: (value: string) => (
        <Space size={4} wrap>
          <Tag color={value === 'completed' ? 'success' : value === 'failed' ? 'error' : 'default'}>
            {parseStatusCopy[value] ? t(parseStatusCopy[value]!) : t('unknown')} · {value}
          </Tag>
        </Space>
      ),
    },
    {
      title: t('knowledgeSource'),
      dataIndex: 'source',
      key: 'source',
      ellipsis: true,
      render: (value: string, row: ManagedKnowledgeDocument) => value || row.type || '—',
    },
    {
      title: t('knowledgeEnableState'),
      dataIndex: 'enable_status',
      key: 'enable_status',
      render: (value: string | undefined, row: ManagedKnowledgeDocument) => {
        const completed = row.parse_status === 'completed';
        const enabled = completed ? value === 'enabled' : row.manual_disabled === true;
        const actionBusy = documentActionId === row.id;
        const label = completed ? (enabled ? t('disableDocument') : t('enableDocument')) : t('keepDisabledAfterParse');
        return (
          <Space>
            <Tag>{value || '—'}</Tag>
            <Switch
              checked={enabled}
              aria-label={label}
              loading={actionBusy}
              disabled={
                writeBlocked ||
                uploading ||
                importing ||
                !!documentActionId ||
                (!completed && (row.manual_disabled === undefined || enabled))
              }
              onChange={(next) => void setDocumentEnabled(row, completed ? next : false)}
            />
          </Space>
        );
      },
    },
    {
      title: t('createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) => (value ? new Date(value).toLocaleString() : '—'),
    },
    {
      title: t('knowledgeActions'),
      key: 'actions',
      fixed: 'right' as const,
      render: (_: unknown, row: ManagedKnowledgeDocument) => {
        const actionBusy = documentActionId === row.id;
        const canCancel = ['pending', 'processing', 'finalizing'].includes(row.parse_status);
        return (
          <Space size={4} wrap>
            <Button
              size="small"
              icon={<EyeOutlined />}
              disabled={!row.file_name || actionBusy}
              onClick={() => void openDocumentFile(row, 'preview')}
            >
              {t('knowledgePreview')}
            </Button>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              disabled={!row.file_name || actionBusy}
              onClick={() => void openDocumentFile(row, 'download')}
            >
              {t('knowledgeDownload')}
            </Button>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              disabled={actionBusy}
              onClick={() => void inspectDocument(row, 'chunks')}
            >
              {t('knowledgeChunks')}
            </Button>
            <Button size="small" disabled={actionBusy} onClick={() => void inspectDocument(row, 'spans')}>
              {t('knowledgeSpans')}
            </Button>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              disabled={writeBlocked || actionBusy || uploading || importing}
              onClick={() => void runDocumentAction(row, 'reparse')}
            >
              {t('knowledgeRetryParse')}
            </Button>
            {canCancel && (
              <Button
                size="small"
                icon={<StopOutlined />}
                disabled={writeBlocked || actionBusy || uploading || importing}
                onClick={() => void runDocumentAction(row, 'cancel-parse')}
              >
                {t('knowledgeCancelParse')}
              </Button>
            )}
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={writeBlocked || actionBusy || uploading || importing}
              onClick={() =>
                modal.confirm({
                  title: t('knowledgeDeleteDocument'),
                  content: t('knowledgeDeleteDocumentHint'),
                  okText: t('knowledgeDeleteConfirm'),
                  cancelText: t('cancel'),
                  okButtonProps: { danger: true },
                  onOk: () => runDocumentAction(row, 'delete'),
                })
              }
            >
              {t('knowledgeDeleteDocument')}
            </Button>
          </Space>
        );
      },
    },
  ];

  const modelState = readiness?.embeddingModel.state;
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
  return (
    <div className="flex w-full flex-col gap-4">
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
          <Button
            icon={<LinkOutlined />}
            disabled={!selectedId || writeBlocked || importing || uploading}
            onClick={() => {
              importForm.resetFields();
              setImportKind('url');
            }}
          >
            {t('knowledgeImportUrl')}
          </Button>
          <Button
            icon={<FileTextOutlined />}
            disabled={!selectedId || writeBlocked || importing || uploading}
            onClick={() => {
              importForm.resetFields();
              setImportKind('manual');
            }}
          >
            {t('knowledgeImportManual')}
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(250px,0.32fr)_minmax(0,1fr)]">
        <Card
          size="small"
          title={t('bases')}
          extra={<Typography.Text type="secondary">{bases.length}</Typography.Text>}
        >
          {bases.length === 0 && !loading && !error ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space orientation="vertical" size={2}>
                  <span>{t('empty')}</span>
                  <Typography.Text type="secondary">{t('emptyHint')}</Typography.Text>
                </Space>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {bases.map((base) => (
                <button
                  key={base.id}
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    setSelectedId(base.id);
                    setPage(1);
                    setFiles([]);
                  }}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${base.id === selectedId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                >
                  <span className="block font-medium">{base.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{base.id}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card size="small" loading={loading && !selected}>
          {!selected ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? t('error') : t('noSelection')} />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {selected.name}
                  </Typography.Title>
                  <Typography.Text type="secondary">{selected.id}</Typography.Text>
                  {selected.description && (
                    <Typography.Paragraph style={{ margin: '8px 0 0' }}>{selected.description}</Typography.Paragraph>
                  )}
                </div>
                <Space wrap>
                  <Button
                    icon={<EditOutlined />}
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
                </Space>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
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
                  <Button
                    icon={<LinkOutlined />}
                    disabled={writeBlocked || importing || uploading}
                    onClick={() => {
                      importForm.resetFields();
                      setImportKind('url');
                    }}
                  >
                    {t('knowledgeImportUrl')}
                  </Button>
                  <Button
                    icon={<FileTextOutlined />}
                    disabled={writeBlocked || importing || uploading}
                    onClick={() => {
                      importForm.resetFields();
                      setImportKind('manual');
                    }}
                  >
                    {t('knowledgeImportManual')}
                  </Button>
                  <Button
                    type="primary"
                    disabled={!files.length || uploading || writeBlocked}
                    loading={uploading}
                    onClick={() => void uploadFile()}
                  >
                    {t('upload')}
                  </Button>
                </div>
                <Space.Compact>
                  <Input
                    allowClear
                    value={keyword}
                    placeholder={t('search')}
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
                  />
                  <Button
                    icon={<SearchOutlined />}
                    onClick={() => {
                      setPage(1);
                      setSearch(keyword.trim());
                    }}
                  />
                  <Button
                    icon={<ReloadOutlined />}
                    aria-label={t('refresh')}
                    loading={docsLoading}
                    onClick={() => void loadDocuments()}
                  />
                </Space.Compact>
              </div>
              <Alert
                showIcon
                type="info"
                title={t('knowledgeToggleUnavailable')}
                description={t('knowledgeFileOnlyPreview')}
              />
              <Table<ManagedKnowledgeDocument>
                rowKey="id"
                size="small"
                loading={docsLoading}
                columns={columns}
                dataSource={visibleDocs?.data ?? []}
                locale={{ emptyText: docsError ? t('error') : t('emptyDocs') }}
                pagination={{
                  current: visibleDocs?.page ?? page,
                  pageSize: visibleDocs?.pageSize ?? 10,
                  total: visibleDocs?.total ?? 0,
                  showSizeChanger: false,
                  onChange: (next) => setPage(next),
                  showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
                }}
                scroll={{ x: 560 }}
              />
            </div>
          )}
        </Card>
      </div>

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
          <Form.Item
            name="name"
            label={t('name')}
            rules={[{ required: true, whitespace: true, message: t('nameRequired') }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label={t('descriptionField')}>
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
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
              <Form.Item name="url" label={t('knowledgeUrl')} rules={[{ required: true, type: 'url', max: 2048 }]}>
                <Input type="url" maxLength={2048} />
              </Form.Item>
              <Form.Item name="title" label={t('knowledgeTitle')} rules={[{ max: 200 }]}>
                <Input maxLength={200} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="title"
                label={t('knowledgeTitle')}
                rules={[{ required: true, whitespace: true, max: 200 }]}
              >
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item
                name="content"
                label={t('knowledgeContent')}
                rules={[{ required: true, whitespace: true, max: 1_000_000 }]}
              >
                <Input.TextArea rows={10} maxLength={1_000_000} showCount />
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
                        </Space>
                        <Typography.Paragraph
                          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 0 }}
                        >
                          {chunk.content}
                        </Typography.Paragraph>
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
        title={preview?.name ?? t('knowledgePreview')}
        open={preview !== null}
        footer={null}
        onCancel={() => setPreview(null)}
        width={960}
        destroyOnHidden
      >
        {preview && (
          <iframe
            title={preview.name}
            src={preview.url}
            sandbox=""
            style={{ display: 'block', width: '100%', height: '70vh', border: 0 }}
          />
        )}
      </Modal>
    </div>
  );
}
