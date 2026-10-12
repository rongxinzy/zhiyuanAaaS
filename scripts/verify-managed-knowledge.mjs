// Live Portal acceptance. Unit tests of this runner do not constitute deployment evidence.
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { syntheticPDF } from './verify-knowledge-api.mjs';

class AcceptanceError extends Error {
  constructor(stage, code, status) {
    super(code);
    this.stage = stage;
    this.code = code;
    this.status = status;
  }
}
function ensure(condition, stage, code) {
  if (!condition) throw new AcceptanceError(stage, code);
}
const safeID = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const failure = (error) => ({
  stage: error instanceof AcceptanceError ? error.stage : 'acceptance',
  code: error instanceof AcceptanceError ? error.code : 'unexpected-error',
  ...(error instanceof AcceptanceError && error.status !== undefined ? { status: error.status } : {}),
});

export function validateManagedOptions(options) {
  let url;
  let source;
  try {
    url = new URL(options.baseURL);
    source = new URL(options.sourceURL);
  } catch {
    throw new AcceptanceError('configuration', 'valid-portal-and-synthetic-source-url-required');
  }
  ensure(
    ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
    'configuration',
    'unsafe-portal-url',
  );
  ensure(
    url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'configuration',
    'https-required-outside-loopback',
  );
  ensure(
    source.protocol === 'https:' && !source.username && !source.password && !source.hash,
    'configuration',
    'public-synthetic-source-required',
  );
  ensure(options.allowWrites === true, 'configuration', 'temporary-writes-require-opt-in');
  ensure(
    options.includeURLImport === undefined || typeof options.includeURLImport === 'boolean',
    'configuration',
    'invalid-url-import-scope',
  );
  for (const key of ['adminToken', 'userAToken', 'userBToken']) {
    ensure(
      typeof options[key] === 'string' && options[key].length > 0 && !/[\r\n;]/.test(options[key]),
      'configuration',
      `${key}-required`,
    );
  }
  // Native Admin calls use Bearer directly. Existing cookie sessions can be
  // supplied to check the compatibility path without requiring chat login.
  for (const key of ['userASession', 'userBSession']) {
    if (options[key] !== undefined)
      ensure(
        typeof options[key] === 'string' && options[key].length > 0 && !/[\r\n;]/.test(options[key]),
        'configuration',
        `invalid-${key}`,
      );
  }
  ensure(
    new Set([options.adminToken, options.userAToken, options.userBToken]).size === 3,
    'configuration',
    'three-distinct-identities-required',
  );
  for (const key of ['adminID', 'userAID', 'userBID', 'teamID', 'modelID', 'sourceMarker']) {
    ensure(safeID(options[key]), 'configuration', `${key}-required`);
  }
  ensure(options.userAID !== options.userBID, 'configuration', 'distinct-users-required');
  for (const key of ['requestTimeoutMs', 'pollTimeoutMs', 'pollIntervalMs']) {
    if (options[key] !== undefined)
      ensure(
        Number.isInteger(options[key]) && options[key] > 0 && options[key] <= 600_000,
        'configuration',
        `invalid-${key}`,
      );
  }
  return url.href.replace(/\/$/, '');
}

export async function runManagedKnowledgeAcceptance(options) {
  const importKinds = options.includeURLImport === false ? ['txt', 'pdf', 'manual'] : ['txt', 'pdf', 'manual', 'url'];
  const report = {
    schemaVersion: 1,
    mode: options.fetcher ? 'runner-contract-test' : 'live-managed-portal-http',
    passed: false,
    checks: [],
    cleanup: 'not-needed',
    fullPlanAccepted: false,
    importKinds,
    // HTTP acceptance cannot prove UI, live Agent/MCP calls, image provenance or restore drills.
    unverified: [
      'browser-interaction',
      'agent-mcp-runtime',
      'image-source-authorization',
      'backup-restore',
      'restart-recovery',
      'parse-failure-cancel',
      ...(options.includeURLImport === false ? ['url-import'] : []),
    ],
  };
  let baseURL;
  try {
    baseURL = validateManagedOptions(options);
  } catch (error) {
    report.failure = failure(error);
    return report;
  }
  const fetcher = options.fetcher ?? fetch;
  const timeout = options.requestTimeoutMs ?? 30_000;
  const pollTimeout = options.pollTimeoutMs ?? 180_000;
  const interval = options.pollIntervalMs ?? 1_000;
  const runID = randomUUID();
  const prefix = `zhiyuan-managed-acceptance-${runID}`;
  const employeeName = `kbprobe-${runID.slice(0, 20)}`;
  const owned = [];
  const uncertainBaseNames = new Set();
  let employeeCreated = false;
  let employeeCreationAttempted = false;
  const operations = [];
  const record = (stage) => report.checks.push({ stage, result: 'passed' });
  const pathBase = (id) => `/api/v1/knowledge/managed/bases/${id}`;
  const pathDoc = (id) => `/api/v1/knowledge/managed/documents/${id}`;

  async function request(
    stage,
    path,
    {
      method = 'GET',
      body,
      statuses = [200],
      user = 'admin',
      binary = false,
      expectedMIME,
      expectedMarker,
      expectedErrorCode,
      requestTimeout = timeout,
    } = {},
  ) {
    const token = user === 'a' ? options.userAToken : user === 'b' ? options.userBToken : options.adminToken;
    const session = user === 'a' ? options.userASession : user === 'b' ? options.userBSession : undefined;
    const headers = { Authorization: `Bearer ${token}` };
    if (session) headers.Cookie = `de_portal_session=${session}`;
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetcher(`${baseURL}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(requestTimeout),
      });
      if (!statuses.includes(response.status)) {
        await response.body?.cancel();
        throw new AcceptanceError(stage, 'unexpected-status', response.status);
      }
      if (response.status !== 200 && response.status !== 201 && response.status !== 202) {
        if (expectedErrorCode) {
          const error = await response.json();
          ensure(error?.error?.code === expectedErrorCode, stage, 'unexpected-error-code');
          return { status: response.status };
        }
        await response.body?.cancel();
        return { status: response.status };
      }
      if (binary) {
        ensure(
          response.headers.get('content-type')?.split(';')[0].trim() === expectedMIME,
          stage,
          'unexpected-file-type',
        );
        const reader = response.body?.getReader();
        ensure(reader, stage, 'missing-file-body');
        let size = 0;
        const parts = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            ensure(size <= 1_048_576, stage, 'synthetic-file-too-large');
            parts.push(Buffer.from(value));
          }
        } finally {
          await reader.cancel();
        }
        ensure(size > 0, stage, 'empty-file');
        ensure(
          Buffer.concat(parts).includes(Buffer.from(expectedMarker)),
          stage,
          'downloaded-synthetic-marker-missing',
        );
        return { status: response.status };
      }
      const data = await response.json();
      ensure(data && typeof data === 'object' && !Array.isArray(data), stage, 'invalid-json-envelope');
      if (typeof data.operationId === 'string' && method !== 'GET') {
        operations.push({
          operationId: data.operationId,
          expectedOutcome: stage.startsWith('import-') && response.status === 202 ? 'accepted' : 'succeeded',
        });
      }
      return { status: response.status, data };
    } catch (error) {
      if (error instanceof AcceptanceError) throw error;
      throw new AcceptanceError(stage, 'transport-or-response-failure');
    }
  }
  async function poll(stage, check) {
    const deadline = Date.now() + pollTimeout;
    while (Date.now() < deadline) {
      if (await check(Math.max(1, Math.min(timeout, deadline - Date.now())))) return;
      await delay(Math.min(interval, Math.max(1, deadline - Date.now())));
    }
    throw new AcceptanceError(stage, 'poll-timeout');
  }
  function mutation(result, stage) {
    ensure(
      typeof result.data?.operationId === 'string' && result.data.operationId.length > 0,
      stage,
      'operation-id-required',
    );
    return result.data.data;
  }
  async function grants(id, values) {
    const result = await request('replace-grants', `${pathBase(id)}/grants`, {
      method: 'PUT',
      body: { grants: values },
    });
    ensure(
      result.data.knowledge_base_id === id && Array.isArray(result.data.grants),
      'replace-grants',
      'invalid-grant-response',
    );
    const expected = values.map((value) => `${value.type}:${value.id}`).sort();
    ensure(
      JSON.stringify(result.data.grants.map((value) => `${value.type}:${value.id}`).sort()) ===
        JSON.stringify(expected),
      'replace-grants',
      'grant-readback-mismatch',
    );
  }
  async function search(id, marker, user, statuses = [200], requestTimeout = timeout) {
    return request('employee-search', `/api/v1/knowledge/employees/${employeeName}/search`, {
      user,
      method: 'POST',
      statuses,
      requestTimeout,
      body: { query: marker, knowledge_base_ids: [id], mode: 'hybrid', limit: 10 },
    });
  }
  async function parsed(id, baseID, marker, stage) {
    await poll(stage, async (requestTimeout) => {
      const result = await request(stage, pathDoc(id), { requestTimeout });
      const doc = result.data.data;
      ensure(doc?.id === id && doc.knowledge_base_id === baseID, stage, 'document-parent-mismatch');
      ensure(
        ['pending', 'processing', 'finalizing', 'completed'].includes(doc.parse_status),
        stage,
        'parse-failed-or-unknown',
      );
      return doc.parse_status === 'completed';
    });
    const chunks = await request(stage, `${pathDoc(id)}/chunks?page=1&page_size=20&chunk_type=text`);
    ensure(Array.isArray(chunks.data.data), stage, 'invalid-chunks');
    const chunk = chunks.data.data.find((item) => item.knowledge_id === id && item.content?.includes(marker));
    ensure(chunk && safeID(chunk.id), stage, 'synthetic-marker-missing-from-parsed-content');
    record(stage);
    return chunk;
  }

  try {
    const readiness = await request('readiness', '/api/v1/knowledge/managed/readiness');
    ensure(
      readiness.data.tenant === 'verified' && readiness.data.embeddingModel?.state === 'configured',
      'readiness',
      'tenant-or-model-not-configured',
    );
    record('readiness');
    for (const user of ['a', 'b']) {
      await request('user-authenticated-preflight', '/api/v1/employees', { user });
      // 401 would prove invalid credentials, not non-admin authorization.
      await request('non-admin-managed-denial', '/api/v1/knowledge/managed/bases', { user, statuses: [403] });
    }
    record('two-authenticated-non-admin-users');
    for (const type of ['document', 'faq']) {
      const name = `${prefix}-${type}`;
      uncertainBaseNames.add(name);
      const created = mutation(
        await request(`create-${type}`, '/api/v1/knowledge/managed/bases', {
          method: 'POST',
          statuses: [201],
          body: { name, description: 'Disposable synthetic managed acceptance', type },
        }),
        `create-${type}`,
      );
      ensure(safeID(created?.id), `create-${type}`, 'invalid-created-id');
      owned.push({ id: created.id, name });
      uncertainBaseNames.delete(name);
      ensure(created.name === name && created.type === type, `create-${type}`, 'created-resource-mismatch');
      record(`create-${type}`);
    }
    const documentID = owned[0].id;
    const faqID = owned[1].id;
    const documents = [];
    for (const kind of importKinds) {
      const marker = kind === 'url' ? options.sourceMarker : `managed-${kind}-${runID}`;
      let body;
      if (kind === 'txt' || kind === 'pdf') {
        body = new FormData();
        body.append(
          'file',
          new Blob([kind === 'pdf' ? syntheticPDF(marker) : `Synthetic acceptance ${marker}\n`], {
            type: kind === 'pdf' ? 'application/pdf' : 'text/plain',
          }),
          `acceptance.${kind}`,
        );
      } else {
        body =
          kind === 'url'
            ? { url: options.sourceURL, title: `${prefix}-url` }
            : { title: `${prefix}-manual`, content: `Synthetic acceptance ${marker}` };
      }
      const stage = `import-${kind}`;
      const doc = mutation(
        await request(stage, `${pathBase(documentID)}/documents/${kind === 'txt' || kind === 'pdf' ? 'file' : kind}`, {
          method: 'POST',
          statuses: [202],
          body,
        }),
        stage,
      );
      ensure(safeID(doc?.id) && doc.knowledge_base_id === documentID, stage, 'import-parent-mismatch');
      record(stage);
      const chunk = await parsed(doc.id, documentID, marker, `parse-${kind}`);
      documents.push({ id: doc.id, marker, chunk });
      const spans = await request(`spans-${kind}`, `${pathDoc(doc.id)}/spans`);
      ensure(
        spans.data.data?.knowledge_id === doc.id && spans.data.data.trace && typeof spans.data.data.trace === 'object',
        `spans-${kind}`,
        'invalid-parse-trace',
      );
      record(`spans-${kind}`);
      if (kind === 'txt' || kind === 'pdf') {
        for (const action of ['preview', 'download']) {
          await request(`${action}-${kind}`, `${pathDoc(doc.id)}/${action}`, {
            binary: true,
            expectedMIME: kind === 'pdf' ? 'application/pdf' : 'text/plain',
            expectedMarker: marker,
          });
          record(`${action}-${kind}`);
        }
      }
    }
    const primary = documents[0];
    mutation(
      await request('reparse', `${pathDoc(primary.id)}/reparse`, { method: 'POST', statuses: [202] }),
      'reparse',
    );
    await parsed(primary.id, documentID, primary.marker, 'reparse-completed');
    const tag = mutation(
      await request('create-tag', `${pathBase(documentID)}/tags`, {
        method: 'POST',
        statuses: [200, 201],
        body: { name: `${prefix}-tag`, color: '#1677ff' },
      }),
      'create-tag',
    );
    ensure(safeID(tag?.id), 'create-tag', 'invalid-tag-id');
    const tags = await request('tag-readback', `${pathBase(documentID)}/tags`);
    ensure(
      tags.data.data?.some((item) => item.id === tag.id && item.name === `${prefix}-tag`),
      'tag-readback',
      'tag-not-persisted',
    );
    await request('document-tags', `${pathBase(documentID)}/document-tags`, {
      method: 'PUT',
      body: { updates: { [primary.id]: [tag.id] } },
    });
    await request('folder-move', `${pathBase(documentID)}/folders/move`, {
      method: 'POST',
      body: { document_ids: [primary.id], folder_path: 'acceptance' },
    });
    const folders = await request('folder-readback', `${pathBase(documentID)}/folders`);
    ensure(
      folders.data.data?.folders?.some((folder) => folder.path === 'acceptance'),
      'folder-readback',
      'folder-missing',
    );
    record('tags-and-folders');
    const refreshed = await parsed(primary.id, documentID, primary.marker, 'chunk-read');
    const updated = mutation(
      await request('chunk-update', `${pathDoc(primary.id)}/chunks/${refreshed.id}`, {
        method: 'PUT',
        body: {
          content: `Synthetic acceptance ${primary.marker} revised`,
          expected_revision: refreshed.content_revision,
        },
      }),
      'chunk-update',
    );
    ensure(updated.content_revision > refreshed.content_revision, 'chunk-update', 'revision-not-increased');
    record('chunk-update');
    const faq = mutation(
      await request('create-faq-entry', `${pathBase(faqID)}/faq/entries`, {
        method: 'POST',
        body: {
          standard_question: `Synthetic ${runID}?`,
          similar_questions: [],
          negative_questions: [],
          answers: [`Synthetic answer ${runID}`],
          answer_strategy: 'all',
          is_enabled: true,
          is_recommended: false,
        },
      }),
      'create-faq-entry',
    );
    ensure(
      Number.isInteger(faq?.id) && faq.id > 0 && safeID(faq.knowledge_id) && faq.knowledge_base_id === faqID,
      'create-faq-entry',
      'faq-parent-mismatch',
    );
    const faqPage = await request('faq-readback', `${pathBase(faqID)}/faq/entries?page=1&page_size=20`);
    ensure(
      faqPage.data.data?.some((entry) => entry.id === faq.id && entry.answers?.includes(`Synthetic answer ${runID}`)),
      'faq-readback',
      'faq-not-persisted',
    );
    record('faq-create-read');
    await grants(documentID, [{ type: 'user', id: options.userAID }]);
    await grants(faqID, [{ type: 'user', id: options.userBID }]);
    employeeCreationAttempted = true;
    await request('create-temporary-employee', '/api/v1/employees', {
      method: 'POST',
      statuses: [201],
      body: {
        name: employeeName,
        displayName: prefix,
        description: 'Disposable synthetic managed acceptance',
        team: options.teamID,
        owner: options.userAID,
        models: [options.modelID],
        knowledgeBases: [documentID, faqID],
        visibility: { mode: 'restricted', users: [options.userAID, options.userBID], teams: [] },
      },
    });
    employeeCreated = true;
    for (const user of ['a', 'b'])
      await request('employee-access-preflight', `/api/v1/employees/${employeeName}`, { user });
    await request('referenced-delete-protection', pathBase(documentID), {
      method: 'DELETE',
      statuses: [409],
      expectedErrorCode: 'KNOWLEDGE_BASE_IN_USE',
    });
    record('referenced-delete-protection');
    for (const doc of documents) {
      await poll('employee-search-source', async (requestTimeout) => {
        const result = await search(documentID, doc.marker, 'a', [200], requestTimeout);
        ensure(Array.isArray(result.data.results), 'employee-search-source', 'invalid-search-response');
        return result.data.results.some(
          (hit) =>
            hit.source?.knowledge_base_id === documentID &&
            hit.source.document_id === doc.id &&
            hit.content?.includes(doc.marker),
        );
      });
      const source = await request(
        'employee-source',
        `/api/v1/knowledge/employees/${employeeName}/documents/${doc.id}?page=1&page_size=20`,
        { user: 'a' },
      );
      ensure(
        source.data.document?.id === doc.id &&
          source.data.document.knowledge_base_id === documentID &&
          source.data.chunks?.some((chunk) => chunk.content?.includes(doc.marker)),
        'employee-source',
        'source-parent-or-content-mismatch',
      );
    }
    record('employee-intersection-search-and-source');
    const toggled = mutation(
      await request('disable-document', `${pathDoc(primary.id)}/enable-status`, {
        method: 'PUT',
        body: { enabled: false },
      }),
      'disable-document',
    );
    ensure(toggled.enable_status === 'disabled', 'disable-document', 'disable-readback-mismatch');
    const disabledSearch = await search(documentID, primary.marker, 'a');
    ensure(
      disabledSearch.data.results?.every((hit) => hit.source?.document_id !== primary.id),
      'disable-document',
      'disabled-document-still-retrievable',
    );
    mutation(
      await request('enable-document', `${pathDoc(primary.id)}/enable-status`, {
        method: 'PUT',
        body: { enabled: true },
      }),
      'enable-document',
    );
    await poll('enable-document', async (requestTimeout) => {
      const result = await search(documentID, primary.marker, 'a', [200], requestTimeout);
      return result.data.results?.some((hit) => hit.source?.document_id === primary.id);
    });
    record('document-disable-and-reenable-retrieval');
    await poll('faq-employee-search', async (requestTimeout) => {
      const result = await search(faqID, runID, 'b', [200], requestTimeout);
      return result.data.results?.some(
        (hit) =>
          hit.source?.knowledge_base_id === faqID &&
          hit.source.document_id === faq.knowledge_id &&
          hit.content?.includes(runID),
      );
    });
    const faqSource = await request(
      'faq-employee-source',
      `/api/v1/knowledge/employees/${employeeName}/documents/${faq.knowledge_id}?page=1&page_size=20`,
      { user: 'b' },
    );
    ensure(
      faqSource.data.document?.knowledge_base_id === faqID &&
        faqSource.data.chunks?.some((chunk) => chunk.content?.includes(runID)),
      'faq-employee-source',
      'faq-source-marker-missing',
    );
    record('faq-employee-search-and-source');
    await search(documentID, primary.marker, 'b', [403]);
    await search(faqID, runID, 'a', [403]);
    await request(
      'cross-user-source-denial',
      `/api/v1/knowledge/employees/${employeeName}/documents/${primary.id}?page=1&page_size=20`,
      { user: 'b', statuses: [403] },
    );
    record('two-user-cross-library-denial');
    for (const action of ['preview', 'download']) {
      await request('non-admin-managed-file-denial', `${pathDoc(primary.id)}/${action}`, {
        user: 'b',
        statuses: [403],
      });
    }
    await request(
      'allowed-employee-download',
      `/api/v1/knowledge/employees/${employeeName}/documents/${primary.id}/download`,
      { user: 'a', binary: true, expectedMIME: 'text/plain', expectedMarker: primary.marker },
    );
    await request(
      'cross-user-download-denial',
      `/api/v1/knowledge/employees/${employeeName}/documents/${primary.id}/download`,
      { user: 'b', statuses: [403] },
    );
    record('controlled-file-authorization');
    await grants(documentID, [{ type: 'team', id: options.teamID }]);
    // The configured existing team must contain both disposable users.
    for (const user of ['a', 'b']) {
      const result = await search(documentID, primary.marker, user);
      ensure(
        result.data.results?.some((hit) => hit.source?.document_id === primary.id),
        'team-grant',
        'team-grant-did-not-enable-retrieval',
      );
    }
    record('team-grant-retrieval');
    await grants(documentID, []);
    for (const user of ['a', 'b']) {
      // Reuse the exact pre-revocation credentials; never authenticate again here.
      await search(documentID, primary.marker, user, [403]);
      await request(
        'revoked-old-session-source-denial',
        `/api/v1/knowledge/employees/${employeeName}/documents/${primary.id}?page=1&page_size=20`,
        { user, statuses: [403] },
      );
      await request(
        'revoked-old-session-download-denial',
        `/api/v1/knowledge/employees/${employeeName}/documents/${primary.id}/download`,
        { user, statuses: [403] },
      );
    }
    record('revoked-old-session-denial');
    // A grant does not bypass the employee's explicit knowledge whitelist.
    await grants(documentID, [{ type: 'user', id: options.userAID }]);
    await request('employee-deny-all', `/api/v1/employees/${employeeName}`, {
      method: 'PATCH',
      body: { knowledgeBases: [] },
    });
    await search(documentID, primary.marker, 'a', [403]);
    record('employee-whitelist-intersection');
    for (const operation of operations) {
      const audit = await request(
        'operation-audit',
        `/api/v1/knowledge/managed/audit?operationId=${encodeURIComponent(operation.operationId)}&limit=100`,
      );
      ensure(
        audit.data.items?.some(
          (row) =>
            row.operationId === operation.operationId &&
            row.outcome === operation.expectedOutcome &&
            row.actorUserId === options.adminID,
        ),
        'operation-audit',
        'successful-operation-audit-missing',
      );
    }
    for (const [action, resourceId, actorUserId] of [
      ['replace_grants', documentID, options.adminID],
      ['employee_search', documentID, options.userAID],
      ['employee_search', documentID, options.userBID],
      ['employee_read_source', primary.id, options.userAID],
    ]) {
      const query = new URLSearchParams({ action, resourceId, actorUserId, limit: '100' });
      const audit = await request('grant-and-retrieval-audit', `/api/v1/knowledge/managed/audit?${query}`);
      ensure(
        audit.data.items?.some(
          (row) =>
            row.action === action &&
            row.resourceId === resourceId &&
            row.actorUserId === actorUserId &&
            row.outcome === 'succeeded',
        ),
        'grant-and-retrieval-audit',
        'real-actor-audit-missing',
      );
    }
    record('persisted-operation-audit');
  } catch (error) {
    report.failure = failure(error);
  } finally {
    let cleanupFailed = false;
    const cleanupFailure = (error) => {
      cleanupFailed = true;
      report.cleanupFailures ??= [];
      report.cleanupFailures.push(failure(error));
    };
    if (employeeCreationAttempted) {
      try {
        const employee = await request('cleanup-employee', `/api/v1/employees/${employeeName}`, {
          statuses: [200, 404],
        });
        if (employee.status === 200) {
          ensure(employee.data.employee?.displayName === prefix, 'cleanup-employee', 'ownership-mismatch');
          await request('cleanup-employee', `/api/v1/employees/${employeeName}`, { method: 'DELETE' });
          await poll('cleanup-employee-verify', async (requestTimeout) => {
            const result = await request('cleanup-employee-verify', `/api/v1/employees/${employeeName}`, {
              statuses: [200, 404],
              requestTimeout,
            });
            return result.status === 404;
          });
        }
      } catch (error) {
        cleanupFailure(error);
      }
    }
    if (uncertainBaseNames.size > 0) {
      // A timed-out create may already have committed upstream. Discover only
      // exact random names attempted by this run; never broadly clean a list.
      try {
        const listed = await request('cleanup-discover', '/api/v1/knowledge/managed/bases');
        ensure(Array.isArray(listed.data.data), 'cleanup-discover', 'invalid-base-list');
        for (const name of uncertainBaseNames) {
          const matches = listed.data.data.filter((base) => base.name === name);
          ensure(
            matches.length === 1 && safeID(matches[0].id),
            'cleanup-discover',
            'uncertain-create-needs-manual-verification',
          );
          owned.push({ id: matches[0].id, name });
        }
      } catch (error) {
        cleanupFailure(error);
      }
    }
    for (const base of owned.reverse()) {
      try {
        const result = await request('cleanup-base', pathBase(base.id), { statuses: [200, 404] });
        if (result.status === 200) {
          ensure(result.data.data?.name === base.name, 'cleanup-base', 'ownership-mismatch');
          await request('cleanup-base', pathBase(base.id), { method: 'DELETE' });
        }
        // Verify deletion, rather than treating an accepted write as completed cleanup.
        await request('cleanup-base-verify', pathBase(base.id), { statuses: [404] });
      } catch (error) {
        cleanupFailure(error);
      }
    }
    report.cleanup = cleanupFailed ? 'failed' : owned.length > 0 || employeeCreated ? 'passed' : 'not-needed';
    if (cleanupFailed)
      report.remainingTemporaryResources = {
        baseIDs: owned.map((base) => base.id),
        ...(employeeCreationAttempted ? { employeeName } : {}),
        ...(uncertainBaseNames.size ? { uncertainBaseNames: [...uncertainBaseNames] } : {}),
      };
  }
  report.passed = !report.failure && report.cleanup === 'passed';
  return report;
}

export async function main(env = process.env) {
  const report = await runManagedKnowledgeAcceptance({
    baseURL: env.ZHIYUAN_MANAGED_PORTAL_URL,
    adminToken: env.ZHIYUAN_MANAGED_ADMIN_TOKEN,
    adminID: env.ZHIYUAN_MANAGED_ADMIN_ID,
    userAToken: env.ZHIYUAN_MANAGED_USER_A_TOKEN,
    userBToken: env.ZHIYUAN_MANAGED_USER_B_TOKEN,
    userASession: env.ZHIYUAN_MANAGED_USER_A_SESSION,
    userBSession: env.ZHIYUAN_MANAGED_USER_B_SESSION,
    userAID: env.ZHIYUAN_MANAGED_USER_A_ID,
    userBID: env.ZHIYUAN_MANAGED_USER_B_ID,
    teamID: env.ZHIYUAN_MANAGED_TEAM_ID,
    modelID: env.ZHIYUAN_MANAGED_MODEL_ID,
    sourceURL: env.ZHIYUAN_MANAGED_SYNTHETIC_SOURCE_URL,
    sourceMarker: env.ZHIYUAN_MANAGED_SYNTHETIC_SOURCE_MARKER,
    includeURLImport: env.ZHIYUAN_MANAGED_SKIP_URL_IMPORT !== '1',
    allowWrites: env.ZHIYUAN_MANAGED_ALLOW_TEMPORARY_WRITES === '1',
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
