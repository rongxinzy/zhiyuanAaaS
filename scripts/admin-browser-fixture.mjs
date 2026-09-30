import http from "node:http";

// Deterministic test-only API fixtures; never loaded by the admin application.
export const state = {
  users: [
    {
      id: "admin-1",
      username: "admin",
      displayName: "管理员",
      email: null,
      status: "active",
      roleIds: ["admin"],
      teamIds: [],
    },
  ],
  teams: [],
  roles: [{ id: "member", name: "企业成员", enabled: true, builtIn: true, permissions: [] }],
  skills: [],
  skillAssignments: [],
  models: [],
  modelAssignments: [],
  credentials: [],
  credentialAssignments: [],
  licenses: [],
  controlEvents: [],
  employees: [
    {
      name: "sales-helper",
      displayName: "E2E 销售助理",
      ownerId: "admin-1",
      owner: "管理员",
      model: "model-1",
      phase: "Ready",
      runtime: "deerflow",
      memoryUser: "sales-helper",
      createdAt: "2026-09-29T00:00:00Z",
      channels: { wecom: true, wecomName: "E2E 企业微信" },
    },
  ],
  employeeRequests: [],
  identitySources: [],
  identityMappings: [],
  sessions: [
    {
      sessionId: "session-1",
      userId: "admin-1",
      topic: "desktop",
      createdAt: "2026-09-29T00:00:00Z",
      lastSeenAt: "2026-09-29T01:00:00Z",
    },
  ],
  dataPlane: {
    desired: {
      deploymentId: "demo",
      revision: "rev-1",
      routes: [],
      publishedAt: null,
      contentHash: "",
    },
    status: {
      state: "ready",
      observedRevision: "rev-1",
      contentHash: "",
      lastAppliedAt: null,
      resourceCount: 0,
    },
  },
  deploymentSettings: {
    modelGatewayOverride: null,
    envGatewayBaseUrl: "https://gateway.example.test/v1",
  },
  requests: [],
  failNext: null,
  nextId: 1,
};

export function createAdminFixture() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const body = await readBody(request);
    state.requests.push({ method: request.method ?? "", path: url.pathname });
    try {
      await route(request.method ?? "GET", url.pathname, body, response, url.searchParams);
    } catch (error) {
      writeJson(response, 500, { code: "MOCK_FAILURE", detail: String(error) });
    }
  });
}

async function route(method, pathname, rawBody, response, query) {
  if (state.failNext === `${method} ${pathname}`) {
    state.failNext = null;
    return writeJson(response, 503, { code: 'TEST_FAILURE', detail: 'Temporary test failure' });
  }
  if (method === "GET" && pathname === "/api/v1/employees")
    return writeJson(response, 200, { employees: state.employees });
  if (method === "POST" && pathname === "/api/v1/employees") {
    const input = jsonBody(rawBody);
    if (state.employees.some((employee) => employee.name === input.name))
      return writeJson(response, 409, { error: "名称已存在" });
    state.employees.push({
      ...input,
      phase: "Pending",
      ownerId: "admin-1",
      owner: "管理员",
      model: "",
      runtime: "deerflow",
      memoryUser: input.name,
      createdAt: new Date().toISOString(),
    });
    return writeJson(response, 201, { message: "已创建，等待部署" });
  }
  if (method === "GET" && pathname === "/api/v1/requests")
    return writeJson(response, 200, { requests: state.employeeRequests });
  if (method === "GET" && pathname === "/api/v1/knowledge/status")
    return writeJson(response, 200, {
      configured: true,
      healthy: true,
      url: "https://knowledge.example.test",
      knowledgeBases: [
        {
          id: "kb-1",
          name: "E2E 产品资料",
          description: "测试知识库",
          documentCount: 5,
        },
      ],
    });
  if (method === "GET" && pathname === "/api/v1/memory/status")
    return writeJson(response, 200, {
      healthy: true,
      server: "memory-service",
      account: "enterprise",
      accounts: [],
      employees: [
        {
          name: "sales-helper",
          memoryUser: "sales-helper",
          sessions: 2,
          lastActive: "2026-09-29T01:00:00Z",
        },
      ],
    });
  if (method === "POST" && pathname === "/api/v1/memory/search")
    return writeJson(response, 200, { memories: [] });
  if (method === "GET" && pathname === "/aep/v1/admin/identity-sources")
    return writeJson(response, 200, {
      items: state.identitySources,
      nextCursor: null,
    });
  if (method === "POST" && pathname === "/aep/v1/admin/identity-sources") {
    const source = { ...jsonBody(rawBody), enabled: true };
    state.identitySources.push(source);
    return writeJson(response, 201, source);
  }
  if (
    pathname.startsWith("/aep/v1/admin/identity-sources/") &&
    pathname.endsWith("/mappings")
  ) {
    const sourceId = pathname.split("/").at(-2);
    if (method === "GET")
      return writeJson(response, 200, {
        items: state.identityMappings.filter(
          (item) => item.sourceId === sourceId,
        ),
        nextCursor: null,
      });
    if (method === "PUT") {
      const mapping = { ...jsonBody(rawBody), sourceId, status: "active" };
      state.identityMappings = state.identityMappings.filter(
        (item) =>
          !(
            item.sourceId === sourceId && item.externalId === mapping.externalId
          ),
      );
      state.identityMappings.push(mapping);
      return writeJson(response, 200, mapping);
    }
  }
  if (method === "GET" && pathname === "/aep/v1/metadata")
    return writeJson(response, 200, {
      service: "zhiyuan-aep",
      supportedProtocolVersions: ["1.0"],
      capabilities: [],
      jwksUri: "/.well-known/jwks.json",
      deploymentId: "demo",
      deployment: { id: "demo", name: "演示部署" },
    });
  if (method === "POST" && pathname === "/aep/v1/auth/logout")
    return writeJson(response, 200, {});
  if (
    method === "POST" &&
    pathname.endsWith("/revoke") &&
    pathname.startsWith("/aep/v1/admin/sessions/")
  ) {
    const session = state.sessions.find(
      (item) => item.sessionId === pathname.split("/").at(-2),
    );
    if (session) session.revokedAt = new Date().toISOString();
    return writeJson(response, 200, {});
  }
  if (pathname === "/aep/v1/auth/password/login" && method === "POST") {
    return writeJson(response, 200, {
      accessToken: "e2e-access",
      refreshToken: "e2e-refresh",
      modelAccessToken: "e2e-model",
      tokenType: "Bearer",
      expiresIn: 3600,
      modelAccessExpiresIn: 3600,
      deploymentId: "demo",
      sessionId: "e2e-session",
      passwordChangeRequired: false,
    });
  }
  if (pathname === "/aep/v1/auth/refresh" && method === "POST") {
    return writeJson(response, 200, {
      accessToken: "e2e-access",
      refreshToken: "e2e-refresh",
      modelAccessToken: "e2e-model",
      tokenType: "Bearer",
      expiresIn: 3600,
      modelAccessExpiresIn: 3600,
      deploymentId: "demo",
      sessionId: "e2e-session",
      passwordChangeRequired: false,
    });
  }
  if (pathname === "/aep/v1/user/me" && method === "GET") {
    return writeJson(response, 200, {
      user: { id: "admin-1", displayName: "管理员", email: null },
      deployment: { id: "demo", name: "演示部署" },
      deploymentId: "demo",
      sessionId: "e2e-session",
      roles: ["admin"],
      permissions: [],
      sessionExpiresAt: "2027-01-01T00:00:00Z",
      passwordChangeRequired: false,
    });
  }
  if (method === "GET" && pathname === "/aep/v1/admin/users")
    return writeJson(response, 200, { items: state.users, nextCursor: null });
  if (method === "POST" && pathname === "/aep/v1/admin/users") {
    const input = jsonBody(rawBody);
    const user = {
      id: `user-${state.nextId++}`,
      username: input.username,
      displayName: input.displayName,
      email: input.email ?? null,
      status: "active",
      roleIds: input.roleIds ?? [],
      teamIds: input.teamIds ?? [],
    };
    state.users.push(user);
    return writeJson(response, 201, user);
  }
  if (method === "PATCH" && pathname.startsWith("/aep/v1/admin/users/")) {
    const user = state.users.find(
      (item) => item.id === pathname.split("/").at(-1),
    );
    Object.assign(user ?? {}, jsonBody(rawBody));
    return writeJson(response, 200, user);
  }
  if (
    method === "PUT" &&
    pathname.startsWith("/aep/v1/admin/users/") &&
    pathname.endsWith("/rbac")
  ) {
    const user = state.users.find(
      (item) => item.id === pathname.split("/").at(-2),
    );
    const input = jsonBody(rawBody);
    if (user)
      Object.assign(user, {
        roleIds: input.roleIds ?? [],
        teamIds: input.teamIds ?? [],
      });
    return writeJson(response, 200, input);
  }
  if (method === "GET" && pathname === "/aep/v1/admin/teams")
    return writeJson(response, 200, { teams: state.teams });
  if (method === "POST" && pathname === "/aep/v1/admin/teams")
    return createRecord(response, state.teams, jsonBody(rawBody));
  if (method === "PATCH" && pathname.startsWith("/aep/v1/admin/teams/"))
    return patchRecord(response, state.teams, pathname, jsonBody(rawBody));
  if (method === "DELETE" && pathname.startsWith("/aep/v1/admin/teams/"))
    return deleteRecord(response, state.teams, pathname);
  if (method === "GET" && pathname === "/aep/v1/admin/roles")
    return writeJson(response, 200, { roles: state.roles, permissions: [] });
  if (method === "POST" && pathname === "/aep/v1/admin/roles")
    return createRecord(response, state.roles, jsonBody(rawBody));
  if (method === "PATCH" && pathname.startsWith("/aep/v1/admin/roles/"))
    return patchRecord(response, state.roles, pathname, jsonBody(rawBody));
  if (method === "DELETE" && pathname.startsWith("/aep/v1/admin/roles/"))
    return deleteRecord(response, state.roles, pathname);
  if (method === "GET" && pathname === "/aep/v1/admin/permissions")
    return writeJson(response, 200, { permissions: [] });
  if (method === "GET" && pathname === "/aep/v1/admin/skills")
    return writeJson(response, 200, { skills: state.skills });
  if (method === "POST" && pathname === "/aep/v1/admin/skills")
    return createRecord(response, state.skills, {
      ...jsonBody(rawBody),
      state: "active",
      enabled: true,
      versions: [],
    });
  if (method === "PATCH" && pathname.startsWith("/aep/v1/admin/skills/"))
    return patchRecord(response, state.skills, pathname, jsonBody(rawBody));
  if (
    method === "POST" &&
    pathname.endsWith("/versions") &&
    pathname.startsWith("/aep/v1/admin/skills/")
  ) {
    const skill = state.skills.find(
      (item) => item.id === pathname.split("/").at(-2),
    );
    if (!skill) return writeJson(response, 404, { code: "NOT_FOUND" });
    skill.versions = [
      { version: "1.0.0", state: "draft", sha256: "a".repeat(64), size: 3 },
    ];
    return writeJson(response, 201, skill.versions[0]);
  }
  if (
    method === "POST" &&
    pathname.endsWith("/publish") &&
    pathname.startsWith("/aep/v1/admin/skills/")
  ) {
    const parts = pathname.split("/");
    const skill = state.skills.find((item) => item.id === parts.at(-4));
    const version = skill?.versions.find(
      (item) => item.version === parts.at(-2),
    );
    if (!version) return writeJson(response, 404, { code: "NOT_FOUND" });
    version.state = "published";
    return writeJson(response, 200, version);
  }
  if (method === "DELETE" && pathname.includes("/versions/")) {
    const parts = pathname.split("/");
    const skill = state.skills.find((item) => item.id === parts.at(-3));
    if (skill)
      skill.versions = skill.versions.filter(
        (item) => item.version !== parts.at(-1),
      );
    return response.writeHead(204).end();
  }
  if (
    method === "DELETE" &&
    pathname.startsWith("/aep/v1/admin/skills/") &&
    pathname.split("/").length === 6
  )
    return deleteRecord(response, state.skills, pathname);
  if (method === "GET" && pathname === "/aep/v1/admin/skill-assignments")
    return writeJson(response, 200, { items: state.skillAssignments });
  if (method === "POST" && pathname === "/aep/v1/admin/skill-assignments")
    return createAssignment(
      response,
      state.skillAssignments,
      jsonBody(rawBody),
      "skill",
    );
  if (
    method === "DELETE" &&
    pathname.startsWith("/aep/v1/admin/skill-assignments/")
  )
    return deleteRecord(response, state.skillAssignments, pathname);
  if (method === "GET" && pathname === "/aep/v1/admin/models")
    return writeJson(response, 200, {
      models: state.models,
      assignments: state.modelAssignments,
    });
  if (method === "POST" && pathname === "/aep/v1/admin/models")
    return createRecord(response, state.models, jsonBody(rawBody));
  if (method === "PATCH" && pathname.startsWith("/aep/v1/admin/models/"))
    return patchRecord(response, state.models, pathname, jsonBody(rawBody));
  if (method === "DELETE" && pathname.startsWith("/aep/v1/admin/models/"))
    return deleteRecord(response, state.models, pathname);
  if (method === "GET" && pathname === "/aep/v1/admin/model-assignments")
    return writeJson(response, 200, { assignments: state.modelAssignments });
  if (method === "POST" && pathname === "/aep/v1/admin/model-assignments")
    return createAssignment(
      response,
      state.modelAssignments,
      jsonBody(rawBody),
      "model",
    );
  if (
    method === "DELETE" &&
    pathname.startsWith("/aep/v1/admin/model-assignments/")
  )
    return deleteRecord(response, state.modelAssignments, pathname);
  if (method === "GET" && pathname === "/aep/v1/admin/credentials")
    return writeJson(response, 200, {
      credentials: state.credentials,
      assignments: state.credentialAssignments,
    });
  if (method === "POST" && pathname === "/aep/v1/admin/credentials") {
    const input = jsonBody(rawBody);
    const { value: _secret, ...metadata } = input;
    return createRecord(response, state.credentials, {
      ...metadata,
      id: `credential-${state.nextId++}`,
      maskedValue: "e2e-***",
      updatedAt: new Date().toISOString(),
    });
  }
  if (method === "PATCH" && pathname.startsWith("/aep/v1/admin/credentials/"))
    return patchRecord(
      response,
      state.credentials,
      pathname,
      jsonBody(rawBody),
    );
  if (
    method === "POST" &&
    pathname.startsWith("/aep/v1/admin/credentials/") &&
    pathname.endsWith("/rotate")
  ) {
    const credential = state.credentials.find(
      (item) => item.id === pathname.split("/").at(-2),
    );
    if (!credential) return writeJson(response, 404, { code: "NOT_FOUND" });
    credential.maskedValue = "e2e-rotated-***";
    credential.updatedAt = new Date().toISOString();
    return writeJson(response, 200, credential);
  }
  if (method === "DELETE" && pathname.startsWith("/aep/v1/admin/credentials/"))
    return deleteRecord(response, state.credentials, pathname);
  if (method === "GET" && pathname === "/aep/v1/admin/credential-assignments")
    return writeJson(response, 200, {
      assignments: state.credentialAssignments,
    });
  if (method === "POST" && pathname === "/aep/v1/admin/credential-assignments")
    return createAssignment(
      response,
      state.credentialAssignments,
      jsonBody(rawBody),
      "credential",
    );
  if (
    method === "DELETE" &&
    pathname.startsWith("/aep/v1/admin/credential-assignments/")
  )
    return deleteRecord(response, state.credentialAssignments, pathname);
  if (method === "GET" && pathname === "/aep/v1/admin/licenses")
    return writeJson(response, 200, {
      items: state.licenses,
      nextCursor: null,
    });
  if (method === "POST" && pathname === "/aep/v1/admin/licenses/import") {
    const license = {
      licenseId: "e2e-license",
      customerId: "e2e-customer",
      deploymentId: "demo",
      digest: "a".repeat(64),
      keyId: "e2e-key",
      status: "active",
      issuedAt: "2026-09-01T00:00:00Z",
      expiresAt: "2027-09-01T00:00:00Z",
      graceEndsAt: "2027-09-08T00:00:00Z",
      limits: { users: 10, activations: 10 },
      features: ["model_gateway"],
      activeUsers: 1,
      activeActivations: 1,
      revokedAt: null,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    };
    state.licenses.push(license);
    return writeJson(response, 201, license);
  }
  if (
    method === "POST" &&
    pathname.endsWith("/revoke") &&
    pathname.startsWith("/aep/v1/admin/licenses/")
  ) {
    const license = state.licenses.find(
      (item) => item.licenseId === pathname.split("/").at(-2),
    );
    if (!license) return writeJson(response, 404, { code: "NOT_FOUND" });
    license.status = "revoked";
    license.revokedAt = new Date().toISOString();
    return writeJson(response, 200, license);
  }
  if (method === "GET" && pathname === "/aep/v1/admin/events")
    return writeJson(response, 200, { items: [], nextCursor: null });
  if (method === "GET" && pathname === "/aep/v1/admin/control-events")
    return writeJson(response, 200, {
      items: state.controlEvents,
      nextCursor: null,
    });
  if (method === "POST" && pathname === "/aep/v1/admin/control-events") {
    const input = jsonBody(rawBody);
    const event = {
      ...input,
      eventId: `e2e-event-${state.nextId++}`,
      state: "active",
      createdAt: new Date().toISOString(),
      createdBy: "admin",
      deliverySummary: {
        pending: 1,
        received: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        expired: 0,
        superseded: 0,
      },
    };
    state.controlEvents.push(event);
    return writeJson(response, 201, event);
  }
  if (
    method === "GET" &&
    pathname.startsWith("/aep/v1/admin/control-events/") &&
    !pathname.endsWith("/deliveries")
  ) {
    const event = state.controlEvents.find(
      (item) => item.eventId === pathname.split("/").at(-1),
    );
    return event
      ? writeJson(response, 200, event)
      : writeJson(response, 404, { code: "NOT_FOUND" });
  }
  if (
    method === "POST" &&
    pathname.endsWith("/cancel") &&
    pathname.startsWith("/aep/v1/admin/control-events/")
  ) {
    const event = state.controlEvents.find(
      (item) => item.eventId === pathname.split("/").at(-2),
    );
    if (!event) return writeJson(response, 404, { code: "NOT_FOUND" });
    event.state = "cancelled";
    return writeJson(response, 200, event);
  }
  if (method === "GET" && pathname === "/aep/v1/admin/sessions")
    return writeJson(response, 200, {
      items: query.has("userId") ? state.sessions.filter(session => session.userId === query.get("userId")) : state.sessions,
      nextCursor: null,
    });
  if (method === "GET" && pathname === "/aep/v1/admin/data-plane/desired-state")
    return writeJson(response, 200, state.dataPlane.desired);
  if (
    method === "PUT" &&
    pathname === "/aep/v1/admin/data-plane/desired-state"
  ) {
    const input = jsonBody(rawBody);
    state.dataPlane.desired = {
      ...state.dataPlane.desired,
      ...input,
      publishedAt: new Date().toISOString(),
    };
    state.dataPlane.status = {
      ...state.dataPlane.status,
      observedRevision: state.dataPlane.desired.revision,
      resourceCount: state.dataPlane.desired.routes.length,
    };
    return writeJson(response, 200, state.dataPlane.desired);
  }
  if (method === "GET" && pathname === "/aep/v1/admin/data-plane/status")
    return writeJson(response, 200, state.dataPlane.status);
  if (pathname === "/aep/v1/admin/deployment/settings") {
    if (method === "GET")
      return writeJson(response, 200, deploymentSettingsPayload());
    if (method === "PUT") {
      const input = jsonBody(rawBody);
      if (Object.hasOwn(input, "modelGatewayBaseUrl")) {
        const value = input.modelGatewayBaseUrl;
        if (value !== null && (typeof value !== "string" || !/^https?:\/\//.test(value)))
          return writeJson(response, 422, {
            code: "INVALID_DEPLOYMENT_SETTINGS",
            detail: "The model gateway base URL must be an absolute http or https URL.",
          });
        state.deploymentSettings.modelGatewayOverride = value;
      }
      return writeJson(response, 200, deploymentSettingsPayload());
    }
  }
  return writeJson(response, 404, { code: "NOT_FOUND", path: pathname });
}

function deploymentSettingsPayload() {
  const override = state.deploymentSettings.modelGatewayOverride;
  const env = state.deploymentSettings.envGatewayBaseUrl;
  return {
    modelGatewayBaseUrl: {
      override,
      effectiveValue: override ?? env ?? null,
      source: override ? "override" : env ? "env" : "unset",
    },
  };
}

function createRecord(response, collection, input) {
  const record = {
    ...input,
    id: input.id ?? `record-${state.nextId++}`,
    enabled: input.enabled ?? true,
    builtIn: false,
    permissions: input.permissions ?? [],
    versions: input.versions ?? [],
  };
  collection.push(record);
  return writeJson(response, 201, record);
}

function patchRecord(response, collection, pathname, input) {
  const record = collection.find(
    (item) => item.id === pathname.split("/").at(-1),
  );
  if (!record) return writeJson(response, 404, { code: "NOT_FOUND" });
  Object.assign(record, input);
  if (input.state === "active" || input.state === "withdrawn")
    record.enabled = input.state === "active";
  return writeJson(response, 200, record);
}

function deleteRecord(response, collection, pathname) {
  const id = pathname.split("/").at(-1);
  const index = collection.findIndex((item) => item.id === id);
  if (index >= 0) collection.splice(index, 1);
  response.writeHead(204).end();
}

function createAssignment(response, collection, input, resourceType) {
  const resourceId = input[`${resourceType}Id`];
  const record = {
    id: `${resourceType}-assignment-${state.nextId++}`,
    resourceType,
    resourceId,
    [`${resourceType}Id`]: resourceId,
    subject: input.subject,
    subjectType: input.subject.type,
    subjectId: input.subject.id,
  };
  collection.push(record);
  return writeJson(response, 201, record);
}

function jsonBody(raw) {
  if (!raw || (Buffer.isBuffer(raw) && raw.length === 0)) return {};
  return JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : raw);
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function writeJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
