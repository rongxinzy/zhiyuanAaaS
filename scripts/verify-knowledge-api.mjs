import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export class KnowledgeProbeError extends Error {
  constructor(stage, code, status) {
    super(`${stage}: ${code}${status === undefined ? '' : ` (HTTP ${status})`}`);
    this.stage = stage;
    this.code = code;
    this.status = status;
  }
}

function check(condition, stage, code) {
  if (!condition) throw new KnowledgeProbeError(stage, code);
}

export function validateProbeOptions(options) {
  let url;
  try {
    url = new URL(options.baseURL);
  } catch {
    throw new KnowledgeProbeError('configuration', 'invalid-base-url');
  }
  check(
    ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
    'configuration',
    'unsafe-base-url',
  );
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  check(url.protocol === 'https:' || loopback, 'configuration', 'https-required-outside-loopback');
  check(typeof options.apiKey === 'string' && options.apiKey.length > 0, 'configuration', 'api-key-required');
  check(options.allowWrites === true, 'configuration', 'temporary-writes-require-opt-in');
  check(
    typeof options.embeddingModelID === 'string' && /^[\w-]{1,128}$/.test(options.embeddingModelID),
    'configuration',
    'embedding-model-id-required',
  );
  for (const name of ['requestTimeoutMs', 'pollTimeoutMs', 'pollIntervalMs']) {
    if (options[name] !== undefined) {
      check(Number.isInteger(options[name]) && options[name] > 0, 'configuration', `invalid-${name}`);
    }
  }
  return url.href.replace(/\/$/, '');
}

// A small valid PDF with an ASCII-only synthetic marker. No user files are read.
export function syntheticPDF(marker) {
  check(/^[\w-]+$/.test(marker), 'fixture', 'unsafe-marker');
  const content = `BT /F1 12 Tf 40 750 Td (Knowledge probe reference ${marker}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')}`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function runKnowledgeProbe(options) {
  const baseURL = validateProbeOptions(options);
  const fetcher = options.fetcher ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const pollTimeoutMs = options.pollTimeoutMs ?? 180_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const runID = randomUUID();
  const name = `zhiyuan-knowledge-probe-${runID}`;
  const report = {
    schemaVersion: 1,
    mode: 'upstream-http-poc',
    runID,
    checks: [],
    cleanup: 'not-needed',
    passed: false,
  };
  const record = (stage, details = {}) => report.checks.push({ stage, ...details });
  const fail = (error) => ({
    stage: error instanceof KnowledgeProbeError ? error.stage : 'probe',
    code: error instanceof KnowledgeProbeError ? error.code : 'unexpected-error',
    ...(error instanceof KnowledgeProbeError && error.status !== undefined ? { status: error.status } : {}),
  });
  let kbID;

  async function request(
    stage,
    path,
    { key = options.apiKey, method = 'GET', body, json, statuses = [200], timeout } = {},
  ) {
    const headers = key ? { 'X-API-Key': key } : {};
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetcher(`${baseURL}/api/v1${path}`, {
        method,
        headers,
        body: json === undefined ? body : JSON.stringify(json),
        redirect: 'error',
        signal: AbortSignal.timeout(timeout ?? requestTimeoutMs),
      });
      if (!statuses.includes(response.status)) {
        await response.body?.cancel();
        throw new KnowledgeProbeError(stage, 'unexpected-status', response.status);
      }
      if (response.status === 204 || [401, 403, 404].includes(response.status)) {
        await response.body?.cancel();
        return { status: response.status };
      }
      const payload = await response.json();
      check(payload && typeof payload === 'object' && !Array.isArray(payload), stage, 'invalid-json-envelope');
      check(payload.success !== false, stage, 'upstream-reported-failure');
      return { status: response.status, payload };
    } catch (error) {
      if (error instanceof KnowledgeProbeError) throw error;
      throw new KnowledgeProbeError(
        stage,
        error?.name === 'TimeoutError' ? 'request-timeout' : 'transport-or-json-failure',
      );
    }
  }
  function objectID(value, stage) {
    check(value && typeof value.id === 'string' && /^[\w-]{1,128}$/.test(value.id), stage, 'invalid-resource-id');
    return value.id;
  }
  async function poll(stage, fn) {
    const deadline = Date.now() + pollTimeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await fn(Math.max(1, Math.min(requestTimeoutMs, deadline - Date.now())))) return;
      } catch (error) {
        if (error instanceof KnowledgeProbeError && error.code === 'request-timeout' && Date.now() >= deadline) break;
        throw error;
      }
      await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
    }
    throw new KnowledgeProbeError(stage, 'poll-timeout');
  }
  async function search(stage, marker, timeout) {
    const { payload } = await request(stage, '/knowledge-search', {
      method: 'POST',
      timeout,
      json: { query: marker, knowledge_base_ids: [kbID] },
    });
    check(Array.isArray(payload.data), stage, 'invalid-search-response');
    return payload.data;
  }

  try {
    const unauth = await request('unauthenticated-denial', '/knowledge-bases', { key: '', statuses: [401, 403] });
    record('unauthenticated-denial', { status: unauth.status });
    const invalid = await request('invalid-credential-denial', '/knowledge-bases', {
      key: `invalid-${runID}`,
      statuses: [401, 403],
    });
    record('invalid-credential-denial', { status: invalid.status });
    const { payload: models } = await request('model-preflight', '/models');
    check(Array.isArray(models.data), 'model-preflight', 'invalid-model-response');
    const model = models.data.find((entry) => entry.id === options.embeddingModelID);
    check(model && ['Embedding', 'embedding'].includes(model.type), 'model-preflight', 'embedding-model-unavailable');
    record('model-preflight');
    const { payload: created } = await request('create-kb', '/knowledge-bases', {
      method: 'POST',
      statuses: [200, 201],
      json: {
        name,
        description: 'Disposable synthetic API acceptance probe',
        type: 'document',
        embedding_model_id: options.embeddingModelID,
        chunking_config: { chunk_size: 512, chunk_overlap: 0, separators: ['\n'], enable_multimodal: false },
        question_generation_config: { enabled: false },
      },
    });
    kbID = objectID(created.data, 'create-kb');
    const { payload: owned } = await request('verify-kb-ownership', `/knowledge-bases/${kbID}`);
    check(owned.data?.name === name, 'verify-kb-ownership', 'created-resource-name-mismatch');
    record('create-kb');
    if (options.deniedAPIKey) {
      check(options.deniedAPIKey !== options.apiKey, 'scope-denial', 'denied-key-must-differ');
      await request('scope-key-authentication', '/knowledge-bases', { key: options.deniedAPIKey });
      const denied = await request('scope-denial', `/knowledge-bases/${kbID}`, {
        key: options.deniedAPIKey,
        statuses: [401, 403, 404],
      });
      // Invalid credentials do not prove an authenticated scope boundary.
      check(denied.status !== 401, 'scope-denial', 'denied-key-not-authenticated');
      record('scope-denial', { status: denied.status });
    } else {
      record('scope-denial', { result: 'not-tested', reason: 'separate-authenticated-key-required' });
    }
    for (const type of ['txt', 'pdf']) {
      const marker = `zhiyuan-${type}-${runID}`;
      const content = type === 'txt' ? Buffer.from(`Knowledge probe reference ${marker}\n`) : syntheticPDF(marker);
      const form = new FormData();
      form.append(
        'file',
        new Blob([content], { type: type === 'txt' ? 'text/plain' : 'application/pdf' }),
        `probe.${type}`,
      );
      const { payload: uploaded } = await request(`upload-${type}`, `/knowledge-bases/${kbID}/knowledge/file`, {
        method: 'POST',
        body: form,
        statuses: [200, 201],
      });
      const docID = objectID(uploaded.data, `upload-${type}`);
      check(uploaded.data.knowledge_base_id === kbID, `upload-${type}`, 'document-parent-mismatch');
      record(`upload-${type}`);
      await poll(`parse-${type}`, async (timeout) => {
        const { payload } = await request(`parse-${type}`, `/knowledge/${docID}`, { timeout });
        check(payload.data?.knowledge_base_id === kbID, `parse-${type}`, 'document-parent-mismatch');
        const status = payload.data.parse_status;
        check(!['failed', 'cancelled', 'deleting'].includes(status), `parse-${type}`, `parse-${status}`);
        check(
          ['pending', 'processing', 'finalizing', 'completed'].includes(status),
          `parse-${type}`,
          'unknown-parse-status',
        );
        return status === 'completed';
      });
      record(`parse-${type}`);
      const { payload: listed } = await request(
        `list-${type}`,
        `/knowledge-bases/${kbID}/knowledge?page=1&page_size=20`,
      );
      check(
        Array.isArray(listed.data) && listed.data.some((doc) => doc.id === docID),
        `list-${type}`,
        'uploaded-document-not-listed',
      );
      record(`list-${type}`);
      const { payload: chunks } = await request(`preview-${type}`, `/chunks/${docID}?page=1&page_size=20`);
      check(
        Array.isArray(chunks.data) &&
          chunks.data.some((chunk) => chunk.knowledge_id === docID && chunk.content?.includes(marker)),
        `preview-${type}`,
        'marker-missing-from-parsed-chunks',
      );
      record(`preview-${type}`);
      await poll(`search-${type}`, async (timeout) => {
        const hits = await search(`search-${type}`, marker, timeout);
        return hits.some((hit) => hit.knowledge_id === docID && hit.content?.includes(marker));
      });
      record(`search-${type}`);
      await request(`delete-${type}`, `/knowledge/${docID}`, { method: 'DELETE', statuses: [200, 204] });
      await poll(`delete-${type}`, async (timeout) => {
        const doc = await request(`delete-${type}`, `/knowledge/${docID}`, { timeout, statuses: [200, 404] });
        const hits = await search(`delete-${type}`, marker, timeout);
        return doc.status === 404 && !hits.some((hit) => hit.knowledge_id === docID);
      });
      record(`delete-${type}`);
    }
  } catch (error) {
    report.failure = fail(error);
  } finally {
    if (kbID) {
      try {
        // Never clean a resource unless its freshly read name matches this run.
        const owned = await request('cleanup', `/knowledge-bases/${kbID}`, { statuses: [200, 404] });
        if (owned.status !== 404) {
          check(owned.payload.data?.name === name, 'cleanup', 'resource-ownership-mismatch');
          await request('cleanup', `/knowledge-bases/${kbID}`, { method: 'DELETE', statuses: [200, 204] });
          await poll('cleanup', async (timeout) => {
            const result = await request('cleanup', `/knowledge-bases/${kbID}`, { timeout, statuses: [200, 404] });
            return result.status === 404;
          });
        }
        report.cleanup = 'passed';
      } catch (error) {
        report.cleanup = 'failed';
        report.cleanupFailure = fail(error);
        report.remainingTemporaryKB = { id: kbID, name };
      }
    }
  }
  report.passed = !report.failure && report.cleanup === 'passed';
  report.scopeAuthorizationVerified = report.checks.some(
    (entry) => entry.stage === 'scope-denial' && entry.status !== undefined,
  );
  return report;
}

export async function main(env = process.env) {
  let report;
  try {
    report = await runKnowledgeProbe({
      baseURL: env.ZHIYUAN_KNOWLEDGE_BASE_URL,
      apiKey: env.ZHIYUAN_KNOWLEDGE_API_KEY,
      embeddingModelID: env.ZHIYUAN_KNOWLEDGE_EMBEDDING_MODEL_ID,
      deniedAPIKey: env.ZHIYUAN_KNOWLEDGE_DENIED_API_KEY,
      allowWrites: env.ZHIYUAN_KNOWLEDGE_ALLOW_TEMPORARY_WRITES === '1',
    });
  } catch (error) {
    report = { passed: false, stage: error.stage ?? 'configuration', code: error.code ?? 'unexpected-error' };
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
