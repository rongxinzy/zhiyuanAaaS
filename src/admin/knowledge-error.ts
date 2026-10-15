import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { PortalError } from './portal.js';

/**
 * 上游/网关错误 → 面向运维的处置提示。
 *
 * 控制台的知识库各子页面（管理、操作、授权、审计、检索）共用这套映射：
 * 如果各自只把 `cause.message` 直出，401/403 会被当成普通业务失败，
 * 缺配置/上游版本过旧也会退化成一句无法核对的英文串。
 */
export function knowledgeErrorText(error: unknown): string {
  if (error instanceof PortalError) {
    if (error.status === 401) return translate(ADMIN_LANGUAGE, 'knowledgeLoginExpired');
    // 可识别的 code 优先于状态码：portal 会用 403 返回租户/部署错配（KNOWLEDGE_TENANT_MISMATCH、
    // DEPLOYMENT_MISMATCH），这类是配置问题，当成「没有权限」会与同一处 503 的配置文案自相矛盾。
    if (error.code === 'KNOWLEDGE_TENANT_MISMATCH') return translate(ADMIN_LANGUAGE, 'knowledgeTenantMismatchManaged');
    if (error.code === 'DEPLOYMENT_MISMATCH') return translate(ADMIN_LANGUAGE, 'knowledgeDeploymentMismatchManaged');
    if (error.code === 'KNOWLEDGE_NOT_CONFIGURED' || error.code === 'KNOWLEDGE_CREDENTIAL_UNAVAILABLE')
      return translate(ADMIN_LANGUAGE, 'knowledgeConfigErrorManaged');
    if (error.code === 'KNOWLEDGE_BASE_IN_USE') return translate(ADMIN_LANGUAGE, 'knowledgeProtected');
    // 上游缺接口/返回无法核对（如 WeKnora 版本过旧）时说清怎么办，别只丢一句“无法安全验证”。
    if (error.code === 'KNOWLEDGE_UPSTREAM_INVALID')
      return translate(ADMIN_LANGUAGE, 'knowledgeUpstreamInvalidManaged');
    // 认不出 code 的 403 才是真的没权限。
    if (error.status === 403) return translate(ADMIN_LANGUAGE, 'knowledgeForbiddenManaged');
  }
  return error instanceof Error ? error.message : String(error);
}
