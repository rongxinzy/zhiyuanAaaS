import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, describe, expect, test } from 'vitest';
import { runKnowledgeProbe, syntheticPDF, validateProbeOptions } from './verify-knowledge-api.mjs';

const servers = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function fixture({ fault, cleanupFault, scopedStatus = 403 } = {}) {
  const apiKey = randomUUID();
  const deniedAPIKey = randomUUID();
  const calls = [];
  const docs = new Map();
  let kb;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const raw = Buffer.concat(buffers).toString();
    const path = url.pathname.replace('/api/v1', '');
    const key = req.headers['x-api-key'];
    calls.push({ path, query: url.search, method: req.method, headers: req.headers, raw });
    function reply(status, data) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
    if (key !== apiKey && key !== deniedAPIKey) return reply(401, { success: false });
    if (key === deniedAPIKey) {
      return path === '/knowledge-bases' ? reply(200, { data: [], success: true }) : reply(scopedStatus, {});
    }
    if (path === '/models') {
      if (fault === 'no-model') return reply(200, { data: [], success: true });
      if (fault === 'bad-json') {
        res.end('not-json');
        return;
      }
      return reply(200, { data: [{ id: 'model-id', type: 'Embedding' }], success: true });
    }
    if (path === '/knowledge-bases' && req.method === 'POST') {
      kb = { id: 'kb-id', ...JSON.parse(raw) };
      return reply(201, { data: kb, success: true });
    }
    if (path === '/knowledge-bases/kb-id') {
      if (req.method === 'DELETE') {
        if (cleanupFault) return reply(503, {});
        kb = undefined;
        docs.clear();
        return reply(200, { success: true });
      }
      return kb ? reply(200, { data: fault === 'ownership' ? { ...kb, name: 'not-owned' } : kb }) : reply(404, {});
    }
    if (path === '/knowledge-bases/kb-id/knowledge/file') {
      if (fault === 'upload-http') return reply(413, { detail: apiKey });
      if (fault === 'application-error') return reply(200, { success: false, detail: apiKey });
      expect(req.headers['content-type']).toContain('multipart/form-data; boundary=');
      const marker = raw.match(/zhiyuan-(?:txt|pdf)-[\w-]+/)?.[0];
      const id = `doc-${docs.size}`;
      const doc = {
        id,
        knowledge_base_id: fault === 'parent' ? 'another-kb' : 'kb-id',
        marker,
        parse_status: 'completed',
      };
      docs.set(id, doc);
      return reply(201, { data: doc, success: true });
    }
    if (path === '/knowledge-bases/kb-id/knowledge') return reply(200, { data: [...docs.values()] });
    if (path.startsWith('/knowledge/doc-')) {
      const id = path.split('/').at(-1);
      if (req.method === 'DELETE') {
        if (fault !== 'delete-stale') docs.delete(id);
        return reply(200, { success: true });
      }
      const doc = docs.get(id);
      const parse_status = fault === 'parse-failed' ? 'failed' : fault === 'parse-pending' ? 'processing' : 'completed';
      return doc ? reply(200, { data: { ...doc, parse_status } }) : reply(404, {});
    }
    if (path.startsWith('/chunks/')) {
      const doc = docs.get(path.split('/').at(-1));
      return reply(200, { data: [{ knowledge_id: doc.id, content: fault === 'preview-empty' ? '' : doc.marker }] });
    }
    if (path === '/knowledge-search') {
      const input = JSON.parse(raw);
      expect(input.knowledge_base_ids).toEqual(['kb-id']);
      const data =
        fault === 'search-empty'
          ? []
          : [...docs.values()].map((doc) => ({ knowledge_id: doc.id, content: doc.marker }));
      return reply(200, { data, success: true });
    }
    reply(404, {});
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    options: {
      baseURL: `http://127.0.0.1:${server.address().port}`,
      apiKey,
      deniedAPIKey,
      embeddingModelID: 'model-id',
      allowWrites: true,
      pollTimeoutMs: 2_000,
      pollIntervalMs: 10,
    },
    calls,
  };
}

describe('knowledge API phase A probe', () => {
  test('completes TXT/PDF lifecycle, denies unauthorized reads and cleans only its KB', async () => {
    const { options, calls } = await fixture();
    const report = await runKnowledgeProbe(options);
    expect(report.passed).toBe(true);
    expect(report.cleanup).toBe('passed');
    expect(report.scopeAuthorizationVerified).toBe(true);
    expect(report.checks.map((entry) => entry.stage)).toContain('delete-pdf');
    expect(calls.filter((call) => call.query.includes('page_size=20'))).toHaveLength(4);
    expect(calls.filter((call) => call.method === 'DELETE').map((call) => call.path)).toEqual([
      '/knowledge/doc-0',
      '/knowledge/doc-0',
      '/knowledge-bases/kb-id',
    ]);
    expect(JSON.stringify(report)).not.toContain(options.apiKey);
    expect(JSON.stringify(report)).not.toContain(options.baseURL);
  });

  test.each([
    ['no-model', 'model-preflight', 'embedding-model-unavailable', 'not-needed'],
    ['bad-json', 'model-preflight', 'transport-or-json-failure', 'not-needed'],
    ['upload-http', 'upload-txt', 'unexpected-status', 'passed'],
    ['application-error', 'upload-txt', 'upstream-reported-failure', 'passed'],
    ['parent', 'upload-txt', 'document-parent-mismatch', 'passed'],
    ['parse-failed', 'parse-txt', 'parse-failed', 'passed'],
    ['parse-pending', 'parse-txt', 'poll-timeout', 'passed'],
    ['preview-empty', 'preview-txt', 'marker-missing-from-parsed-chunks', 'passed'],
    ['search-empty', 'search-txt', 'poll-timeout', 'passed'],
    ['delete-stale', 'delete-txt', 'poll-timeout', 'passed'],
  ])('fails closed on %s and performs scoped cleanup', async (fault, stage, code, cleanup) => {
    const { options } = await fixture({ fault });
    const report = await runKnowledgeProbe(options);
    expect(report.passed).toBe(false);
    expect(report.failure).toMatchObject({ stage, code });
    expect(report.cleanup).toBe(cleanup);
    expect(JSON.stringify(report)).not.toContain(options.apiKey);
  });

  test('refuses cleanup if resource ownership does not match', async () => {
    const { options, calls } = await fixture({ fault: 'ownership' });
    const report = await runKnowledgeProbe(options);
    expect(report.cleanupFailure.code).toBe('resource-ownership-mismatch');
    expect(report.remainingTemporaryKB.id).toBe('kb-id');
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
  });

  test('reports cleanup failure rather than hiding it behind original failure', async () => {
    const { options } = await fixture({ fault: 'upload-http', cleanupFault: true });
    const report = await runKnowledgeProbe(options);
    expect(report.passed).toBe(false);
    expect(report.failure.stage).toBe('upload-txt');
    expect(report.cleanupFailure.status).toBe(503);
  });

  test('does not mistake invalid credentials for an authenticated scope denial', async () => {
    const { options } = await fixture({ scopedStatus: 401 });
    const report = await runKnowledgeProbe(options);
    expect(report.failure.code).toBe('denied-key-not-authenticated');
    expect(report.scopeAuthorizationVerified).toBe(false);
  });

  test('fails if a supposedly denied key can read the temporary KB', async () => {
    const { options } = await fixture({ scopedStatus: 200 });
    const report = await runKnowledgeProbe(options);
    expect(report.failure.stage).toBe('scope-denial');
    expect(report.passed).toBe(false);
  });

  test('marks missing scope credentials as untested, not verified', async () => {
    const { options } = await fixture();
    const report = await runKnowledgeProbe({ ...options, deniedAPIKey: undefined });
    expect(report.passed).toBe(true);
    expect(report.scopeAuthorizationVerified).toBe(false);
    expect(report.checks.find((entry) => entry.stage === 'scope-denial').result).toBe('not-tested');
  });

  test('suppresses transport error messages containing credentials or addresses', async () => {
    const { options } = await fixture();
    const report = await runKnowledgeProbe({
      ...options,
      fetcher: async () => {
        throw new Error(options.apiKey);
      },
    });
    expect(report.failure.code).toBe('transport-or-json-failure');
    expect(JSON.stringify(report)).not.toContain(options.apiKey);
  });

  test('bounds a stalled HTTP request and emits only a safe timeout code', async () => {
    const { options } = await fixture();
    const report = await runKnowledgeProbe({
      ...options,
      requestTimeoutMs: 10,
      fetcher: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        }),
    });
    expect(report.failure).toEqual({ stage: 'unauthenticated-denial', code: 'request-timeout' });
    expect(report.cleanup).toBe('not-needed');
  });

  test('rejects redirects without forwarding credentials to a second origin', async () => {
    const { options } = await fixture();
    const target = createServer((_req, res) => {
      res.writeHead(302, { Location: '/different-origin' });
      res.end();
    });
    servers.push(target);
    target.listen(0, '127.0.0.1');
    await once(target, 'listening');
    const report = await runKnowledgeProbe({ ...options, baseURL: `http://127.0.0.1:${target.address().port}` });
    expect(report.failure.code).toBe('transport-or-json-failure');
  });
});

describe('probe configuration and synthetic fixture', () => {
  const valid = {
    baseURL: 'https://knowledge.example.test',
    apiKey: randomUUID(),
    embeddingModelID: 'model-id',
    allowWrites: true,
  };
  test.each([
    [{ allowWrites: false }, 'temporary-writes-require-opt-in'],
    [{ baseURL: 'http://knowledge.example.test' }, 'https-required-outside-loopback'],
    [{ baseURL: 'https://knowledge.example.test/?key=hidden' }, 'unsafe-base-url'],
    [{ baseURL: 'ftp://knowledge.example.test' }, 'unsafe-base-url'],
    [{ baseURL: 'invalid' }, 'invalid-base-url'],
    [{ embeddingModelID: '../existing-resource' }, 'embedding-model-id-required'],
    [{ apiKey: '' }, 'api-key-required'],
    [{ pollTimeoutMs: -1 }, 'invalid-pollTimeoutMs'],
  ])('rejects unsafe settings %j', (overrides, code) => {
    expect(() => validateProbeOptions({ ...valid, ...overrides })).toThrow(code);
  });
  test('creates a PDF with correct cross-reference offsets', () => {
    const pdf = syntheticPDF('marker-value').toString();
    expect(pdf).toContain('(Knowledge probe reference marker-value)');
    const xrefOffset = Number(pdf.match(/startxref\n(\d+)/)[1]);
    expect(pdf.slice(xrefOffset)).toMatch(/^xref/);
    const offsets = pdf.match(/\d{10} 00000 n /g).map((line) => Number(line.slice(0, 10)));
    for (const [index, offset] of offsets.entries())
      expect(pdf.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`));
  });
});
