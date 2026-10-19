/**
 * 日志审计术语表：五个页签共用一份映射，只在这里维护。
 *
 * 原始英文只允许出现在三处：发给后端的检索参数（action / result / 事件码 / 资源类型）、
 * 抽屉「技术详情」里的原始码与原始 ID、以及本表未登记的码 —— 未登记一律原样返回，
 * 既不拼半个中文，也不写「未知类型」。
 */
import { ADMIN_LANGUAGE, type AdminLanguage } from './i18n.js';

type Terms = Readonly<Record<string, string>>;
type Bilingual = Readonly<Record<AdminLanguage, Terms>>;

/** 结果：业务遥测、管理审计、知识审计统一口径。 */
const results: Bilingual = {
  zh: {
    success: '成功',
    failure: '失败',
    denied: '已拒绝',
    info: '信息',
    pending: '待处理',
    accepted: '已受理',
    succeeded: '已完成',
    uncertain: '结果未知',
    unverified: '未核实',
    conflict: '冲突',
  },
  en: {
    success: 'Success',
    failure: 'Failure',
    denied: 'Denied',
    info: 'Info',
    pending: 'Pending',
    accepted: 'Accepted',
    succeeded: 'Succeeded',
    uncertain: 'Uncertain',
    unverified: 'Unverified',
    conflict: 'Conflict',
  },
};

/** 资源类型：对象列按「中文类型 / 对象 ID」呈现。 */
const resourceTypes: Bilingual = {
  zh: {
    model: '模型',
    skill: '技能',
    plugin: '插件',
    user: '用户',
    role: '角色',
    team: '团队',
    credential: '凭据',
    license: '授权',
    gateway_limit: '网关规则',
    identity_source: '身份源',
    data_scope_rule: '数据范围规则',
    control_event: '控管事件',
    session: '会话',
    agent: '数字员工',
    document: '文档',
    faq: '问答',
    knowledge_base: '知识库',
    'knowledge-base': '知识库',
    chunk: '分块',
    document_batch: '文档（批量）',
    faq_entry: '问答条目',
    faq_batch: '问答（批量）',
    knowledge_tag: '知识标签',
    knowledge_folder: '知识文件夹',
    knowledge_scope: '知识范围',
    user_rbac: '用户权限',
    model_assignment: '模型分配',
    skill_assignment: '技能分配',
    credential_assignment: '凭据分配',
    data_plane: '数据面',
    deployment_settings: '部署设置',
    compute_assignment: '算力分配',
    compute_tier: '算力档位',
    gateway: '模型网关',
    gateway_quota: '网关配额',
    gateway_model: '网关模型',
  },
  en: {
    model: 'Model',
    skill: 'Skill',
    plugin: 'Plugin',
    user: 'User',
    role: 'Role',
    team: 'Team',
    credential: 'Credential',
    license: 'License',
    gateway_limit: 'Gateway rule',
    identity_source: 'Identity source',
    data_scope_rule: 'Data scope rule',
    control_event: 'Control event',
    session: 'Session',
    agent: 'Digital employee',
    document: 'Document',
    faq: 'FAQ',
    knowledge_base: 'Knowledge base',
    'knowledge-base': 'Knowledge base',
    chunk: 'Chunk',
    document_batch: 'Document batch',
    faq_entry: 'FAQ entry',
    faq_batch: 'FAQ batch',
    knowledge_tag: 'Knowledge tag',
    knowledge_folder: 'Knowledge folder',
    knowledge_scope: 'Knowledge scope',
    user_rbac: 'User RBAC',
    model_assignment: 'Model assignment',
    skill_assignment: 'Skill assignment',
    credential_assignment: 'Credential assignment',
    data_plane: 'Data plane',
    deployment_settings: 'Deployment settings',
    compute_assignment: 'Compute assignment',
    compute_tier: 'Compute tier',
    gateway: 'Model gateway',
    gateway_quota: 'Gateway quota',
    gateway_model: 'Gateway model',
  },
};

/**
 * 动作：整段动作码 +「资源.动作」里的动作尾段。
 *
 * 两种形态都查这张表：整段蛇形码（知识审计的 `upload_file`、`create_tag`…）直接命中；
 * 点分隔的事件码（`skill.updated`、`model.catalog.changed`）先按第一个 `.` 拆成
 * 「资源 + 动作」再拼中文。查不到就交给调用方原样显示英文码。
 */
const actions: Bilingual = {
  zh: {
    create: '创建',
    created: '创建',
    update: '更新',
    updated: '更新',
    delete: '删除',
    deleted: '删除',
    rotate: '轮换',
    rotated: '轮换',
    reset_password: '重置密码',
    'password.reset': '密码重置',
    publish: '发布',
    published: '发布',
    import: '导入',
    imported: '导入',
    revoke: '吊销',
    revoked: '吊销',
    cancel: '取消',
    cancelled: '取消',
    test: '试连',
    refresh: '刷新',
    refreshed: '刷新',
    reparse: '重新解析',
    'cancel-parse': '取消解析',
    changed: '变更',
    'catalog.changed': '目录变更',
    'manifest.changed': '清单变更',
    'assignments.changed': '分配变更',
    succeeded: '成功',
    failed: '失败',
    throttled: '受限',
    // 知识审计（portal `beginManagedAudit`）写入的是整段蛇形动作，没有点分隔。
    upload_file: '上传文件',
    create_url: '导入链接',
    create_manual: '手写录入',
    cancel_parse: '取消解析',
    delete_document: '删除文档',
    set_enabled: '启用/停用',
    read_preview: '预览文档',
    read_download: '下载文档',
    read_chunks: '读取分块',
    read_spans: '读取解析片段',
    read_chunk_image: '读取分块图片',
    update_chunk: '更新分块',
    replace_grants: '更新授权',
    list_grants: '查看授权',
    create_tag: '创建标签',
    update_tag: '更新标签',
    delete_tag: '删除标签',
    list_tags: '查看标签',
    list_folders: '查看文件夹',
    move_documents: '移动文档',
    rename_folder: '重命名文件夹',
    update_document_tags: '更新文档标签',
    list_faq: '查看问答',
    create_faq: '创建问答',
    update_faq: '更新问答',
    update_faq_fields: '更新问答字段',
    update_faq_tags: '更新问答标签',
    delete_faq_entries: '删除问答',
    employee_search: '员工检索',
    employee_read_source: '员工读取原文',
    runtime_search: '运行时检索',
    runtime_list_bases: '运行时列出知识库',
    runtime_read_base: '运行时读取知识库',
    runtime_list_documents: '运行时列出文档',
    runtime_read_document: '运行时读取文档',
    runtime_read_chunks: '运行时读取分块',
    runtime_wiki_search: '运行时检索 Wiki',
    runtime_wiki_read_page: '运行时读取 Wiki 页面',
    runtime_wiki_index: '运行时读取 Wiki 目录',
    runtime_read: '运行时读取',
  },
  en: {
    create: 'created',
    created: 'created',
    update: 'updated',
    updated: 'updated',
    delete: 'deleted',
    deleted: 'deleted',
    rotate: 'rotated',
    rotated: 'rotated',
    reset_password: 'password reset',
    'password.reset': 'password reset',
    publish: 'published',
    published: 'published',
    import: 'imported',
    imported: 'imported',
    revoke: 'revoked',
    revoked: 'revoked',
    cancel: 'cancelled',
    cancelled: 'cancelled',
    test: 'connection test',
    refresh: 'refreshed',
    refreshed: 'refreshed',
    reparse: 'reparse',
    'cancel-parse': 'cancel parse',
    changed: 'changed',
    'catalog.changed': 'catalog changed',
    'manifest.changed': 'manifest changed',
    'assignments.changed': 'assignments changed',
    succeeded: 'succeeded',
    failed: 'failed',
    throttled: 'throttled',
    upload_file: 'upload file',
    create_url: 'import URL',
    create_manual: 'manual entry',
    cancel_parse: 'cancel parse',
    delete_document: 'delete document',
    set_enabled: 'enable or disable',
    read_preview: 'preview document',
    read_download: 'download document',
    read_chunks: 'read chunks',
    read_spans: 'read spans',
    read_chunk_image: 'read chunk image',
    update_chunk: 'update chunk',
    replace_grants: 'replace grants',
    list_grants: 'list grants',
    create_tag: 'create tag',
    update_tag: 'update tag',
    delete_tag: 'delete tag',
    list_tags: 'list tags',
    list_folders: 'list folders',
    move_documents: 'move documents',
    rename_folder: 'rename folder',
    update_document_tags: 'update document tags',
    list_faq: 'list FAQ',
    create_faq: 'create FAQ',
    update_faq: 'update FAQ',
    update_faq_fields: 'update FAQ fields',
    update_faq_tags: 'update FAQ tags',
    delete_faq_entries: 'delete FAQ entries',
    employee_search: 'employee search',
    employee_read_source: 'employee read source',
    runtime_search: 'runtime search',
    runtime_list_bases: 'runtime list knowledge bases',
    runtime_read_base: 'runtime read knowledge base',
    runtime_list_documents: 'runtime list documents',
    runtime_read_document: 'runtime read document',
    runtime_read_chunks: 'runtime read chunks',
    runtime_wiki_search: 'runtime wiki search',
    runtime_wiki_read_page: 'runtime wiki read page',
    runtime_wiki_index: 'runtime wiki index',
    runtime_read: 'runtime read',
  },
};

/** 投递状态：控管事件与终端投递记录共用。 */
const deliveryStates: Bilingual = {
  zh: {
    pending: '待投递',
    received: '已接收',
    running: '投递中',
    delivered: '已投递',
    succeeded: '已投递',
    failed: '失败',
    expired: '已过期',
    superseded: '已被取代',
    cancelled: '已取消',
    active: '生效中',
  },
  en: {
    pending: 'Pending delivery',
    received: 'Received',
    running: 'Delivering',
    delivered: 'Delivered',
    succeeded: 'Delivered',
    failed: 'Failed',
    expired: 'Expired',
    superseded: 'Superseded',
    cancelled: 'Cancelled',
    active: 'Active',
  },
};

/** 不能按「资源.动作」拆解的事件码：登录/改密这类没有资源前缀的码。 */
const eventCodes: Bilingual = {
  zh: {
    'login.succeeded': '登录成功',
    'login.failed': '登录失败',
    'login.throttled': '登录受限',
    'password.changed': '修改密码',
  },
  en: {
    'login.succeeded': 'Signed in',
    'login.failed': 'Sign-in failed',
    'login.throttled': 'Throttled',
    'password.changed': 'Password changed',
  },
};

/** 变更载荷里的已知字段名。 */
const changeFields: Bilingual = {
  zh: {
    displayName: '显示名称',
    username: '用户名',
    email: '邮箱',
    roleIds: '角色',
    teamIds: '团队',
    teamId: '团队',
    modelIds: '模型',
    skillIds: '技能',
    documentIds: '文档',
    status: '状态',
    enabled: '启用',
    kind: '类型',
    name: '名称',
    description: '描述',
    remark: '备注',
    expiresAt: '到期时间',
    requirePasswordChange: '要求改密',
  },
  en: {
    displayName: 'Display name',
    username: 'Username',
    email: 'Email',
    roleIds: 'Roles',
    teamIds: 'Teams',
    teamId: 'Team',
    modelIds: 'Models',
    skillIds: 'Skills',
    documentIds: 'Documents',
    status: 'Status',
    enabled: 'Enabled',
    kind: 'Kind',
    name: 'Name',
    description: 'Description',
    remark: 'Remark',
    expiresAt: 'Expires at',
    requirePasswordChange: 'Requires password change',
  },
};

/** 变更载荷里的已知枚举值，按字段区分；写成「中文(原值)」。 */
const changeEnums: Readonly<Record<string, Bilingual>> = {
  status: {
    zh: { active: '启用', disabled: '停用', withdrawn: '已下架', locked: '已锁定', draft: '草稿', suspended: '已暂停' },
    en: {
      active: 'Active',
      disabled: 'Disabled',
      withdrawn: 'Withdrawn',
      locked: 'Locked',
      draft: 'Draft',
      suspended: 'Suspended',
    },
  },
  enabled: {
    zh: { true: '启用', false: '停用' },
    en: { true: 'Enabled', false: 'Disabled' },
  },
  kind: {
    zh: { human: '人类', agent: '数字员工' },
    en: { human: 'Human', agent: 'Digital employee' },
  },
};

/**
 * 结果的枚举文案：值缺失返回 null，登记过的给中文，未登记原样返回（不猜、也不写「未知类型」）。
 */
export function resultLabel(value?: string | null, language: AdminLanguage = ADMIN_LANGUAGE): string | null {
  return value ? (results[language][value] ?? value) : null;
}

/** 资源类型文案：规则同 `resultLabel`。 */
export function resourceTypeLabel(value?: string | null, language: AdminLanguage = ADMIN_LANGUAGE): string | null {
  return value ? (resourceTypes[language][value] ?? value) : null;
}

/**
 * 事件码 / 动作文案：先整段查表，再按「资源.动作」组合。
 * `skill.updated` → 技能更新；`model.catalog.changed` → 模型目录变更；
 * `upload_file` → 上传文件（整段蛇形码）。未登记的码返回 null，
 * 由调用方（`codeCell`）原样显示英文码 —— 这里不猜、也不写「未知类型」。
 */
export function auditCodeLabel(value?: string | null, language: AdminLanguage = ADMIN_LANGUAGE): string | null {
  if (!value) return null;
  const explicit = eventCodes[language][value] ?? actions[language][value];
  if (explicit) return explicit;
  const separator = value.indexOf('.');
  if (separator <= 0) return null;
  const resource = resourceTypes[language][value.slice(0, separator)];
  const action = actions[language][value.slice(separator + 1)];
  if (!resource || !action) return null;
  return language === 'zh' ? `${resource}${action}` : `${resource} ${action}`;
}

/** 投递状态文案：规则同 `resultLabel`。 */
export function deliveryStateLabel(value?: string | null, language: AdminLanguage = ADMIN_LANGUAGE): string | null {
  return value ? (deliveryStates[language][value] ?? value) : null;
}

/** 对象列：中文资源类型 / 对象 ID；两者都没有返回 null，由调用方如实写「未记录」。 */
export function objectText(
  resourceType?: string | null,
  resourceId?: string | null,
  language: AdminLanguage = ADMIN_LANGUAGE,
): string | null {
  const type = resourceTypeLabel(resourceType, language);
  if (type && resourceId) return `${type} / ${resourceId}`;
  return type ?? resourceId ?? null;
}

/** 变更载荷字段名：登记过用中文，未登记原样保留。 */
export function changeFieldLabel(key: string, language: AdminLanguage = ADMIN_LANGUAGE): string {
  return changeFields[language][key] ?? key;
}

/**
 * 变更载荷取值：登记过的枚举写成「中文(原值)」，其余原样 JSON。
 * 未知字段与未知取值一律原样，不猜。
 */
export function changeValueText(key: string, value: unknown, language: AdminLanguage = ADMIN_LANGUAGE): string {
  const raw =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : null;
  const mapped = raw === null ? undefined : changeEnums[key]?.[language][raw];
  return mapped ? `${mapped}(${raw})` : JSON.stringify(value);
}
