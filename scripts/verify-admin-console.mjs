import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/admin');
const port = 5187;
const child = spawn(process.execPath, [path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'serve-admin.mjs')], {
  env: { ...process.env, ZHIYUAN_ADMIN_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
try {
  await waitForServer(port);
  const response = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<div id="root"><\/div>/);
  const assets = [...html.matchAll(/(?:src|href)="\.\/([^"?]+)"/g)].map(match => match[1]);
  assert.ok(assets.length >= 2, 'Admin entrypoint must include JavaScript and CSS assets.');
  for (const asset of assets) await fs.access(path.join(root, asset));
  console.log(JSON.stringify({ status: 'passed', origin: `http://127.0.0.1:${port}`, assets }));
} finally {
  child.kill();
}

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10_000;
    const poll = () => {
      const request = http.get(`http://127.0.0.1:${port}/`, response => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        if (Date.now() > deadline) reject(new Error('Admin server did not start.'));
        else setTimeout(poll, 100);
      });
    };
    poll();
  });
}
