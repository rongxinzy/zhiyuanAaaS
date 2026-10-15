// Direct real WeKnora engine acceptance. This does not prove Portal/Agent authorization.
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { syntheticPDF } from './verify-knowledge-api.mjs';

class EngineAcceptanceError extends Error {
  constructor(stage, code, status) {
    super(code);
    this.stage = stage;
    this.code = code;
    this.status = status;
  }
}
const assert = (ok, stage, code) => {
  if (!ok) throw new EngineAcceptanceError(stage, code);
};
const safeID = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
function safeFailure(error) {
  return {
    stage: error instanceof EngineAcceptanceError ? error.stage : 'engine',
    code: error instanceof EngineAcceptanceError ? error.code : 'transport-or-json-failure',
    ...(error instanceof EngineAcceptanceError && error.status !== undefined ? { status: error.status } : {}),
  };
}

export function validateNativeEngineOptions(options) {
  let url;
  try {
    url = new URL(options.baseURL);
  } catch {
    throw new EngineAcceptanceError('configuration', 'invalid-base-url');
  }
  assert(
    url.protocol === 'http:' &&
      ['127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/',
    'configuration',
    'isolated-loopback-engine-required',
  );
  assert(options.allowWrites === true, 'configuration', 'temporary-writes-require-opt-in');
  assert(
    typeof options.apiKey === 'string' && options.apiKey.length > 0 && !/[\r\n]/.test(options.apiKey),
    'configuration',
    'api-key-required',
  );
  assert(safeID(options.embeddingModelID), 'configuration', 'embedding-model-required');
  for (const field of ['requestTimeoutMs', 'pollTimeoutMs', 'pollIntervalMs']) {
    if (options[field] !== undefined)
      assert(
        Number.isInteger(options[field]) && options[field] > 0 && options[field] <= 600_000,
        'configuration',
        `invalid-${field}`,
      );
  }
  return url.origin;
}

export async function runNativeEngineAcceptance(options) {
  const report = {
    schemaVersion: 1,
    mode: 'live-native-engine-http',
    passed: false,
    fullPlanAccepted: false,
    checks: [],
    cleanup: 'not-needed',
    unverified: [
      'portal-identity-grants',
      'employee-scope',
      'agent-mcp-runtime',
      'browser',
      'url-import',
      'backup-restore',
    ],
  };
  let baseURL;
  try {
    baseURL = validateNativeEngineOptions(options);
  } catch (error) {
    report.failure = safeFailure(error);
    return report;
  }
  const runID = randomUUID();
  const prefix = `zhiyuan-native-acceptance-${runID}`;
  const createdBases = [];
  const attemptedNames = new Set();
  const requestTimeout = options.requestTimeoutMs ?? 30_000;
  const pollTimeout = options.pollTimeoutMs ?? 180_000;
  const record = (stage) => report.checks.push({ stage, result: 'passed' });
  async function request(
    stage,
    path,
    { method = 'GET', body, statuses = [200], timeout = requestTimeout, binaryMarker, mime } = {},
  ) {
    const headers = { 'X-API-Key': options.apiKey };
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseURL}/api/v1${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeout),
      redirect: 'error',
    });
    if (!statuses.includes(response.status)) {
      await response.body?.cancel();
      throw new EngineAcceptanceError(stage, 'unexpected-status', response.status);
    }
    if (response.status === 404 || response.status === 204) {
      await response.body?.cancel();
      return { status: response.status };
    }
    if (binaryMarker) {
      assert(response.headers.get('content-type')?.split(';')[0].trim() === mime, stage, 'unexpected-file-type');
      const reader = response.body.getReader();
      const parts = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          assert(size <= 1_048_576, stage, 'synthetic-file-too-large');
          parts.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel();
      }
      assert(Buffer.concat(parts).includes(Buffer.from(binaryMarker)), stage, 'download-marker-missing');
      return { status: response.status };
    }
    const data = await response.json();
    assert(
      data && typeof data === 'object' && !Array.isArray(data) && data.success !== false,
      stage,
      'invalid-or-failed-envelope',
    );
    return { status: response.status, data };
  }
  async function poll(stage, check) {
    const deadline = Date.now() + pollTimeout;
    while (Date.now() < deadline) {
      if (await check(Math.max(1, Math.min(requestTimeout, deadline - Date.now())))) return;
      await delay(Math.min(options.pollIntervalMs ?? 1_000, Math.max(1, deadline - Date.now())));
    }
    throw new EngineAcceptanceError(stage, 'poll-timeout');
  }
  async function verifyParsed(stage, docID, kbID, marker, type = 'text') {
    await poll(stage, async (timeout) => {
      const { data } = await request(stage, `/knowledge/${docID}`, { timeout });
      assert(data.data?.knowledge_base_id === kbID, stage, 'document-parent-mismatch');
      assert(
        ['pending', 'processing', 'finalizing', 'completed'].includes(data.data.parse_status),
        stage,
        'parse-failed-or-unknown',
      );
      return data.data.parse_status === 'completed';
    });
    const chunks = await request(stage, `/chunks/${docID}?page=1&page_size=20&chunk_type=${type}`);
    assert(
      chunks.data.data?.some((chunk) => chunk.knowledge_id === docID && chunk.content?.includes(marker)),
      stage,
      'parsed-source-marker-missing',
    );
    record(stage);
  }
  async function search(stage, kbID, docID, marker, mode) {
    await poll(stage, async (timeout) => {
      const { data } = await request(stage, `/knowledge-bases/${kbID}/hybrid-search`, {
        method: 'POST',
        timeout,
        body: {
          query_text: marker,
          match_count: 10,
          vector_threshold: 0,
          keyword_threshold: 0,
          disable_vector_match: mode === 'keyword',
          disable_keywords_match: mode === 'vector',
        },
      });
      return data.data?.some((hit) => hit.knowledge_id === docID && hit.content?.includes(marker));
    });
    record(stage);
  }
  try {
    const model = await request('embedding-model', `/models/${options.embeddingModelID}`);
    assert(
      model.data.data?.type === 'Embedding' &&
        model.data.data.source === 'local' &&
        model.data.data.name === 'all-minilm:22m',
      'embedding-model',
      'real-local-embedding-model-required',
    );
    record('embedding-model');
    for (const type of ['document', 'faq']) {
      const name = `${prefix}-${type}`;
      attemptedNames.add(name);
      const { data } = await request(`create-${type}`, '/knowledge-bases', {
        method: 'POST',
        statuses: [200, 201],
        body: {
          name,
          description: 'Disposable synthetic native acceptance',
          type,
          embedding_model_id: options.embeddingModelID,
          chunking_config: { chunk_size: 512, chunk_overlap: 0, separators: ['\n'], enable_multimodal: false },
          question_generation_config: { enabled: false },
        },
      });
      assert(safeID(data.data?.id), `create-${type}`, 'invalid-created-id');
      createdBases.push({ id: data.data.id, name });
      attemptedNames.delete(name);
      assert(data.data.name === name && data.data.type === type, `create-${type}`, 'created-base-mismatch');
      record(`create-${type}`);
    }
    const [documentBase, faqBase] = createdBases;
    for (const kind of ['manual', 'txt', 'pdf']) {
      const marker = `native-${kind}-${runID}`;
      let body;
      if (kind === 'manual')
        body = { title: `${prefix}-manual`, content: `Synthetic acceptance ${marker}`, status: 'publish' };
      else {
        body = new FormData();
        body.append(
          'file',
          new Blob([kind === 'pdf' ? syntheticPDF(marker) : `Synthetic acceptance ${marker}\n`], {
            type: kind === 'pdf' ? 'application/pdf' : 'text/plain',
          }),
          `synthetic.${kind}`,
        );
      }
      const { data } = await request(
        `import-${kind}`,
        `/knowledge-bases/${documentBase.id}/knowledge/${kind === 'manual' ? 'manual' : 'file'}`,
        { method: 'POST', body, statuses: [200, 201] },
      );
      const docID = data.data?.id;
      assert(
        safeID(docID) && data.data.knowledge_base_id === documentBase.id,
        `import-${kind}`,
        'document-parent-mismatch',
      );
      record(`import-${kind}`);
      await verifyParsed(`parse-and-source-${kind}`, docID, documentBase.id, marker);
      for (const mode of ['vector', 'keyword', 'hybrid'])
        await search(`${kind}-${mode}-search`, documentBase.id, docID, marker, mode);
      if (kind !== 'manual') {
        for (const action of ['preview', 'download']) {
          await request(`${kind}-${action}`, `/knowledge/${docID}/${action}`, {
            binaryMarker: marker,
            mime:
              action === 'download' ? 'application/octet-stream' : kind === 'pdf' ? 'application/pdf' : 'text/plain',
          });
          record(`${kind}-${action}`);
        }
      }
    }
    const marker = `native-faq-${runID}`;
    const faq = await request('create-faq-entry', `/knowledge-bases/${faqBase.id}/faq/entry`, {
      method: 'POST',
      body: {
        standard_question: `What is ${marker}?`,
        similar_questions: [],
        negative_questions: [],
        answers: [`Synthetic answer ${marker}`],
        answer_strategy: 'all',
        is_enabled: true,
        is_recommended: false,
      },
    });
    const faqDocID = faq.data.data?.knowledge_id;
    assert(
      safeID(faqDocID) && faq.data.data.knowledge_base_id === faqBase.id,
      'create-faq-entry',
      'faq-parent-mismatch',
    );
    record('create-faq-entry');
    await verifyParsed('faq-source', faqDocID, faqBase.id, marker, 'faq');
    for (const mode of ['vector', 'hybrid']) await search(`faq-${mode}-search`, faqBase.id, faqDocID, marker, mode);
    // FAQ keyword indexing differs from document indexing; no claim is made here.
  } catch (error) {
    report.failure = safeFailure(error);
  } finally {
    report.cleanup = 'passed';
    try {
      if (attemptedNames.size) {
        const { data } = await request('cleanup-discovery', '/knowledge-bases');
        assert(Array.isArray(data.data), 'cleanup-discovery', 'invalid-base-list');
        for (const name of attemptedNames) {
          const matches = data.data.filter((base) => base.name === name);
          assert(
            matches.length === 1 && safeID(matches[0].id),
            'cleanup-discovery',
            'uncertain-create-needs-manual-check',
          );
          createdBases.push({ id: matches[0].id, name });
        }
      }
      for (const base of createdBases.reverse()) {
        const current = await request('cleanup', `/knowledge-bases/${base.id}`, { statuses: [200, 404] });
        if (current.status === 200) {
          assert(current.data.data?.name === base.name, 'cleanup', 'ownership-mismatch');
          await request('cleanup', `/knowledge-bases/${base.id}`, { method: 'DELETE', statuses: [200, 204] });
        }
        await poll(
          'cleanup-verify',
          async (timeout) =>
            (await request('cleanup-verify', `/knowledge-bases/${base.id}`, { statuses: [200, 404], timeout }))
              .status === 404,
        );
      }
    } catch (error) {
      report.cleanup = 'failed';
      report.cleanupFailure = safeFailure(error);
      report.remainingTemporaryResources = createdBases.map(({ id, name }) => ({ id, name }));
    }
  }
  report.passed = !report.failure && report.cleanup === 'passed';
  return report;
}

export async function main(env = process.env) {
  let report;
  try {
    const info = await stat(env.ZHIYUAN_NATIVE_ENGINE_INPUT_FILE);
    assert(info.isFile() && (info.mode & 0o077) === 0, 'configuration', 'private-input-file-required');
    const input = JSON.parse(await readFile(env.ZHIYUAN_NATIVE_ENGINE_INPUT_FILE, 'utf8'));
    report = await runNativeEngineAcceptance({
      ...input,
      allowWrites: env.ZHIYUAN_NATIVE_ENGINE_ALLOW_TEMPORARY_WRITES === '1',
    });
  } catch (error) {
    report = { passed: false, fullPlanAccepted: false, failure: safeFailure(error) };
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
