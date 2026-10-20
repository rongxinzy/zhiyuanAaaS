import {
  type AepClient,
  type CredentialAssignment,
  type CredentialAssignmentWrite,
  type CredentialCreate,
  type CredentialMetadata,
  type CredentialPatch,
  type CredentialRotate,
  HttpMethod,
  type ModelAssignment,
} from '@aep/sdk-node';
import { listAssignmentPages } from './client-assignment-pages.js';
import { type AdminIdentity, AdminPermission, hasAdminPermission } from './client-auth.js';
import type { ClientContext } from './client-context.js';
import type { AdminCredentials, AdminModelAssignmentSubject, AdminModels } from './client-resource-types.js';
import type { ModelPricing, ModelPricingWrite } from './model-pricing-api.js';

export function createModelsApi(context: ClientContext) {
  return {
    async models(identity?: AdminIdentity): Promise<AdminModels> {
      const client = context.requireClient();
      const [models, assignments] = await Promise.all([
        context.listAllModels(client),
        hasAdminPermission(identity, AdminPermission.ModelsAssign)
          ? listAssignmentPages<ModelAssignment>(context, 'model').then((assignments) => ({ assignments }))
          : Promise.resolve({ assignments: [] }),
      ]);
      return { models: models.models, assignments: assignments.assignments };
    },
    getModelPricing(modelId: string): Promise<ModelPricing> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Get,
        path: `/aep/v1/admin/models/${encodeURIComponent(modelId)}/pricing`,
      });
    },
    putModelPricing(modelId: string, input: ModelPricingWrite): Promise<ModelPricing> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Put,
        path: `/aep/v1/admin/models/${encodeURIComponent(modelId)}/pricing`,
        body: { ...input, pricing: input.pricing ? { ...input.pricing } : null },
      });
    },
    async createModel(input: Parameters<AepClient['createModel']>[0]): Promise<void> {
      await context.requireClient().createModel(input);
    },
    async gatewaySubjects(identity?: AdminIdentity) {
      const client = context.requireClient();
      const [models, users, teams, roles] = await Promise.all([
        hasAdminPermission(identity, AdminPermission.ModelsRead) ? context.listAllModels(client) : { models: [] },
        hasAdminPermission(identity, AdminPermission.UsersRead) ? context.listAllUsers(client) : [],
        hasAdminPermission(identity, AdminPermission.TeamsRead) ? context.listAllTeams(client) : [],
        hasAdminPermission(identity, AdminPermission.RolesRead) ? context.listAllRoles(client) : [],
      ]);
      return { models: models.models, users, teams, roles };
    },
    async updateModel(modelId: string, input: Parameters<AepClient['updateModel']>[1]): Promise<void> {
      await context.requireClient().updateModel(modelId, input);
    },
    async deleteModel(modelId: string): Promise<void> {
      await context.requireClient().deleteModel(modelId);
    },
    async createModelAssignment(input: {
      readonly modelId: string;
      readonly subject: AdminModelAssignmentSubject;
    }): Promise<void> {
      await context.requireClient().createModelAssignment({
        modelId: input.modelId,
        subject: { type: input.subject.type, id: input.subject.id },
      });
    },
    async deleteModelAssignment(assignmentId: string): Promise<void> {
      await context.requireClient().deleteModelAssignment(assignmentId);
    },
    async credentials(identity?: AdminIdentity): Promise<AdminCredentials> {
      const client = context.requireClient();
      const [credentials, assignments] = await Promise.all([
        context.listAllCredentials(client),
        hasAdminPermission(identity, AdminPermission.CredentialsAssign)
          ? listAssignmentPages<CredentialAssignment>(context, 'credential').then((assignments) => ({ assignments }))
          : Promise.resolve({ assignments: [] }),
      ]);
      return {
        credentials: credentials.credentials,
        assignments: assignments.assignments,
      };
    },
    async createCredential(input: CredentialCreate): Promise<CredentialMetadata> {
      return context.requireClient().createCredential(input);
    },
    async updateCredential(credentialId: string, input: CredentialPatch): Promise<CredentialMetadata> {
      return context.requireClient().updateCredential(credentialId, input);
    },
    async rotateCredential(credentialId: string, input: CredentialRotate): Promise<CredentialMetadata> {
      return context.requireClient().rotateCredential(credentialId, input);
    },
    async deleteCredential(credentialId: string): Promise<void> {
      await context.requireClient().deleteCredential(credentialId);
    },
    async createCredentialAssignment(input: CredentialAssignmentWrite): Promise<CredentialAssignment> {
      return context.requireClient().createCredentialAssignment(input);
    },
    async deleteCredentialAssignment(assignmentId: string): Promise<void> {
      await context.requireClient().deleteCredentialAssignment(assignmentId);
    },
  };
}
