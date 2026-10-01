/**
 * 2026-09-30 LiXiang2019 列表查询按钮组：查询、重置、导出，供各列表页筛选区复用
 */
import { ClearOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, type FormInstance, Space } from 'antd';
import { useCallback, useState } from 'react';

import { type AdminLanguage, translate } from '../i18n.js';
import { AdminNotificationKind, notify } from '../notifications.js';

const language: AdminLanguage = 'zh';
const t = (key: 'search' | 'reset' | 'export' | 'searchFailed' | 'exportFailed' | 'exportSuccess') =>
  translate(language, key);

/**
 * 2026-09-30 LiXiang2019 查询/导出动作定义：可传 run 回调，或 url + request 适配不同接口地址
 *
 * Prefer `run` when the page already has a typed client method. Prefer
 * `url` + `request` when the same component is reused against different
 * list/export endpoints — only the URL changes per call site.
 */
export type ListQueryAction<Values extends object> =
  | {
      /** 2026-09-30 LiXiang2019 页面自行接入的业务接口调用 */
      readonly run: (values: Values) => void | Promise<void>;
    }
  | {
      /** 2026-09-30 LiXiang2019 接口路径，不同页面传入不同地址 */
      readonly url: string;
      readonly method?: 'GET' | 'POST';
      /** 2026-09-30 LiXiang2019 统一请求适配器，由页面注入鉴权与下载逻辑 */
      readonly request: (input: {
        readonly url: string;
        readonly method: 'GET' | 'POST';
        readonly values: Values;
      }) => void | Promise<void>;
    };

/** 2026-09-30 LiXiang2019 列表查询按钮组入参 */
export interface ListQueryActionsProps<Values extends object = Record<string, unknown>> {
  /** 2026-09-30 LiXiang2019 页面传入的筛选 Form，重置时清空其字段 */
  readonly form: FormInstance<Values>;
  /**
   * 2026-09-30 LiXiang2019 查询动作：传 run 或 url+request
   */
  readonly search: ListQueryAction<Values>;
  /**
   * 2026-09-30 LiXiang2019 导出动作；不传则不展示导出按钮
   */
  readonly export?: ListQueryAction<Values> | undefined;
  /** 2026-09-30 LiXiang2019 表单 resetFields 之后的回调，用于清空已应用筛选或重新拉取 */
  readonly onReset?: (() => void) | undefined;
  /** 2026-09-30 LiXiang2019 是否展示导出按钮，默认在提供 export 时展示 */
  readonly showExport?: boolean | undefined;
  /** 2026-09-30 LiXiang2019 是否展示重置按钮，默认隐藏，需要的页面传 showReset 打开 */
  readonly showReset?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** 2026-09-30 LiXiang2019 外部查询 loading（如表格正在拉取） */
  readonly searching?: boolean | undefined;
  /** 2026-09-30 LiXiang2019 外部导出 loading */
  readonly exporting?: boolean | undefined;
}

/** 2026-09-30 LiXiang2019 按动作形态执行查询或导出 */
async function invokeAction<Values extends object>(action: ListQueryAction<Values>, values: Values): Promise<void> {
  if ('run' in action) {
    await action.run(values);
    return;
  }
  await action.request({
    url: action.url,
    method: action.method ?? 'GET',
    values,
  });
}

/**
 * 2026-09-30 LiXiang2019 列表筛选区按钮组：查询、重置、可选导出
 *
 * @example
 * ```tsx
 * const [form] = Form.useForm<Filters>();
 * <ListQueryActions
 *   form={form}
 *   search={{ run: (values) => client.searchAudit(values).then(apply) }}
 *   export={{
 *     url: "/aep/v1/audit/export",
 *     method: "POST",
 *     request: ({ url, method, values }) => download(url, method, values),
 *   }}
 *   onReset={() => setFilters({})}
 * />
 * ```
 */
export function ListQueryActions<Values extends object = Record<string, unknown>>({
  form,
  search,
  export: exportAction,
  onReset,
  showExport,
  showReset = false,
  disabled = false,
  searching: searchingProp,
  exporting: exportingProp,
}: ListQueryActionsProps<Values>) {
  const [searchingLocal, setSearchingLocal] = useState(false);
  const [exportingLocal, setExportingLocal] = useState(false);
  const searching = searchingProp ?? searchingLocal;
  const exporting = exportingProp ?? exportingLocal;
  const exportVisible = showExport ?? Boolean(exportAction);

  /** 2026-09-30 LiXiang2019 校验并读取当前筛选表单值 */
  const readValues = useCallback(async (): Promise<Values | null> => {
    try {
      return await form.validateFields();
    } catch {
      return null;
    }
  }, [form]);

  /** 2026-09-30 LiXiang2019 点击查询：校验表单后调用 search */
  const handleSearch = useCallback(async () => {
    const values = await readValues();
    if (!values) return;
    setSearchingLocal(true);
    try {
      await invokeAction(search, values);
    } catch {
      notify(AdminNotificationKind.Error, t('searchFailed'));
    } finally {
      setSearchingLocal(false);
    }
  }, [readValues, search]);

  /** 2026-09-30 LiXiang2019 点击重置：清空表单并通知页面 */
  const handleReset = useCallback(() => {
    form.resetFields();
    onReset?.();
  }, [form, onReset]);

  /** 2026-09-30 LiXiang2019 点击导出：校验表单后调用 export */
  const handleExport = useCallback(async () => {
    if (!exportAction) return;
    const values = await readValues();
    if (!values) return;
    setExportingLocal(true);
    try {
      await invokeAction(exportAction, values);
      notify(AdminNotificationKind.Success, t('exportSuccess'));
    } catch {
      notify(AdminNotificationKind.Error, t('exportFailed'));
    } finally {
      setExportingLocal(false);
    }
  }, [exportAction, readValues]);

  return (
    <Space wrap>
      <Button
        type="primary"
        icon={<SearchOutlined />}
        disabled={disabled || exporting}
        loading={searching}
        onClick={() => void handleSearch()}
      >
        {t('search')}
      </Button>
      {showReset ? (
        <Button icon={<ClearOutlined />} disabled={disabled || searching || exporting} onClick={handleReset}>
          {t('reset')}
        </Button>
      ) : null}
      {exportVisible && exportAction ? (
        <Button
          icon={<DownloadOutlined />}
          disabled={disabled || searching}
          loading={exporting}
          onClick={() => void handleExport()}
        >
          {t('export')}
        </Button>
      ) : null}
    </Space>
  );
}
