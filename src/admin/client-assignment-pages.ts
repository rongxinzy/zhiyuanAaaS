import { HttpMethod } from '@aep/sdk-node';
import type { ClientContext } from './client-context.js';

/** The pinned SDK assignment reads predate cursor parameters. Reuse the
 * authenticated transport rather than silently dropping every page after one. */
export async function listAssignmentPages<T>(
  context: ClientContext,
  resource: 'skill' | 'model' | 'credential',
): Promise<T[]> {
  const client = context.requireClient();
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const query = new URLSearchParams({ limit: '200' });
    if (cursor) query.set('cursor', cursor);
    const page = await context.request<{
      items?: T[];
      assignments?: T[];
      nextCursor?: string | null;
    }>(client, { method: HttpMethod.Get, path: `/aep/v1/admin/${resource}-assignments?${query}` });
    const values = resource === 'skill' ? page.items : page.assignments;
    if (!Array.isArray(values)) throw new Error('Invalid AEP assignment page.');
    items.push(...values);
    cursor = page.nextCursor ?? null;
    if (!cursor) return items;
    if (seen.has(cursor)) throw new Error('Repeated AEP assignment cursor.');
    seen.add(cursor);
  }
}
