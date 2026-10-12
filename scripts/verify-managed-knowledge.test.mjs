import { describe, expect, it } from 'vitest';
import { runManagedKnowledgeAcceptance, validateManagedOptions } from './verify-managed-knowledge.mjs';

const options = {
  baseURL: 'http://127.0.0.1:9876',
  sourceURL: 'https://example.org/synthetic.txt',
  sourceMarker: 'synthetic-url-marker',
  adminToken: 'synthetic-admin',
  userAToken: 'synthetic-user-a',
  userBToken: 'synthetic-user-b',
  userASession: 'synthetic-session-a',
  userBSession: 'synthetic-session-b',
  adminID: 'admin-a',
  userAID: 'user-a',
  userBID: 'user-b',
  teamID: 'team-a',
  modelID: 'model-a',
  allowWrites: true,
  pollTimeoutMs: 100,
  pollIntervalMs: 1,
};

// This server-shaped transport verifies runner behavior only. It is expressly
// labeled runner-contract-test and never used as deployment acceptance evidence.
function transport({
  ownershipMismatch = false,
  unauthenticatedDenial = false,
  brokenParse = false,
  failAudit = false,
  unknownCreate = false,
} = {}) {
  const bases = new Map();
  const docs = new Map();
  const grantSets = new Map();
  const mutations = [];
  let employee;
  let whitelist;
  let tag;
  let faq;
  let sequence = 0;
  const response = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const mutation = (data, status = 200, outcome = status === 202 ? 'accepted' : 'succeeded') => {
    const operationId = `operation-${++sequence}`;
    mutations.push({ operationId, outcome });
    return response({ data, operationId }, status);
  };
  const calls = [];
  const fetcher = async (url, init) => {
    const { pathname: path, searchParams } = new URL(url);
    calls.push({ path, method: init.method, authorization: init.headers.Authorization, cookie: init.headers.Cookie });
    const user =
      init.headers.Authorization === `Bearer ${options.userAToken}`
        ? 'a'
        : init.headers.Authorization === `Bearer ${options.userBToken}`
          ? 'b'
          : 'admin';
    const body = init.body instanceof FormData ? init.body : init.body ? JSON.parse(init.body) : undefined;
    if (path.endsWith('/readiness')) return response({ tenant: 'verified', embeddingModel: { state: 'configured' } });
    if (path === '/api/v1/employees') {
      if (init.method === 'GET') return response({ employees: [] });
      employee = body;
      whitelist = body.knowledgeBases;
      return response({ message: 'created' }, 201);
    }
    if (path.startsWith('/api/v1/employees/')) {
      if (init.method === 'PATCH') {
        whitelist = body.knowledgeBases;
        return response({ updated: true });
      }
      if (init.method === 'DELETE') {
        employee = undefined;
        return response({ deleted: true });
      }
      if (!employee) return response({}, 404);
      return response({ employee: { displayName: ownershipMismatch ? 'other-resource' : employee.displayName } });
    }
    if (path === '/api/v1/knowledge/managed/bases') {
      if (user !== 'admin') return response({}, 403);
      if (init.method === 'GET') return response({ data: [...bases.values()] });
      const id = `kb-${bases.size + 1}`;
      const base = { ...body, id };
      bases.set(id, base);
      if (unknownCreate) throw new Error('credentials-private-url-body-must-not-leak');
      return mutation(base, 201);
    }
    const baseMatch = path.match(/\/managed\/bases\/([^/]+)(.*)/);
    if (baseMatch) {
      const [, id, suffix] = baseMatch;
      if (!suffix) {
        if (!bases.has(id)) return response({}, 404);
        if (init.method === 'DELETE') {
          if (employee && whitelist.includes(id)) return response({ error: { code: 'KNOWLEDGE_BASE_IN_USE' } }, 409);
          bases.delete(id);
          return response({ operationId: 'delete-op', deleted: true });
        }
        return response({ data: { ...bases.get(id), ...(ownershipMismatch ? { name: 'another-owner' } : {}) } });
      }
      if (suffix === '/grants') {
        grantSets.set(id, body.grants);
        return response({ knowledge_base_id: id, grants: body.grants });
      }
      if (suffix.startsWith('/documents/')) {
        const docID = `doc-${docs.size + 1}`;
        const marker =
          body instanceof FormData
            ? (await body.get('file').text()).match(/managed-(?:txt|pdf)-[\w-]+/)[0]
            : body.url
              ? options.sourceMarker
              : body.content.match(/managed-manual-[\w-]+/)[0];
        const doc = { id: docID, knowledge_base_id: id, parse_status: 'completed', marker };
        docs.set(docID, doc);
        return mutation(doc, 202);
      }
      if (suffix === '/tags') {
        if (init.method === 'GET') return response({ data: [tag] });
        tag = { id: 'tag-1', ...body };
        return mutation(tag, 201);
      }
      if (suffix === '/folders') return response({ data: { folders: [{ path: 'acceptance' }] } });
      if (suffix === '/faq/entries') {
        if (init.method === 'GET') return response({ data: [faq] });
        faq = { ...body, id: 1, knowledge_base_id: id, knowledge_id: 'faq-doc-1' };
        docs.set('faq-doc-1', { id: 'faq-doc-1', knowledge_base_id: id, marker: body.standard_question.slice(10, -1) });
        return mutation(faq);
      }
      return mutation({ outcome: 'succeeded' });
    }
    const docMatch = path.match(/\/managed\/documents\/([^/]+)(.*)/);
    if (docMatch) {
      const [, id, suffix] = docMatch;
      const doc = docs.get(id);
      if (!suffix) return response({ data: { ...doc, ...(brokenParse ? { parse_status: 'failed' } : {}) } });
      if (suffix === '/reparse') return mutation(doc, 202, 'succeeded');
      if (suffix === '/enable-status') {
        doc.enable_status = body.enabled ? 'enabled' : 'disabled';
        return mutation(doc);
      }
      if (suffix === '/preview' || suffix === '/download') {
        if (user !== 'admin') return response({}, 403);
        return new Response(doc.marker, {
          headers: { 'Content-Type': doc.marker.includes('-pdf-') ? 'application/pdf' : 'text/plain' },
        });
      }
      const chunk = { id: `chunk-${id}`, knowledge_id: id, content: `Synthetic ${doc.marker}`, content_revision: 1 };
      if (suffix === '/chunks') return response({ data: [chunk] });
      if (suffix.startsWith('/chunks/')) return mutation({ ...chunk, content_revision: 2 });
      return response({ data: { knowledge_id: id, trace: {} } });
    }
    if (path.endsWith('/audit'))
      return response({
        items: failAudit
          ? []
          : [
              {
                operationId: searchParams.get('operationId'),
                action: searchParams.get('action'),
                resourceId: searchParams.get('resourceId'),
                outcome:
                  mutations.find((operation) => operation.operationId === searchParams.get('operationId'))?.outcome ??
                  'succeeded',
                actorUserId: searchParams.get('actorUserId') ?? 'admin-a',
              },
            ],
      });
    const employeePath = path.match(/\/knowledge\/employees\/[^/]+\/(.*)/)?.[1];
    if (employeePath) {
      const doc =
        employeePath === 'search'
          ? [...docs.values()].find((item) => item.knowledge_base_id === body.knowledge_base_ids[0])
          : docs.get(employeePath.split('/')[1]);
      const baseID = employeePath === 'search' ? body.knowledge_base_ids[0] : doc.knowledge_base_id;
      const allowed =
        whitelist.includes(baseID) &&
        grantSets
          .get(baseID)
          ?.some((grant) => grant.type === 'team' || grant.id === (user === 'a' ? options.userAID : options.userBID));
      if (!allowed) return response({}, unauthenticatedDenial ? 401 : 403);
      if (employeePath.endsWith('/download'))
        return new Response(doc.marker, { headers: { 'Content-Type': 'text/plain' } });
      const matches = [...docs.values()].filter(
        (item) =>
          item.knowledge_base_id === baseID &&
          (employeePath !== 'search' || (body.query === item.marker && item.enable_status !== 'disabled')),
      );
      if (employeePath === 'search')
        return response({
          results: matches.map((item) => ({
            content: item.marker,
            source: { knowledge_base_id: baseID, document_id: item.id },
          })),
        });
      return response({ document: { id: doc.id, knowledge_base_id: baseID }, chunks: [{ content: doc.marker }] });
    }
    throw new Error(`unexpected route ${path}`);
  };
  return {
    fetcher,
    bases,
    calls,
    get employee() {
      return employee;
    },
  };
}

describe('managed knowledge live acceptance runner contract', () => {
  it('requires explicit credentials, public synthetic content and write opt-in before calling services', async () => {
    for (const changes of [
      { allowWrites: false },
      { userBToken: options.userAToken },
      { sourceURL: 'http://example.org/file' },
      { userASession: '' },
      { baseURL: 'https://secret:password@example.org' },
    ]) {
      expect(() => validateManagedOptions({ ...options, ...changes })).toThrow();
    }
    const result = await runManagedKnowledgeAcceptance({});
    expect(result).toMatchObject({ passed: false, cleanup: 'not-needed', failure: { stage: 'configuration' } });
  });

  it('executes the entire contract and labels transport-backed evidence separately from live acceptance', async () => {
    const fake = transport();
    const report = await runManagedKnowledgeAcceptance({ ...options, fetcher: fake.fetcher });
    expect(report.failure).toBeUndefined();
    expect(report).toMatchObject({
      passed: true,
      mode: 'runner-contract-test',
      fullPlanAccepted: false,
      cleanup: 'passed',
    });
    expect(report.checks.map((item) => item.stage)).toEqual(
      expect.arrayContaining([
        'parse-txt',
        'parse-pdf',
        'parse-url',
        'parse-manual',
        'two-user-cross-library-denial',
        'revoked-old-session-denial',
        'employee-whitelist-intersection',
        'persisted-operation-audit',
      ]),
    );
    expect(fake.bases.size).toBe(0);
    expect(fake.employee).toBeUndefined();
    const oldSessions = fake.calls.filter((call) => call.path.endsWith('/search'));
    expect(
      oldSessions.every(
        (call) =>
          call.cookie === `de_portal_session=${options.userASession}` ||
          call.cookie === `de_portal_session=${options.userBSession}`,
      ),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain(options.adminToken);
    expect(JSON.stringify(report)).not.toContain(options.sourceURL);
    expect(JSON.stringify(report)).not.toContain('synthetic-content');
  });

  it('refuses to classify an invalid session as authenticated scope denial and still cleans owned resources', async () => {
    const fake = transport({ unauthenticatedDenial: true });
    const report = await runManagedKnowledgeAcceptance({ ...options, fetcher: fake.fetcher });
    expect(report).toMatchObject({ passed: false, failure: { status: 401 }, cleanup: 'passed' });
    expect(fake.bases.size).toBe(0);
  });

  it('supports the native Bearer-only path without minting chat cookies', async () => {
    const fake = transport();
    const report = await runManagedKnowledgeAcceptance({
      ...options,
      userASession: undefined,
      userBSession: undefined,
      fetcher: fake.fetcher,
    });
    expect(report).toMatchObject({ passed: true, cleanup: 'passed', fullPlanAccepted: false });
    const searches = fake.calls.filter((call) => call.path.endsWith('/search'));
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((call) => call.cookie === undefined)).toBe(true);
  });

  it('explicitly records unverified URL ingestion when running the limited native import scope', async () => {
    const fake = transport();
    const report = await runManagedKnowledgeAcceptance({ ...options, includeURLImport: false, fetcher: fake.fetcher });
    expect(report).toMatchObject({ passed: true, fullPlanAccepted: false, importKinds: ['txt', 'pdf', 'manual'] });
    expect(report.unverified).toContain('url-import');
    expect(report.checks.some((item) => item.stage === 'parse-url')).toBe(false);
    expect(fake.calls.some((call) => call.path.endsWith('/documents/url'))).toBe(false);
  });

  it('reports parser failure and missing audit instead of declaring upload acceptance to be integration success', async () => {
    for (const config of [{ brokenParse: true }, { failAudit: true }]) {
      const fake = transport(config);
      const report = await runManagedKnowledgeAcceptance({ ...options, fetcher: fake.fetcher });
      expect(report.passed).toBe(false);
      expect(report.cleanup).toBe('passed');
      expect(fake.bases.size).toBe(0);
    }
  });

  it('never deletes a resource whose ownership readback has changed', async () => {
    const fake = transport({ ownershipMismatch: true });
    const report = await runManagedKnowledgeAcceptance({ ...options, fetcher: fake.fetcher });
    expect(report).toMatchObject({ passed: false, cleanup: 'failed' });
    // The sole DELETE is the intentional referenced-delete 409 assertion;
    // cleanup must not issue another DELETE after ownership changed.
    expect(fake.calls.filter((call) => call.method === 'DELETE' && /\/bases\/[^/]+$/.test(call.path))).toHaveLength(1);
    expect(fake.calls.some((call) => call.method === 'DELETE' && /\/api\/v1\/employees\//.test(call.path))).toBe(false);
  });

  it('discovers only this runs exact random name after an ambiguous create and hides transport error details', async () => {
    const fake = transport({ unknownCreate: true });
    const report = await runManagedKnowledgeAcceptance({ ...options, fetcher: fake.fetcher });
    expect(report).toMatchObject({
      passed: false,
      cleanup: 'passed',
      failure: { code: 'transport-or-response-failure' },
    });
    expect(fake.bases.size).toBe(0);
    expect(JSON.stringify(report)).not.toContain('credentials-private-url-body');
  });
});
