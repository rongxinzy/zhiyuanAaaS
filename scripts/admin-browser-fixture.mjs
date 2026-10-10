import http from 'node:http';

// Deterministic test-only API fixtures; never loaded by the admin application.
export const state = {
  users: [
    {
      id: 'admin-1',
      username: 'admin',
      displayName: '管理员',
      email: null,
      status: 'active',
      roleIds: ['admin'],
      teamIds: [],
    },
    {
      id: 'user-1',
      username: 'zhang',
      displayName: '张三',
      email: null,
      status: 'active',
      roleIds: ['member'],
      teamIds: ['sales-dept'],
    },
  ],
  teams: [],
  roles: [{ id: 'member', name: '企业成员', enabled: true, builtIn: true, permissions: [] }],
  skills: [],
  skillAssignments: [],
  models: [],
  gateway: { rules: [], revision: null, quota: 1000, inference: [], queries: [], details: [] },
  modelAssignments: [],
  credentials: [],
  credentialAssignments: [],
  licenses: [],
  controlEvents: [],
  employees: [
    {
      name: 'sales-helper',
      displayName: 'E2E 销售助理',
      ownerId: 'admin-1',
      owner: '管理员',
      model: 'model-1',
      phase: 'Ready',
      runtime: 'deerflow',
      memoryUser: 'sales-helper',
      createdAt: '2026-09-29T00:00:00Z',
      channels: { wecom: true, wecomName: 'E2E 企业微信' },
      accessReason: { kind: 'all' },
    },
  ],
  // The portal session identity switches with the login username ("zhang"
  // is a regular member); the admin flows stay the default.
  sessionUserId: 'admin-1',
  // Workbench-visible requests (own-requests view), separate from the
  // admin approval queue so the console flows keep their fixture shape.
  workbenchRequests: [
    {
      id: 'req-wb-seed',
      employeeName: 'sales-data-assistant',
      ownerId: 'user-1',
      owner: '张三',
      displayName: '销售数据助理',
      state: 'pending',
      reason: '',
      createdAt: '2026-10-08T02:00:00Z',
      deploy: { exists: false, phase: '' },
    },
  ],
  employeeRequests: [],
  identitySources: [],
  identityMappings: [],
  sessions: [
    {
      sessionId: 'session-1',
      userId: 'admin-1',
      topic: 'desktop',
      createdAt: '2026-09-29T00:00:00Z',
      lastSeenAt: '2026-09-29T01:00:00Z',
    },
  ],
  dataPlane: {
    desired: {
      deploymentId: 'demo',
      revision: 'rev-1',
      routes: [],
      publishedAt: null,
      contentHash: '',
    },
    status: {
      state: 'ready',
      observedRevision: 'rev-1',
      contentHash: '',
      lastAppliedAt: null,
      resourceCount: 0,
    },
  },
  deploymentSettings: {
    modelGatewayOverride: null,
    envGatewayBaseUrl: 'https://gateway.example.test/v1',
  },
  requests: [],
  failNext: null,
  nextId: 1,
};

export function createAdminFixture() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const body = await readBody(request);
    state.requests.push({ method: request.method ?? '', path: url.pathname });
    try {
      await route(request.method ?? 'GET', url.pathname, body, response, url.searchParams);
    } catch (error) {
      writeJson(response, 500, { code: 'MOCK_FAILURE', detail: String(error) });
    }
  });
}

async function route(method, pathname, rawBody, response, query) {
  if (state.failNext === `${method} ${pathname}`) {
    state.failNext = null;
    return writeJson(response, 503, { code: 'TEST_FAILURE', detail: 'Temporary test failure' });
  }
  const gatewayPrefix = '/aep/v1/admin/model-gateway';
  if (pathname.startsWith(gatewayPrefix)) {
    const suffix = pathname.slice(gatewayPrefix.length);
    if (method === 'GET' && suffix === '/capabilities')
      return writeJson(response, 200, {
        sources: { prometheus: true, loki: true, quota: true, testAccess: true },
        dimensions: ['model', 'user', 'team', 'role'],
        metrics: [
          'calls',
          'failures',
          'input_tokens',
          'output_tokens',
          'first_token_duration',
          'service_duration',
          'downstream_qps',
          'upstream_qps',
          'downstream_success_rate',
          'upstream_success_rate',
          'auth_requests',
        ],
        unsupported: ['cost', 'p95', 'p99'],
      });
    if (method === 'GET' && suffix === '/health')
      return writeJson(response, 200, {
        sources: ['prometheus', 'loki', 'quota'].map((source) => ({
          source,
          state: 'healthy',
          checkedAt: new Date().toISOString(),
          targets: [],
        })),
      });
    if (method === 'GET' && suffix === '/metrics') {
      const input = Object.fromEntries(query);
      state.gateway.queries.push(input);
      const group = query.get('groupBy');
      const groupId =
        group === 'user'
          ? state.users[0].id
          : group === 'team'
            ? state.teams[0]?.id
            : group === 'role'
              ? state.roles[0]?.id
              : group === 'model'
                ? state.models[0]?.id
                : null;
      const metric = query.get('metric');
      const value = metric === 'failures' ? '2' : metric?.includes('success_rate') ? '0.99' : '23';
      return writeJson(response, 200, {
        source: 'prometheus',
        queriedAt: new Date().toISOString(),
        definition: {
          id: metric,
          unit: metric?.includes('success_rate') ? 'ratio' : 'requests',
          aggregation: 'counter_increase',
          windowSeconds: Number(query.get('step')),
          groupBy: group,
          modelDimension: 'not_applicable',
        },
        data: {
          status: 'success',
          data: {
            resultType: 'matrix',
            result: [
              {
                metric: groupId ? { [`${group}_id`]: groupId } : {},
                values: [
                  [Date.now() / 1000 - 120, '11'],
                  [Date.now() / 1000 - 60, 'NaN'],
                  [Date.now() / 1000, value],
                ],
              },
            ],
          },
        },
      });
    }
    if (method === 'GET' && (suffix === '/requests' || suffix.startsWith('/requests/'))) {
      if (suffix !== '/requests') state.gateway.details.push(suffix);
      return writeJson(response, 200, {
        source: 'loki',
        queriedAt: new Date().toISOString(),
        data: {
          status: 'success',
          data: {
            resultType: 'streams',
            result: [
              {
                stream: { aep_source: 'gateway' },
                values: [
                  [
                    '1800000000000000000',
                    JSON.stringify({
                      request_id: 'gateway-e2e-r1',
                      model_id: state.models[0]?.id ?? '',
                      user_id: state.users[0].id,
                      team_ids: '',
                      role_ids: '',
                      status: '503',
                      input_token: '17',
                      output_token: '3',
                      response_flags: 'UF',
                      llm_service_duration: '12',
                      llm_first_token_duration: '5',
                    }),
                  ],
                ],
              },
            ],
          },
        },
      });
    }
    if (method === 'GET' && suffix === '/limits') return writeJson(response, 200, { items: state.gateway.rules });
    if (method === 'GET' && suffix === '/limits/status')
      return writeJson(response, 200, {
        state: state.gateway.revision ? 'applied' : 'unpublished',
        revision: state.gateway.revision,
        runtimeVerified: false,
      });
    if (method === 'POST' && suffix === '/limits/publish') {
      state.gateway.revision = 'gateway-e2e-rev';
      return writeJson(response, 200, {
        revision: state.gateway.revision,
        publishedAt: new Date().toISOString(),
        items: state.gateway.rules,
      });
    }
    if (method === 'PUT' && suffix.startsWith('/limits/')) {
      const id = decodeURIComponent(suffix.slice('/limits/'.length));
      const input = jsonBody(rawBody);
      const existing = state.gateway.rules.find((item) => item.id === id);
      if ((existing?.version ?? 0) !== input.expectedVersion)
        return writeJson(response, 409, { code: 'VERSION_CONFLICT' });
      const saved = {
        id,
        version: (existing?.version ?? 0) + 1,
        configuration: input,
        updatedAt: new Date().toISOString(),
      };
      state.gateway.rules = [...state.gateway.rules.filter((item) => item.id !== id), saved];
      return writeJson(response, 200, saved);
    }
    if (method === 'DELETE' && suffix.startsWith('/limits/')) {
      const id = decodeURIComponent(suffix.slice('/limits/'.length));
      const existing = state.gateway.rules.find((item) => item.id === id);
      if (existing?.version !== Number(query.get('expectedVersion')))
        return writeJson(response, 409, { code: 'VERSION_CONFLICT' });
      state.gateway.rules = state.gateway.rules.filter((item) => item.id !== id);
      response.writeHead(204);
      response.end();
      return;
    }
    if (suffix.startsWith('/quotas/')) {
      if (method === 'POST') {
        const input = jsonBody(rawBody);
        state.gateway.quota = suffix.endsWith('/refresh') ? input.quota : state.gateway.quota + input.value;
      }
      return writeJson(response, 200, { consumer: 'aep.demo.admin', quota: state.gateway.quota });
    }
    if (method === 'POST' && suffix.endsWith('/test-access')) {
      const id = decodeURIComponent(suffix.split('/')[2]);
      const model = state.models.find((item) => item.id === id);
      return writeJson(response, 200, {
        modelId: id,
        protocol: model.protocol,
        baseUrl: model.protocol === 'anthropic' ? `http://gateway.test/${id}` : 'http://gateway.test/v1',
        path: model.protocol === 'anthropic' ? '/v1/messages' : '/chat/completions',
        modelAccessToken: 'e2e-disposable-model-token',
        expiresAt: new Date(Date.now() + 120000).toISOString(),
      });
    }
  }
  if (method === 'POST' && (pathname === '/v1/chat/completions' || pathname.endsWith('/v1/messages'))) {
    const input = jsonBody(rawBody);
    state.gateway.inference.push(input);
    if (input.stream) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Request-ID': 'e2e-model-call' });
      response.write('data: {"choices":[{"delta":{"content":"fixture-stream"}}]}\n\n');
      response.end('data: [DONE]\n\n');
      return;
    }
    return writeJson(response, 200, { choices: [{ message: { content: 'fixture-json' } }] });
  }
  if (method === 'GET' && pathname === '/api/v1/employees')
    return writeJson(response, 200, { employees: state.employees });
  if (method === 'POST' && pathname === '/api/v1/employees') {
    const input = jsonBody(rawBody);
    if (state.employees.some((employee) => employee.name === input.name))
      return writeJson(response, 409, { error: '名称已存在' });
    // Regular users park for approval (the workbench submitted page); the
    // admin console keeps its direct-create 201.
    if (state.sessionUserId !== 'admin-1') {
      const parked = {
        id: `req-wb-${state.nextId++}`,
        employeeName: input.name,
        ownerId: state.sessionUserId,
        owner: sessionUser().displayName,
        displayName: input.displayName ?? input.name,
        state: 'pending',
        reason: '',
        createdAt: new Date().toISOString(),
        deploy: { exists: false, phase: '' },
        // Round-trip the applicant's own fields so the detail page proves
        // the apply payload traveled (not a fixture constant).
        description: input.description ?? '',
        team: input.team ?? '',
        note: input.note ?? '',
      };
      state.workbenchRequests.push(parked);
      return writeJson(response, 202, {
        request: { id: parked.id, state: 'pending', employeeName: input.name },
        policy: 'policy mode approval: request parked for administrator approval',
      });
    }
    state.employees.push({
      ...input,
      phase: 'Pending',
      ownerId: 'admin-1',
      owner: '管理员',
      model: '',
      runtime: 'deerflow',
      memoryUser: input.name,
      createdAt: new Date().toISOString(),
    });
    return writeJson(response, 201, { message: '已创建，等待部署' });
  }
  if (method === 'GET' && pathname === '/api/v1/me') {
    const user = sessionUser();
    return writeJson(response, 200, {
      user: { id: user.id, displayName: user.displayName, kind: 'human' },
      teams: [{ id: 'sales-dept', name: '销售团队' }],
      quota: { limit: 2, used: 0, owned: 0, pending: 0 },
      policyMode: 'approval',
      defaultModel: 'bench-glm',
    });
  }
  if (method === 'GET' && pathname === '/api/v1/requests/mine') {
    const stateFilter = query.get('state');
    const mine = state.workbenchRequests.filter(
      (item) =>
        item.ownerId === state.sessionUserId && (!stateFilter || stateFilter === 'all' || item.state === stateFilter),
    );
    return writeJson(response, 200, { requests: mine });
  }
  if (method === 'GET' && pathname.startsWith('/api/v1/requests/')) {
    const id = decodeURIComponent(pathname.slice('/api/v1/requests/'.length));
    const parked = state.workbenchRequests.find((item) => item.id === id);
    if (!parked) return writeJson(response, 404, { error: `request ${id} not found` });
    return writeJson(response, 200, {
      request: {
        ...parked,
        decidedAt: null,
        decidedBy: '',
        decidedByName: '',
        description: parked.description || '整理团队销售数据，辅助制作周报。',
        teamId: parked.team || 'sales-dept',
        teamName: '销售团队',
        note: parked.note || '',
        model: 'bench-glm',
      },
    });
  }
  if (method === 'GET' && pathname === '/api/v1/requests')
    return writeJson(response, 200, { requests: state.employeeRequests });
  if (method === 'GET' && pathname === '/api/v1/knowledge/status')
    return writeJson(response, 200, {
      configured: true,
      healthy: true,
      url: 'https://knowledge.example.test',
      knowledgeBases: [
        {
          id: 'kb-1',
          name: 'E2E 产品资料',
          description: '测试知识库',
          documentCount: 5,
        },
      ],
    });
  if (method === 'GET' && pathname === '/api/v1/memory/status')
    return writeJson(response, 200, {
      healthy: true,
      server: 'memory-service',
      account: 'enterprise',
      accounts: [],
      employees: [
        {
          name: 'sales-helper',
          memoryUser: 'sales-helper',
          sessions: 2,
          lastActive: '2026-09-29T01:00:00Z',
        },
      ],
    });
  if (method === 'POST' && pathname === '/api/v1/memory/search') return writeJson(response, 200, { memories: [] });
  if (method === 'GET' && pathname === '/aep/v1/admin/identity-sources')
    return writeJson(response, 200, {
      items: state.identitySources,
      nextCursor: null,
    });
  if (method === 'POST' && pathname === '/aep/v1/admin/identity-sources') {
    const source = { ...jsonBody(rawBody), enabled: true };
    state.identitySources.push(source);
    return writeJson(response, 201, source);
  }
  if (pathname.startsWith('/aep/v1/admin/identity-sources/') && pathname.endsWith('/mappings')) {
    const sourceId = pathname.split('/').at(-2);
    if (method === 'GET')
      return writeJson(response, 200, {
        items: state.identityMappings.filter((item) => item.sourceId === sourceId),
        nextCursor: null,
      });
    if (method === 'PUT') {
      const mapping = { ...jsonBody(rawBody), sourceId, status: 'active' };
      state.identityMappings = state.identityMappings.filter(
        (item) => !(item.sourceId === sourceId && item.externalId === mapping.externalId),
      );
      state.identityMappings.push(mapping);
      return writeJson(response, 200, mapping);
    }
  }
  if (method === 'GET' && pathname === '/aep/v1/metadata')
    return writeJson(response, 200, {
      service: 'zhiyuan-aep',
      supportedProtocolVersions: ['1.0'],
      capabilities: [],
      jwksUri: '/.well-known/jwks.json',
      deploymentId: 'demo',
      deployment: { id: 'demo', name: '演示部署' },
    });
  if (method === 'POST' && pathname === '/aep/v1/auth/logout') return writeJson(response, 200, {});
  if (method === 'POST' && pathname.endsWith('/revoke') && pathname.startsWith('/aep/v1/admin/sessions/')) {
    const session = state.sessions.find((item) => item.sessionId === pathname.split('/').at(-2));
    if (session) session.revokedAt = new Date().toISOString();
    return writeJson(response, 200, {});
  }
  if (pathname === '/aep/v1/auth/password/login' && method === 'POST') {
    // The session identity follows the username (zhang = regular member);
    // everything else falls back to the admin.
    const input = jsonBody(rawBody);
    state.sessionUserId = state.users.find((user) => user.username === input.username)?.id ?? 'admin-1';
    return writeJson(response, 200, {
      accessToken: 'e2e-access',
      refreshToken: 'e2e-refresh',
      modelAccessToken: 'e2e-model',
      tokenType: 'Bearer',
      expiresIn: 3600,
      modelAccessExpiresIn: 3600,
      deploymentId: 'demo',
      sessionId: 'e2e-session',
      passwordChangeRequired: false,
    });
  }
  if (pathname === '/aep/v1/auth/refresh' && method === 'POST') {
    return writeJson(response, 200, {
      accessToken: 'e2e-access',
      refreshToken: 'e2e-refresh',
      modelAccessToken: 'e2e-model',
      tokenType: 'Bearer',
      expiresIn: 3600,
      modelAccessExpiresIn: 3600,
      deploymentId: 'demo',
      sessionId: 'e2e-session',
      passwordChangeRequired: false,
    });
  }
  if (pathname === '/aep/v1/user/me' && method === 'GET') {
    const user = sessionUser();
    return writeJson(response, 200, {
      user: { id: user.id, displayName: user.displayName, email: user.email ?? null, teamIds: user.teamIds ?? [] },
      deployment: { id: 'demo', name: '演示部署' },
      deploymentId: 'demo',
      sessionId: 'e2e-session',
      roles: user.roleIds ?? [],
      permissions: [],
      sessionExpiresAt: '2027-01-01T00:00:00Z',
      passwordChangeRequired: false,
    });
  }
  if (method === 'GET' && pathname === '/aep/v1/admin/users')
    return writeJson(response, 200, { items: state.users, nextCursor: null });
  if (method === 'POST' && pathname === '/aep/v1/admin/users') {
    const input = jsonBody(rawBody);
    const user = {
      id: `user-${state.nextId++}`,
      username: input.username,
      displayName: input.displayName,
      email: input.email ?? null,
      status: 'active',
      roleIds: input.roleIds ?? [],
      teamIds: input.teamIds ?? [],
    };
    state.users.push(user);
    return writeJson(response, 201, user);
  }
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/users/')) {
    const user = state.users.find((item) => item.id === pathname.split('/').at(-1));
    Object.assign(user ?? {}, jsonBody(rawBody));
    return writeJson(response, 200, user);
  }
  if (method === 'PUT' && pathname.startsWith('/aep/v1/admin/users/') && pathname.endsWith('/rbac')) {
    const user = state.users.find((item) => item.id === pathname.split('/').at(-2));
    const input = jsonBody(rawBody);
    if (user)
      Object.assign(user, {
        roleIds: input.roleIds ?? [],
        teamIds: input.teamIds ?? [],
      });
    return writeJson(response, 200, input);
  }
  if (method === 'GET' && pathname === '/aep/v1/admin/teams') return writeJson(response, 200, { teams: state.teams });
  if (method === 'POST' && pathname === '/aep/v1/admin/teams')
    return createRecord(response, state.teams, jsonBody(rawBody));
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/teams/'))
    return patchRecord(response, state.teams, pathname, jsonBody(rawBody));
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/teams/'))
    return deleteRecord(response, state.teams, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/roles')
    return writeJson(response, 200, { roles: state.roles, permissions: [] });
  if (method === 'POST' && pathname === '/aep/v1/admin/roles')
    return createRecord(response, state.roles, jsonBody(rawBody));
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/roles/'))
    return patchRecord(response, state.roles, pathname, jsonBody(rawBody));
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/roles/'))
    return deleteRecord(response, state.roles, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/permissions')
    return writeJson(response, 200, { permissions: [] });
  if (method === 'GET' && pathname === '/aep/v1/admin/skills')
    return writeJson(response, 200, { skills: state.skills });
  if (method === 'POST' && pathname === '/aep/v1/admin/skills')
    return createRecord(response, state.skills, {
      ...jsonBody(rawBody),
      state: 'active',
      enabled: true,
      versions: [],
    });
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/skills/'))
    return patchRecord(response, state.skills, pathname, jsonBody(rawBody));
  if (method === 'POST' && pathname.endsWith('/versions') && pathname.startsWith('/aep/v1/admin/skills/')) {
    const skill = state.skills.find((item) => item.id === pathname.split('/').at(-2));
    if (!skill) return writeJson(response, 404, { code: 'NOT_FOUND' });
    skill.versions = [{ version: '1.0.0', state: 'draft', sha256: 'a'.repeat(64), size: 3 }];
    return writeJson(response, 201, skill.versions[0]);
  }
  if (method === 'POST' && pathname.endsWith('/publish') && pathname.startsWith('/aep/v1/admin/skills/')) {
    const parts = pathname.split('/');
    const skill = state.skills.find((item) => item.id === parts.at(-4));
    const version = skill?.versions.find((item) => item.version === parts.at(-2));
    if (!version) return writeJson(response, 404, { code: 'NOT_FOUND' });
    version.state = 'published';
    return writeJson(response, 200, version);
  }
  if (method === 'DELETE' && pathname.includes('/versions/')) {
    const parts = pathname.split('/');
    const skill = state.skills.find((item) => item.id === parts.at(-3));
    if (skill) skill.versions = skill.versions.filter((item) => item.version !== parts.at(-1));
    return response.writeHead(204).end();
  }
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/skills/') && pathname.split('/').length === 6)
    return deleteRecord(response, state.skills, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/skill-assignments')
    return writeJson(response, 200, { items: state.skillAssignments });
  if (method === 'POST' && pathname === '/aep/v1/admin/skill-assignments')
    return createAssignment(response, state.skillAssignments, jsonBody(rawBody), 'skill');
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/skill-assignments/'))
    return deleteRecord(response, state.skillAssignments, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/models')
    return writeJson(response, 200, {
      models: state.models,
      assignments: state.modelAssignments,
    });
  if (method === 'POST' && pathname === '/aep/v1/admin/models')
    return createRecord(response, state.models, jsonBody(rawBody));
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/models/'))
    return patchRecord(response, state.models, pathname, jsonBody(rawBody));
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/models/'))
    return deleteRecord(response, state.models, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/model-assignments')
    return writeJson(response, 200, { assignments: state.modelAssignments });
  if (method === 'POST' && pathname === '/aep/v1/admin/model-assignments')
    return createAssignment(response, state.modelAssignments, jsonBody(rawBody), 'model');
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/model-assignments/'))
    return deleteRecord(response, state.modelAssignments, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/credentials')
    return writeJson(response, 200, {
      credentials: state.credentials,
      assignments: state.credentialAssignments,
    });
  if (method === 'POST' && pathname === '/aep/v1/admin/credentials') {
    const input = jsonBody(rawBody);
    const { value: _secret, ...metadata } = input;
    return createRecord(response, state.credentials, {
      ...metadata,
      id: `credential-${state.nextId++}`,
      maskedValue: 'e2e-***',
      updatedAt: new Date().toISOString(),
    });
  }
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/credentials/'))
    return patchRecord(response, state.credentials, pathname, jsonBody(rawBody));
  if (method === 'POST' && pathname.startsWith('/aep/v1/admin/credentials/') && pathname.endsWith('/rotate')) {
    const credential = state.credentials.find((item) => item.id === pathname.split('/').at(-2));
    if (!credential) return writeJson(response, 404, { code: 'NOT_FOUND' });
    credential.maskedValue = 'e2e-rotated-***';
    credential.updatedAt = new Date().toISOString();
    return writeJson(response, 200, credential);
  }
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/credentials/'))
    return deleteRecord(response, state.credentials, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/credential-assignments')
    return writeJson(response, 200, {
      assignments: state.credentialAssignments,
    });
  if (method === 'POST' && pathname === '/aep/v1/admin/credential-assignments')
    return createAssignment(response, state.credentialAssignments, jsonBody(rawBody), 'credential');
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/credential-assignments/'))
    return deleteRecord(response, state.credentialAssignments, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/licenses')
    return writeJson(response, 200, {
      items: state.licenses,
      nextCursor: null,
    });
  if (method === 'POST' && pathname === '/aep/v1/admin/licenses/import') {
    const license = {
      licenseId: 'e2e-license',
      customerId: 'e2e-customer',
      deploymentId: 'demo',
      digest: 'a'.repeat(64),
      keyId: 'e2e-key',
      status: 'active',
      issuedAt: '2026-09-01T00:00:00Z',
      expiresAt: '2027-09-01T00:00:00Z',
      graceEndsAt: '2027-09-08T00:00:00Z',
      limits: { users: 10, activations: 10 },
      features: ['model_gateway'],
      activeUsers: 1,
      activeActivations: 1,
      revokedAt: null,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    };
    state.licenses.push(license);
    return writeJson(response, 201, license);
  }
  if (method === 'POST' && pathname.endsWith('/revoke') && pathname.startsWith('/aep/v1/admin/licenses/')) {
    const license = state.licenses.find((item) => item.licenseId === pathname.split('/').at(-2));
    if (!license) return writeJson(response, 404, { code: 'NOT_FOUND' });
    license.status = 'revoked';
    license.revokedAt = new Date().toISOString();
    return writeJson(response, 200, license);
  }
  if (method === 'GET' && pathname === '/aep/v1/admin/events')
    return writeJson(response, 200, { items: [], nextCursor: null });
  if (method === 'GET' && pathname === '/aep/v1/admin/control-events')
    return writeJson(response, 200, {
      items: state.controlEvents,
      nextCursor: null,
    });
  if (method === 'POST' && pathname === '/aep/v1/admin/control-events') {
    const input = jsonBody(rawBody);
    const event = {
      ...input,
      eventId: `e2e-event-${state.nextId++}`,
      state: 'active',
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
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
  if (method === 'GET' && pathname.startsWith('/aep/v1/admin/control-events/') && !pathname.endsWith('/deliveries')) {
    const event = state.controlEvents.find((item) => item.eventId === pathname.split('/').at(-1));
    return event ? writeJson(response, 200, event) : writeJson(response, 404, { code: 'NOT_FOUND' });
  }
  if (method === 'POST' && pathname.endsWith('/cancel') && pathname.startsWith('/aep/v1/admin/control-events/')) {
    const event = state.controlEvents.find((item) => item.eventId === pathname.split('/').at(-2));
    if (!event) return writeJson(response, 404, { code: 'NOT_FOUND' });
    event.state = 'cancelled';
    return writeJson(response, 200, event);
  }
  if (method === 'GET' && pathname === '/aep/v1/admin/sessions')
    return writeJson(response, 200, {
      items: query.has('userId')
        ? state.sessions.filter((session) => session.userId === query.get('userId'))
        : state.sessions,
      nextCursor: null,
    });
  if (method === 'GET' && pathname === '/aep/v1/admin/data-plane/desired-state')
    return writeJson(response, 200, state.dataPlane.desired);
  if (method === 'PUT' && pathname === '/aep/v1/admin/data-plane/desired-state') {
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
  if (method === 'GET' && pathname === '/aep/v1/admin/data-plane/status')
    return writeJson(response, 200, {
      ...state.dataPlane.status,
      catalogComparison: computeCatalogComparison(),
    });
  if (method === 'POST' && pathname === '/aep/v1/admin/data-plane/publish') {
    // Mirror the server contract: derive routes from the model catalog
    // (enabled models with a complete gateway mapping) and atomically
    // replace the desired state; unchanged catalogs are a no-op.
    const routes = state.models
      .filter((model) => model.enabled !== false && model.endpoint && model.upstreamModel)
      .map((model) => ({
        modelId: model.id,
        enabled: true,
        endpoint: model.endpoint,
        upstreamModel: model.upstreamModel,
        protocol: 'openai-compatible',
      }));
    const derived = JSON.stringify(routes);
    const current = JSON.stringify(state.dataPlane.desired.routes);
    if (derived !== current || !state.dataPlane.desired.revision.startsWith('catalog-')) {
      state.dataPlane.desired = {
        deploymentId: 'demo',
        revision: `catalog-${state.nextId++}`,
        routes,
        publishedAt: new Date().toISOString(),
        contentHash: '',
      };
      state.dataPlane.status = {
        ...state.dataPlane.status,
        state: 'pending',
        observedRevision: null,
        resourceCount: routes.length,
      };
    }
    return writeJson(response, 200, state.dataPlane.desired);
  }
  if (pathname === '/aep/v1/admin/deployment/settings') {
    if (method === 'GET') return writeJson(response, 200, deploymentSettingsPayload());
    if (method === 'PUT') {
      const input = jsonBody(rawBody);
      if (Object.hasOwn(input, 'modelGatewayBaseUrl')) {
        const value = input.modelGatewayBaseUrl;
        if (value !== null && (typeof value !== 'string' || !/^https?:\/\//.test(value)))
          return writeJson(response, 422, {
            code: 'INVALID_DEPLOYMENT_SETTINGS',
            detail: 'The model gateway base URL must be an absolute http or https URL.',
          });
        state.deploymentSettings.modelGatewayOverride = value;
      }
      return writeJson(response, 200, deploymentSettingsPayload());
    }
  }
  return writeJson(response, 404, { code: 'NOT_FOUND', path: pathname });
}

function deploymentSettingsPayload() {
  const override = state.deploymentSettings.modelGatewayOverride;
  const env = state.deploymentSettings.envGatewayBaseUrl;
  return {
    modelGatewayBaseUrl: {
      override,
      effectiveValue: override ?? env ?? null,
      source: override ? 'override' : env ? 'env' : 'unset',
    },
  };
}

function computeCatalogComparison() {
  const publishable = state.models.filter((model) => model.enabled !== false && model.endpoint && model.upstreamModel);
  const desiredIds = new Set(state.dataPlane.desired.routes.map((route) => route.modelId));
  const publishableIds = new Set(publishable.map((model) => model.id));
  return {
    missing: publishable.filter((model) => !desiredIds.has(model.id)).map((model) => model.id),
    extra: state.dataPlane.desired.routes
      .filter((route) => !publishableIds.has(route.modelId))
      .map((route) => route.modelId),
    mismatched: [],
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
  const record = collection.find((item) => item.id === pathname.split('/').at(-1));
  if (!record) return writeJson(response, 404, { code: 'NOT_FOUND' });
  Object.assign(record, input);
  if (input.state === 'active' || input.state === 'withdrawn') record.enabled = input.state === 'active';
  return writeJson(response, 200, record);
}

function deleteRecord(response, collection, pathname) {
  const id = pathname.split('/').at(-1);
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
  return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
}

function sessionUser() {
  return state.users.find((user) => user.id === state.sessionUserId) ?? state.users[0];
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function writeJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}
