const copy = {
  zh: {
    label: "接入配置",
    none: "不使用接入密钥",
    hint: "复用已保存的服务端密钥，不在模型页面输入或显示密钥。",
    restricted: "当前账号无权选择接入配置，已有引用将保持不变。",
    failed: "接入配置暂无法获取，请重试。",
    retry: "重试",
    unavailable: "当前引用不可选，请确认是否已停用或已删除。",
    serviceOnly: "仅可选用已启用且仅在服务端使用的密钥。",
  },
  en: {
    label: "Connection",
    none: "No connection secret",
    hint: "Reuse a stored server-side secret. Secret values are never entered or displayed here.",
    restricted:
      "You cannot select connections. Existing references remain unchanged.",
    failed: "Connections are unavailable. Retry.",
    retry: "Retry",
    unavailable:
      "The current reference is unavailable. Check whether it was disabled or deleted.",
    serviceOnly: "Only enabled server-only credentials are selectable.",
  },
};
export const connectionCopy = copy.zh;
export function getConnectionCopy(language: keyof typeof copy) {
  return copy[language];
}
