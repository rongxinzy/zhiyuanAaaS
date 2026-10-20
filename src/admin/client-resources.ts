import {
  type AdminModelList,
  type AepClient,
  HttpMethod,
  type JsonObject,
  type PlatformUser,
  type Role,
} from '@aep/sdk-node';
import { listAssignmentPages } from './client-assignment-pages.js';
import {
  type AdminIdentity,
  type AdminOverview,
  AdminOverviewMetric,
  AdminPermission,
  hasAdminPermission,
} from './client-auth.js';
import type { ClientContext } from './client-context.js';
import {
  listCount,
  parseAssignments,
  parseSkillInstallations,
  parseSkills,
  pendingEventCount,
} from './client-resource-parsers.js';
import type {
  AdminAssignmentSubject,
  AdminResources,
  AdminSkill,
  AdminSkillInstallations,
  Team,
  TeamDefaultsWrite,
} from './client-resource-types.js';
import { segment } from './client-values.js';

export function createResourcesApi(context: ClientContext) {
  return {
    async overview(identity?: AdminIdentity): Promise<AdminOverview> {
      const client = context.requireClient();
      const results = await Promise.all(
        [
          hasAdminPermission(identity, AdminPermission.UsersRead)
            ? context.listAllUsers(client)
            : Promise.resolve(null),
          hasAdminPermission(identity, AdminPermission.TeamsRead)
            ? context.listAllTeams(client)
            : Promise.resolve(null),
          hasAdminPermission(identity, AdminPermission.SkillsRead)
            ? context.listAllSkills(client)
            : Promise.resolve(null),
          hasAdminPermission(identity, AdminPermission.ModelsRead)
            ? context.listAllModels(client)
            : Promise.resolve(null),
          hasAdminPermission(identity, AdminPermission.EventsRead)
            ? client.searchEvents({ limit: 100 })
            : Promise.resolve(null),
        ].map((request) =>
          request.then(
            (value) => ({ ok: true as const, value }),
            (error) => ({ ok: false as const, error }),
          ),
        ),
      );
      const failed: AdminOverviewMetric[] = [];
      const valueAt = <T>(index: number, metric: AdminOverviewMetric): T | null => {
        const result = results[index]!;
        if (!result.ok) {
          failed.push(metric);
          return null;
        }
        return result.value as T | null;
      };
      const users = valueAt<readonly PlatformUser[]>(0, AdminOverviewMetric.Users);
      const teams = valueAt<readonly Team[]>(1, AdminOverviewMetric.Teams);
      const skills = valueAt<JsonObject>(2, AdminOverviewMetric.Skills);
      const models = valueAt<AdminModelList>(3, AdminOverviewMetric.Models);
      const events = valueAt<JsonObject>(4, AdminOverviewMetric.PendingEvents);
      return {
        users: users ? users.length : null,
        teams: teams ? teams.length : null,
        skills: skills ? listCount(skills) : null,
        models: models ? listCount(models) : null,
        pendingEvents: events ? pendingEventCount(events) : null,
        ...(failed.length ? { failed } : {}),
      };
    },
    async resources(identity?: AdminIdentity): Promise<AdminResources> {
      const client = context.requireClient();
      const [users, teams, roles, permissions, skills, assignments] = await Promise.all([
        hasAdminPermission(identity, AdminPermission.UsersRead) ? context.listAllUsers(client) : Promise.resolve([]),
        hasAdminPermission(identity, AdminPermission.TeamsRead) ? context.listAllTeams(client) : Promise.resolve([]),
        hasAdminPermission(identity, AdminPermission.RolesRead) ? context.listAllRoles(client) : Promise.resolve([]),
        hasAdminPermission(identity, AdminPermission.RolesRead)
          ? client.listPermissions()
          : Promise.resolve({ permissions: [] }),
        hasAdminPermission(identity, AdminPermission.SkillsRead)
          ? context.listAllSkills(client)
          : Promise.resolve({ skills: [] }),
        hasAdminPermission(identity, AdminPermission.SkillsAssign)
          ? listAssignmentPages<JsonObject>(context, 'skill').then((items) => ({ items }))
          : Promise.resolve({ items: [] }),
      ]);
      return {
        users,
        teams,
        roles,
        permissions: permissions.permissions,
        skills: parseSkills(skills),
        assignments: parseAssignments(assignments),
      };
    },
    async users(): Promise<readonly PlatformUser[]> {
      return context.listAllUsers(context.requireClient());
    },
    /** Full skill catalog (cursor-paged), parsed like the overview path. */
    async skills(): Promise<readonly AdminSkill[]> {
      return parseSkills(await context.listAllSkills(context.requireClient()));
    },
    // All AEP teams, cursor-paginated. The portal validates employee teams
    // against AEP (not its own department records), so employee forms must
    // offer this list — portal departments alone hide teams like rd-dept
    // that were created directly in AEP.
    async teams(): Promise<readonly Team[]> {
      return context.listAllTeams(context.requireClient());
    },
    async createUser(input: {
      readonly username: string;
      readonly displayName: string;
      readonly email?: string | null;
      readonly temporaryPassword: string;
      readonly teamIds?: readonly string[];
      readonly roleIds?: readonly string[];
      readonly requirePasswordChange: boolean;
    }): Promise<PlatformUser> {
      const deploymentId = context.deploymentId;
      if (!deploymentId) throw new Error('The deployment identity is unavailable.');
      return context.requireClient().createUser({
        deploymentId,
        username: input.username,
        displayName: input.displayName,
        ...(input.email ? { email: input.email } : {}),
        temporaryPassword: input.temporaryPassword,
        ...(input.teamIds ? { teamIds: [...input.teamIds] } : {}),
        ...(input.roleIds ? { roleIds: [...input.roleIds] } : {}),
        requirePasswordChange: input.requirePasswordChange,
      });
    },
    async updateUser(userId: string, input: Parameters<AepClient['updateUser']>[1]): Promise<PlatformUser> {
      return context.requireClient().updateUser(userId, input);
    },
    async resetUserPassword(
      userId: string,
      input: { readonly temporaryPassword: string; readonly requirePasswordChange: boolean },
    ): Promise<void> {
      await context.requireClient().resetUserPassword(userId, input);
    },
    async replaceUserRBAC(
      userId: string,
      input: { readonly roleIds: readonly string[]; readonly teamIds: readonly string[] },
    ): Promise<void> {
      await context
        .requireClient()
        .replaceUserRBAC(userId, { roleIds: [...input.roleIds], teamIds: [...input.teamIds] });
    },
    async createRole(input: Parameters<AepClient['createRole']>[0]): Promise<Role> {
      return context.requireClient().createRole(input);
    },
    async updateRole(roleId: string, input: Parameters<AepClient['updateRole']>[1]): Promise<Role> {
      return context.requireClient().updateRole(roleId, input);
    },
    async deleteRole(roleId: string): Promise<void> {
      await context.requireClient().deleteRole(roleId);
    },
    async createTeam(input: Parameters<AepClient['createTeam']>[0] & TeamDefaultsWrite): Promise<Team> {
      return context.requireClient().createTeam(input);
    },
    async updateTeam(teamId: string, input: Parameters<AepClient['updateTeam']>[1] & TeamDefaultsWrite): Promise<Team> {
      return context.requireClient().updateTeam(teamId, input);
    },
    async deleteTeam(teamId: string): Promise<void> {
      await context.requireClient().deleteTeam(teamId);
    },
    async createSkill(input: {
      readonly name: string;
      readonly description: string;
      readonly enabled?: boolean;
    }): Promise<string> {
      const { enabled, ...write } = input;
      const created = await context.requireClient().createSkill(write);
      // The SDK returns the created skill as an untyped JSON object; the id is
      // server-generated from the name.
      const skillId = String((created as { id?: unknown }).id ?? '');
      if (enabled === false) await context.requireClient().updateSkill(skillId, { state: 'withdrawn' });
      return skillId;
    },
    async updateSkill(
      skillId: string,
      input: { readonly name?: string; readonly description?: string; readonly enabled?: boolean },
    ): Promise<void> {
      const { enabled, ...patch } = input;
      await context.requireClient().updateSkill(skillId, {
        ...patch,
        ...(enabled === undefined ? {} : { state: enabled ? 'active' : 'withdrawn' }),
      });
    },
    // The pinned SDK release predates the force query parameter, so the delete
    // goes through the same handwritten transport path as the other newer admin
    // endpoints (see #request).
    async deleteSkill(skillId: string, force = false): Promise<void> {
      await context.request<null>(context.requireClient(), {
        method: HttpMethod.Delete,
        path: `/aep/v1/admin/skills/${segment(skillId)}${force ? '?force=true' : ''}`,
        responseType: 'empty',
      });
    },
    // The endpoint is newer than the pinned SDK package, so it goes through the
    // console's own request path (same as deleteSkill).
    async skillInstallations(skillId: string): Promise<AdminSkillInstallations> {
      return parseSkillInstallations(
        await context.request<JsonObject>(context.requireClient(), {
          method: HttpMethod.Get,
          path: `/aep/v1/admin/skills/${segment(skillId)}/installations`,
        }),
      );
    },
    async uploadSkillVersion(skillId: string, version: string, archive: Uint8Array): Promise<void> {
      await context.requireClient().uploadSkillVersion(skillId, version, archive);
    },
    async publishSkillVersion(skillId: string, version: string): Promise<void> {
      await context.requireClient().publishSkillVersion(skillId, version);
    },
    async deleteSkillVersion(skillId: string, version: string): Promise<void> {
      await context.requireClient().deleteSkillVersion(skillId, version);
    },
    async createSkillAssignment(input: {
      readonly skillId: string;
      readonly subject: AdminAssignmentSubject;
      readonly expiresAt?: string | null;
    }): Promise<void> {
      await context.requireClient().createSkillAssignment({
        skillId: input.skillId,
        subject: { type: input.subject.type, id: input.subject.id },
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      });
    },
    async deleteSkillAssignment(assignmentId: string): Promise<void> {
      await context.requireClient().deleteSkillAssignment(assignmentId);
    },
  };
}
