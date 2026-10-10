import type { IncomingMessage, ServerResponse } from 'node:http';
export function gatewayOrigin(value?: string): URL;
export function proxyGatewayTest(request: IncomingMessage, response: ServerResponse, target: URL): boolean;
