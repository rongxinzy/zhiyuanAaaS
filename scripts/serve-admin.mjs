import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/admin');
const proxyTargets = Object.freeze([
  Object.freeze({ prefix: '/aep/', target: new URL(process.env.ZHIYUAN_AEP_BASE_URL ?? 'http://localhost:8080') }),
  // Digital-employee portal APIs, same-origin like /aep (no CORS, CSP stays 'self').
  Object.freeze({ prefix: '/api/', target: new URL(process.env.ZHIYUAN_PORTAL_BASE_URL ?? 'http://localhost:30190') }),
]);
// Companion messenger (Pi Durable 搭档): embedded as a same-origin iframe from
// the workbench home (/companion/). Streamed — not buffered — so the 搭档 SSE
// (/api/conversations/:id/stream) passes through live. The prefix is stripped
// before proxying; the companion server stays prefix-unaware.
const companionTarget = new URL(process.env.ZHIYUAN_COMPANION_BASE_URL ?? 'http://localhost:8080');
const port = Number(process.env.ZHIYUAN_ADMIN_PORT ?? 5173);
// The WeKnora frontend cannot live under a /weknora/ subpath here: its build
// references assets with root-absolute paths and its runtime calls /api/v1,
// which this server already routes to the portal. Instead it gets a second
// listener (own port, root path) that transparently proxies the WeKnora
// nginx — assets, /api, websockets all pass through untouched.
const weknoraPort = Number(process.env.ZHIYUAN_ADMIN_WEKNORA_PORT ?? 5174);
const weknoraTarget = new URL(process.env.ZHIYUAN_WEKNORA_UI_URL ?? 'http://frontend.weknora.svc.cluster.local');
const securityHeaders = Object.freeze({
  'content-security-policy': [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Embedded conversation pane: the chat UI is a different origin (same
    // host, NodePort 30195). default-src 'self' would block the frame.
    "frame-src 'self' http://*:30195 https://*:30195",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ].join('; '),
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
});

const server = http.createServer(async (request, response) => {
  // Companion routes set their own (embedding-aware) policy inside
  // proxyCompanion — pre-setting the base headers here would layer a second
  // CSP on top; with multiple policies the strictest directives win, so the
  // base frame-ancestors 'none' + X-Frame-Options DENY would block the
  // workbench iframe.
  let isCompanionRoute = false;
  try {
    // Inside the try: llhttp accepts request-targets that WHATWG URL rejects
    // (`GET http://[ HTTP/1.1`); an uncaught parse error here would take the
    // whole process (console + WeKnora proxy) down with one packet.
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    isCompanionRoute = pathname === '/companion' || pathname.startsWith('/companion/');
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (!isCompanionRoute) {
    for (const [name, value] of Object.entries(securityHeaders)) {
      response.setHeader(name, value);
    }
  }
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    // /companion → /companion/ : the messenger's relative asset URLs resolve
    // against the document directory, so the trailing slash is load-bearing.
    if (url.pathname === '/companion') {
      response.writeHead(301, { location: '/companion/' }).end();
      return;
    }
    if (url.pathname === '/companion/' || url.pathname.startsWith('/companion/')) {
      await proxyCompanion(request, response, url);
      return;
    }
    const route = proxyTargets.find((candidate) => request.url?.startsWith(candidate.prefix));
    if (route) {
      await proxy(request, response, route.target, { policy: true });
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

// WeKnora passthrough: no console security headers — the upstream page needs
// its own (inline scripts would break under script-src 'self'), and the
// upstream's own headers are forwarded verbatim.
const weknoraServer = http.createServer(async (request, response) => {
  try {
    await proxy(request, response, weknoraTarget, { policy: false });
  } catch {
    response.writeHead(502).end('Bad gateway');
  }
});

// Default loopback matches the local dev flow; containers set
// ZHIYUAN_ADMIN_HOST=0.0.0.0 so the NodePort service can reach the server.
const host = process.env.ZHIYUAN_ADMIN_HOST ?? '127.0.0.1';
server.listen(port, host, () => {
  console.log(`Zhiyuan Admin Console: http://${host}:${port}`);
});
weknoraServer.listen(weknoraPort, host, () => {
  console.log(`WeKnora console proxy: http://${host}:${weknoraPort} -> ${weknoraTarget}`);
});

async function proxy(request, response, target, { policy }) {
  const upstream = new URL(request.url, target);
  const headers = { ...request.headers, host: upstream.host };
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request;
  const result = await fetch(upstream, { method: request.method, headers, body, duplex: body ? 'half' : undefined });
  // Multiple Set-Cookie headers (portal session + csrf) collapse into one
  // comma-joined entry through Object.fromEntries — the browser would drop
  // every cookie after the first. Undici exposes them properly via
  // getSetCookie(); re-emit them as a real header array.
  const forwarded = { ...Object.fromEntries(result.headers) };
  delete forwarded['set-cookie'];
  if (policy) Object.assign(forwarded, securityHeaders);
  const setCookies = result.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    response.setHeader('set-cookie', setCookies);
  }
  response.writeHead(result.status, forwarded);
  response.end(Buffer.from(await result.arrayBuffer()));
}

// Companion proxy: same shape as proxy() but STREAMS the body (the messenger's
// SSE must not be buffered) and, for HTML documents, swaps the embedding-hostile
// headers (frame-ancestors 'none' + X-Frame-Options DENY) for frame-ancestors
// 'self' so the workbench iframe can load it. Sub-resources keep the full
// policy: script-src 'self' still covers the messenger's module bundle.
async function proxyCompanion(request, response, url) {
  // Assign the path onto a parsed copy of the target — never string-replace
  // and re-parse. `/companion//evil/x` strips to `//evil/x`, and a WHATWG
  // parse of that treats `evil` as the AUTHORITY: one line of string
  // surgery turns this proxy into an open relay that forwards the caller's
  // portal cookies to an arbitrary host.
  const upstream = new URL(companionTarget);
  upstream.pathname = url.pathname.replace(/^\/companion\/?/, '/');
  upstream.search = url.search;
  const headers = { ...request.headers, host: upstream.host };
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request;
  let result;
  try {
    result = await fetch(upstream, { method: request.method, headers, body, duplex: body ? 'half' : undefined });
  } catch (error) {
    // Upstream unreachable: answer with the console's own headers rather
    // than a bare 502 (the pre-set header loop was skipped for this route).
    for (const [name, value] of Object.entries(securityHeaders)) {
      response.setHeader(name, value);
    }
    response.writeHead(502).end('Bad gateway');
    return;
  }
  const forwarded = { ...Object.fromEntries(result.headers) };
  delete forwarded['set-cookie'];
  delete forwarded['content-encoding']; // undici already decompressed the stream
  delete forwarded['content-length']; // may mismatch after decompression
  delete forwarded['transfer-encoding'];
  const setCookies = result.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    response.setHeader('set-cookie', setCookies);
  }
  const isHtml = (forwarded['content-type'] ?? '').includes('text/html');
  Object.assign(forwarded, securityHeaders);
  if (isHtml) {
    // Embeddable document: the base policy's frame-ancestors 'none' CSP
    // directive and X-Frame-Options DENY would block the workbench iframe.
    delete forwarded['x-frame-options'];
    forwarded['content-security-policy'] = securityHeaders['content-security-policy'].replace(
      "frame-ancestors 'none'",
      "frame-ancestors 'self'",
    );
  }
  response.writeHead(result.status, forwarded);
  if (!result.body) {
    response.end();
    return;
  }
  const reader = result.body.getReader();
  request.on('close', () => {
    reader.cancel().catch(() => {});
  });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(Buffer.from(value));
    }
  } catch {
    // client disconnect or upstream error mid-stream: end quietly
  }
  response.end();
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.map')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}
