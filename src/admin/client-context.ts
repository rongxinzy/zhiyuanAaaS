import type {
  AdminModelList,
  AepClient,
  CredentialList,
  HttpMethod,
  JsonObject,
  PlatformUser,
  Role,
} from '@aep/sdk-node';
import type { AdminTeam } from './client-resource-types.js';

export interface ClientContext {
  readonly deploymentId: string | null;
  requireClient(): AepClient;
  request<T>(
    client: AepClient,
    request: {
      readonly method: (typeof HttpMethod)[keyof typeof HttpMethod];
      readonly path: string;
      readonly body?: JsonObject;
      readonly responseType?: 'json' | 'empty';
      readonly idempotencyKey?: string;
    },
  ): Promise<T>;
  listAllRoles(client: AepClient): Promise<readonly Role[]>;
  listAllTeams(client: AepClient): Promise<readonly AdminTeam[]>;
  listAllUsers(client: AepClient): Promise<readonly PlatformUser[]>;
  listAllSkills(client: AepClient): Promise<JsonObject>;
  listAllCredentials(client: AepClient): Promise<CredentialList>;
  listAllModels(client: AepClient): Promise<AdminModelList>;
}
