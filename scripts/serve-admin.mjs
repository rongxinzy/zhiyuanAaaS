import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/admin');
const target = new URL(process.env.ZHIYUAN_AEP_BASE_URL ?? 'http://localhost:8080');
const port = Number(process.env.ZHIYUAN_ADMIN_PORT ?? 5173);

const server = http.createServer(async (request, response) => {
  try {
    if (request.url?.startsWith('/aep/')) {
      await proxy(request, response);
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const body = await fs.readFile(file).catch(() => fs.readFile(path.join(root, 'index.html')));
    response.writeHead(200, { 'content-type': contentType(file) }).end(body);
  } catch {
    response.writeHead(502).end('Bad gateway');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Zhiyuan Admin Console: http://127.0.0.1:${port}`);
});

async function proxy(request, response) {
  const upstream = new URL(request.url, target);
  const headers = { ...request.headers, host: upstream.host };
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request;
  const result = await fetch(upstream, { method: request.method, headers, body, duplex: body ? 'half' : undefined });
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.map')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}
