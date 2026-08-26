import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { AepClient, MemoryTokenStore } from '@aep/sdk-node';
import yazl from 'yazl';

const require = createRequire(import.meta.url);
const { createZhiyuanAgentControlBackend } = require('../dist/extension.cjs');
const baseUrl = process.env.ZHIYUAN_AEP_BASE_URL ?? 'http://localhost:8080';
const enterpriseId = process.env.ZHIYUAN_AEP_ENTERPRISE_ID ?? 'demo';
const adminUsername = process.env.ZHIYUAN_AEP_ADMIN_USERNAME ?? 'admin';
const adminPassword =
  process.env.ZHIYUAN_AEP_ADMIN_PASSWORD ?? 'change-this-admin-password';
const runId = Date.now().toString(36);
const username = `aaas-e2e-${runId}`;
const password = `Zhiyuan-e2e-${runId}-password`;
const agentId = `aaas-agent-${runId}`;
const skillId = `aaas-skill-${runId}`;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiyuan-aaas-e2e-'));

let admin;
let user;
let assignment;
let backend;

try {
  admin = client(`aaas-admin-${runId}`);
  await admin.loginWithPassword({
    enterpriseId,
    username: adminUsername,
    password: adminPassword,
  });
  user = await admin.createUser({
    enterpriseId,
    username,
    displayName: `Zhiyuan AaaS E2E ${runId}`,
    temporaryPassword: password,
    organizationIds: [],
    roleIds: [],
    requirePasswordChange: false,
  });

  const archive = await createSkillArchive();
  await admin.createSkill({
    id: skillId,
    name: `AaaS E2E ${runId}`,
    description: 'Zhiyuan Agent control backend verification',
    enabled: true,
  });
  await admin.uploadSkillVersion(skillId, '1.0.0', archive);
  await admin.publishSkillVersion(skillId, '1.0.0');
  assignment = await admin.createSkillAssignment({
    skillId,
    subject: { type: 'user', id: user.id },
  });

  const agent = client(agentId);
  await agent.loginWithPassword({ enterpriseId, username, password });
  backend = createZhiyuanAgentControlBackend({
    client: agent,
    databasePath: path.join(temporaryDirectory, 'agent-control.sqlite'),
    skillRoot: path.join(temporaryDirectory, 'managed-skills'),
    agentVersion: 'aaas-e2e',
    platform: platform(),
  });

  const installEvent = await publishSkillEvent(admin, 'install');
  await backend.runOnce();
  const installedDefinition = path.join(
    temporaryDirectory,
    'managed-skills',
    skillId,
    'SKILL.md',
  );
  assert.equal(fs.readFileSync(installedDefinition, 'utf8'), '# Zhiyuan E2E Skill\n');
  await assertDelivery(admin, installEvent.eventId, 'succeeded');

  const registeredAgent = await admin.getAgent(agentId);
  assert.equal(registeredAgent.installedSkillIds?.includes(skillId), true);
  assert.notEqual(registeredAgent.appliedSkillRevision, null);
  const telemetry = await admin.searchEvents({ agentId });
  assert.equal(
    telemetry.items.some(item => item.type === 'skill.sync.completed'),
    true,
  );

  await admin.deleteSkillAssignment(assignment.id);
  assignment = null;
  const removeEvent = await publishSkillEvent(admin, 'remove');
  await backend.runOnce();
  assert.equal(fs.existsSync(path.dirname(installedDefinition)), false);
  await assertDelivery(admin, removeEvent.eventId, 'succeeded');

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        baseUrl,
        agentId,
        skillId,
        checks: [
          'password login and Agent binding',
          'persisted control delivery acknowledgement',
          'authorized Skill download and safe installation',
          'Skill sync result and Agent state',
          'telemetry upload',
          'assignment revocation and managed Skill removal',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await backend?.close().catch(() => undefined);
  if (admin && assignment?.id) {
    await admin.deleteSkillAssignment(assignment.id).catch(() => undefined);
  }
  if (admin) await admin.deleteSkill(skillId).catch(() => undefined);
  if (admin && user?.id) {
    await admin.updateUser(user.id, { status: 'disabled' }).catch(() => undefined);
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

function client(clientAgentId) {
  return new AepClient({
    baseUrl,
    agentId: clientAgentId,
    agentVersion: 'aaas-e2e',
    platform: platform(),
    tokenStore: new MemoryTokenStore(),
  });
}

async function publishSkillEvent(adminClient, phase) {
  return adminClient.createControlEvent({
    type: 'skill.manifest.changed',
    scope: { type: 'agent', id: agentId },
    resource: { type: 'skill', id: skillId, revision: phase },
    task: { type: 'skill.reconcile' },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    supersedesKey: `aaas-e2e:${skillId}:${phase}`,
  });
}

async function assertDelivery(adminClient, eventId, expectedState) {
  const page = await adminClient.listControlEventDeliveries(String(eventId));
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].state, expectedState);
}

function platform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

function createSkillArchive() {
  return new Promise((resolve, reject) => {
    const archive = new yazl.ZipFile();
    const chunks = [];
    archive.outputStream.on('data', chunk => chunks.push(Buffer.from(chunk)));
    archive.outputStream.on('error', reject);
    archive.outputStream.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    archive.addBuffer(Buffer.from('# Zhiyuan E2E Skill\n'), 'SKILL.md');
    archive.end();
  });
}
