import { type AdminApi, AdminClientSession } from './client-session.js';

export {
  AdminConsoleStatus,
  type AdminIdentity,
  AdminMetadataError,
  AdminPermission,
  AdminRequestError,
  type AdminSession,
  hasAdminConsoleAccess,
  hasAdminPermission,
  hasAnyAdminConsoleAccess,
  SessionTokenStore,
} from './client-auth.js';
export {
  type AdminComputeAssignment,
  type AdminComputeTier,
  type AdminDataPlane,
  type AdminDataPlaneCatalogComparison,
  type AdminDataPlaneRouteMismatch,
  type AdminDeploymentSettings,
  type AdminDeploymentSettingValue,
  AdminModelGatewayUrlProblem,
  modelGatewayBaseUrlProblem,
} from './client-deployment-types.js';
export {
  type AdminAuditFilters,
  type AdminAuditPage,
  type AdminAuditRecord,
  type AdminAuthenticationAuditRecord,
  type AdminDeliveryRecord,
  type AdminEventRecord,
  type AdminIdentityMapping,
  AdminIdentityMappingStatus,
  type AdminIdentitySource,
  AdminIdentitySourceKind,
  AdminIdentitySubjectType,
} from './client-directory-types.js';
export {
  AdminModelSubjectType,
  type AdminResources,
  type AdminSessionClient,
  type AdminSkill,
  type AdminSkillAssignment,
  type AdminSkillInstallation,
  type AdminSkillVersion,
  AdminSubjectType,
  type AdminTeam,
  type AdminUserSession,
} from './client-resource-types.js';

export class AdminConsoleClient extends AdminClientSession {
  controlEvents(...args: Parameters<AdminApi['controlEvents']>): ReturnType<AdminApi['controlEvents']> {
    return this.api.controlEvents(...args);
  }
  getControlEvent(...args: Parameters<AdminApi['getControlEvent']>): ReturnType<AdminApi['getControlEvent']> {
    return this.api.getControlEvent(...args);
  }
  cancelControlEvent(...args: Parameters<AdminApi['cancelControlEvent']>): ReturnType<AdminApi['cancelControlEvent']> {
    return this.api.cancelControlEvent(...args);
  }
  publishControlEvent(
    ...args: Parameters<AdminApi['publishControlEvent']>
  ): ReturnType<AdminApi['publishControlEvent']> {
    return this.api.publishControlEvent(...args);
  }
  deliverySummary(...args: Parameters<AdminApi['deliverySummary']>): ReturnType<AdminApi['deliverySummary']> {
    return this.api.deliverySummary(...args);
  }
  searchAudit(...args: Parameters<AdminApi['searchAudit']>): ReturnType<AdminApi['searchAudit']> {
    return this.api.searchAudit(...args);
  }
  searchAuthenticationAudit(
    ...args: Parameters<AdminApi['searchAuthenticationAudit']>
  ): ReturnType<AdminApi['searchAuthenticationAudit']> {
    return this.api.searchAuthenticationAudit(...args);
  }
  searchAdminAudit(...args: Parameters<AdminApi['searchAdminAudit']>): ReturnType<AdminApi['searchAdminAudit']> {
    return this.api.searchAdminAudit(...args);
  }
  getGatewayCapabilities(
    ...args: Parameters<AdminApi['getGatewayCapabilities']>
  ): ReturnType<AdminApi['getGatewayCapabilities']> {
    return this.api.getGatewayCapabilities(...args);
  }
  queryGatewayMetrics(
    ...args: Parameters<AdminApi['queryGatewayMetrics']>
  ): ReturnType<AdminApi['queryGatewayMetrics']> {
    return this.api.queryGatewayMetrics(...args);
  }
  getGatewayMonitoringHealth(
    ...args: Parameters<AdminApi['getGatewayMonitoringHealth']>
  ): ReturnType<AdminApi['getGatewayMonitoringHealth']> {
    return this.api.getGatewayMonitoringHealth(...args);
  }
  searchGatewayRequests(
    ...args: Parameters<AdminApi['searchGatewayRequests']>
  ): ReturnType<AdminApi['searchGatewayRequests']> {
    return this.api.searchGatewayRequests(...args);
  }
  getGatewayRequest(...args: Parameters<AdminApi['getGatewayRequest']>): ReturnType<AdminApi['getGatewayRequest']> {
    return this.api.getGatewayRequest(...args);
  }
  listGatewayLimits(...args: Parameters<AdminApi['listGatewayLimits']>): ReturnType<AdminApi['listGatewayLimits']> {
    return this.api.listGatewayLimits(...args);
  }
  putGatewayLimit(...args: Parameters<AdminApi['putGatewayLimit']>): ReturnType<AdminApi['putGatewayLimit']> {
    return this.api.putGatewayLimit(...args);
  }
  deleteGatewayLimit(...args: Parameters<AdminApi['deleteGatewayLimit']>): ReturnType<AdminApi['deleteGatewayLimit']> {
    return this.api.deleteGatewayLimit(...args);
  }
  publishGatewayLimits(
    ...args: Parameters<AdminApi['publishGatewayLimits']>
  ): ReturnType<AdminApi['publishGatewayLimits']> {
    return this.api.publishGatewayLimits(...args);
  }
  getGatewayLimitsStatus(
    ...args: Parameters<AdminApi['getGatewayLimitsStatus']>
  ): ReturnType<AdminApi['getGatewayLimitsStatus']> {
    return this.api.getGatewayLimitsStatus(...args);
  }
  getGatewayQuota(...args: Parameters<AdminApi['getGatewayQuota']>): ReturnType<AdminApi['getGatewayQuota']> {
    return this.api.getGatewayQuota(...args);
  }
  refreshGatewayQuota(
    ...args: Parameters<AdminApi['refreshGatewayQuota']>
  ): ReturnType<AdminApi['refreshGatewayQuota']> {
    return this.api.refreshGatewayQuota(...args);
  }
  changeGatewayQuota(...args: Parameters<AdminApi['changeGatewayQuota']>): ReturnType<AdminApi['changeGatewayQuota']> {
    return this.api.changeGatewayQuota(...args);
  }
  createGatewayTestAccess(
    ...args: Parameters<AdminApi['createGatewayTestAccess']>
  ): ReturnType<AdminApi['createGatewayTestAccess']> {
    return this.api.createGatewayTestAccess(...args);
  }
  identitySources(...args: Parameters<AdminApi['identitySources']>): ReturnType<AdminApi['identitySources']> {
    return this.api.identitySources(...args);
  }
  createIdentitySource(
    ...args: Parameters<AdminApi['createIdentitySource']>
  ): ReturnType<AdminApi['createIdentitySource']> {
    return this.api.createIdentitySource(...args);
  }
  identityMappings(...args: Parameters<AdminApi['identityMappings']>): ReturnType<AdminApi['identityMappings']> {
    return this.api.identityMappings(...args);
  }
  upsertIdentityMapping(
    ...args: Parameters<AdminApi['upsertIdentityMapping']>
  ): ReturnType<AdminApi['upsertIdentityMapping']> {
    return this.api.upsertIdentityMapping(...args);
  }
  deleteIdentityMapping(
    ...args: Parameters<AdminApi['deleteIdentityMapping']>
  ): ReturnType<AdminApi['deleteIdentityMapping']> {
    return this.api.deleteIdentityMapping(...args);
  }
  importUsers(...args: Parameters<AdminApi['importUsers']>): ReturnType<AdminApi['importUsers']> {
    return this.api.importUsers(...args);
  }
  models(...args: Parameters<AdminApi['models']>): ReturnType<AdminApi['models']> {
    return this.api.models(...args);
  }
  getModelPricing(...args: Parameters<AdminApi['getModelPricing']>): ReturnType<AdminApi['getModelPricing']> {
    return this.api.getModelPricing(...args);
  }
  putModelPricing(...args: Parameters<AdminApi['putModelPricing']>): ReturnType<AdminApi['putModelPricing']> {
    return this.api.putModelPricing(...args);
  }
  createModel(...args: Parameters<AdminApi['createModel']>): ReturnType<AdminApi['createModel']> {
    return this.api.createModel(...args);
  }
  gatewaySubjects(...args: Parameters<AdminApi['gatewaySubjects']>): ReturnType<AdminApi['gatewaySubjects']> {
    return this.api.gatewaySubjects(...args);
  }
  updateModel(...args: Parameters<AdminApi['updateModel']>): ReturnType<AdminApi['updateModel']> {
    return this.api.updateModel(...args);
  }
  deleteModel(...args: Parameters<AdminApi['deleteModel']>): ReturnType<AdminApi['deleteModel']> {
    return this.api.deleteModel(...args);
  }
  createModelAssignment(
    ...args: Parameters<AdminApi['createModelAssignment']>
  ): ReturnType<AdminApi['createModelAssignment']> {
    return this.api.createModelAssignment(...args);
  }
  deleteModelAssignment(
    ...args: Parameters<AdminApi['deleteModelAssignment']>
  ): ReturnType<AdminApi['deleteModelAssignment']> {
    return this.api.deleteModelAssignment(...args);
  }
  credentials(...args: Parameters<AdminApi['credentials']>): ReturnType<AdminApi['credentials']> {
    return this.api.credentials(...args);
  }
  createCredential(...args: Parameters<AdminApi['createCredential']>): ReturnType<AdminApi['createCredential']> {
    return this.api.createCredential(...args);
  }
  updateCredential(...args: Parameters<AdminApi['updateCredential']>): ReturnType<AdminApi['updateCredential']> {
    return this.api.updateCredential(...args);
  }
  rotateCredential(...args: Parameters<AdminApi['rotateCredential']>): ReturnType<AdminApi['rotateCredential']> {
    return this.api.rotateCredential(...args);
  }
  deleteCredential(...args: Parameters<AdminApi['deleteCredential']>): ReturnType<AdminApi['deleteCredential']> {
    return this.api.deleteCredential(...args);
  }
  createCredentialAssignment(
    ...args: Parameters<AdminApi['createCredentialAssignment']>
  ): ReturnType<AdminApi['createCredentialAssignment']> {
    return this.api.createCredentialAssignment(...args);
  }
  deleteCredentialAssignment(
    ...args: Parameters<AdminApi['deleteCredentialAssignment']>
  ): ReturnType<AdminApi['deleteCredentialAssignment']> {
    return this.api.deleteCredentialAssignment(...args);
  }
  createDataPlanePublication(
    ...args: Parameters<AdminApi['createDataPlanePublication']>
  ): ReturnType<AdminApi['createDataPlanePublication']> {
    return this.api.createDataPlanePublication(...args);
  }
  getDataPlanePublication(
    ...args: Parameters<AdminApi['getDataPlanePublication']>
  ): ReturnType<AdminApi['getDataPlanePublication']> {
    return this.api.getDataPlanePublication(...args);
  }
  licenses(...args: Parameters<AdminApi['licenses']>): ReturnType<AdminApi['licenses']> {
    return this.api.licenses(...args);
  }
  importLicense(...args: Parameters<AdminApi['importLicense']>): ReturnType<AdminApi['importLicense']> {
    return this.api.importLicense(...args);
  }
  revokeLicense(...args: Parameters<AdminApi['revokeLicense']>): ReturnType<AdminApi['revokeLicense']> {
    return this.api.revokeLicense(...args);
  }
  revokeUserSession(...args: Parameters<AdminApi['revokeUserSession']>): ReturnType<AdminApi['revokeUserSession']> {
    return this.api.revokeUserSession(...args);
  }
  sessions(...args: Parameters<AdminApi['sessions']>): ReturnType<AdminApi['sessions']> {
    return this.api.sessions(...args);
  }
  dataPlane(...args: Parameters<AdminApi['dataPlane']>): ReturnType<AdminApi['dataPlane']> {
    return this.api.dataPlane(...args);
  }
  publishDataPlaneRoutes(
    ...args: Parameters<AdminApi['publishDataPlaneRoutes']>
  ): ReturnType<AdminApi['publishDataPlaneRoutes']> {
    return this.api.publishDataPlaneRoutes(...args);
  }
  putDataPlane(...args: Parameters<AdminApi['putDataPlane']>): ReturnType<AdminApi['putDataPlane']> {
    return this.api.putDataPlane(...args);
  }
  deploymentSettings(...args: Parameters<AdminApi['deploymentSettings']>): ReturnType<AdminApi['deploymentSettings']> {
    return this.api.deploymentSettings(...args);
  }
  updateDeploymentSettings(
    ...args: Parameters<AdminApi['updateDeploymentSettings']>
  ): ReturnType<AdminApi['updateDeploymentSettings']> {
    return this.api.updateDeploymentSettings(...args);
  }
  computeTierCatalog(...args: Parameters<AdminApi['computeTierCatalog']>): ReturnType<AdminApi['computeTierCatalog']> {
    return this.api.computeTierCatalog(...args);
  }
  computeAssignments(...args: Parameters<AdminApi['computeAssignments']>): ReturnType<AdminApi['computeAssignments']> {
    return this.api.computeAssignments(...args);
  }
  updateComputeAssignment(
    ...args: Parameters<AdminApi['updateComputeAssignment']>
  ): ReturnType<AdminApi['updateComputeAssignment']> {
    return this.api.updateComputeAssignment(...args);
  }
  overview(...args: Parameters<AdminApi['overview']>): ReturnType<AdminApi['overview']> {
    return this.api.overview(...args);
  }
  resources(...args: Parameters<AdminApi['resources']>): ReturnType<AdminApi['resources']> {
    return this.api.resources(...args);
  }
  users(...args: Parameters<AdminApi['users']>): ReturnType<AdminApi['users']> {
    return this.api.users(...args);
  }
  skills(...args: Parameters<AdminApi['skills']>): ReturnType<AdminApi['skills']> {
    return this.api.skills(...args);
  }
  teams(...args: Parameters<AdminApi['teams']>): ReturnType<AdminApi['teams']> {
    return this.api.teams(...args);
  }
  createUser(...args: Parameters<AdminApi['createUser']>): ReturnType<AdminApi['createUser']> {
    return this.api.createUser(...args);
  }
  updateUser(...args: Parameters<AdminApi['updateUser']>): ReturnType<AdminApi['updateUser']> {
    return this.api.updateUser(...args);
  }
  resetUserPassword(...args: Parameters<AdminApi['resetUserPassword']>): ReturnType<AdminApi['resetUserPassword']> {
    return this.api.resetUserPassword(...args);
  }
  replaceUserRBAC(...args: Parameters<AdminApi['replaceUserRBAC']>): ReturnType<AdminApi['replaceUserRBAC']> {
    return this.api.replaceUserRBAC(...args);
  }
  createRole(...args: Parameters<AdminApi['createRole']>): ReturnType<AdminApi['createRole']> {
    return this.api.createRole(...args);
  }
  updateRole(...args: Parameters<AdminApi['updateRole']>): ReturnType<AdminApi['updateRole']> {
    return this.api.updateRole(...args);
  }
  deleteRole(...args: Parameters<AdminApi['deleteRole']>): ReturnType<AdminApi['deleteRole']> {
    return this.api.deleteRole(...args);
  }
  createTeam(...args: Parameters<AdminApi['createTeam']>): ReturnType<AdminApi['createTeam']> {
    return this.api.createTeam(...args);
  }
  updateTeam(...args: Parameters<AdminApi['updateTeam']>): ReturnType<AdminApi['updateTeam']> {
    return this.api.updateTeam(...args);
  }
  deleteTeam(...args: Parameters<AdminApi['deleteTeam']>): ReturnType<AdminApi['deleteTeam']> {
    return this.api.deleteTeam(...args);
  }
  createSkill(...args: Parameters<AdminApi['createSkill']>): ReturnType<AdminApi['createSkill']> {
    return this.api.createSkill(...args);
  }
  updateSkill(...args: Parameters<AdminApi['updateSkill']>): ReturnType<AdminApi['updateSkill']> {
    return this.api.updateSkill(...args);
  }
  deleteSkill(...args: Parameters<AdminApi['deleteSkill']>): ReturnType<AdminApi['deleteSkill']> {
    return this.api.deleteSkill(...args);
  }
  skillInstallations(...args: Parameters<AdminApi['skillInstallations']>): ReturnType<AdminApi['skillInstallations']> {
    return this.api.skillInstallations(...args);
  }
  uploadSkillVersion(...args: Parameters<AdminApi['uploadSkillVersion']>): ReturnType<AdminApi['uploadSkillVersion']> {
    return this.api.uploadSkillVersion(...args);
  }
  publishSkillVersion(
    ...args: Parameters<AdminApi['publishSkillVersion']>
  ): ReturnType<AdminApi['publishSkillVersion']> {
    return this.api.publishSkillVersion(...args);
  }
  deleteSkillVersion(...args: Parameters<AdminApi['deleteSkillVersion']>): ReturnType<AdminApi['deleteSkillVersion']> {
    return this.api.deleteSkillVersion(...args);
  }
  createSkillAssignment(
    ...args: Parameters<AdminApi['createSkillAssignment']>
  ): ReturnType<AdminApi['createSkillAssignment']> {
    return this.api.createSkillAssignment(...args);
  }
  deleteSkillAssignment(
    ...args: Parameters<AdminApi['deleteSkillAssignment']>
  ): ReturnType<AdminApi['deleteSkillAssignment']> {
    return this.api.deleteSkillAssignment(...args);
  }
}
