import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const AGENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function resolveZhiyuanAgentId(userDataPath: string): Promise<string> {
  const directory = path.join(path.resolve(userDataPath), 'zhiyuan-enterprise');
  const filePath = path.join(directory, 'agent-id');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  try {
    return await readAgentId(filePath);
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error;
  }

  const agentId = randomUUID();
  try {
    await fs.writeFile(filePath, `${agentId}\n`, { flag: 'wx', mode: 0o600 });
    await fs.chmod(filePath, 0o600);
    return agentId;
  } catch (error) {
    if (!isNodeError(error, 'EEXIST')) throw error;
    return readAgentId(filePath);
  }
}

async function readAgentId(filePath: string): Promise<string> {
  const value = (await fs.readFile(filePath, 'utf8')).trim();
  if (!AGENT_ID_PATTERN.test(value)) {
    throw new Error('Zhiyuan Agent ID file is invalid.');
  }
  return value;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
