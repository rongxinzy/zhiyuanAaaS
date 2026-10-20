import { describe, expect, test } from 'vitest';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { knowledgeErrorText } from './knowledge-error.js';
import { PortalError } from './portal.js';

describe('knowledgeErrorText', () => {
  test('maps retrieval denial codes instead of the generic management forbidden text', () => {
    expect(knowledgeErrorText(new PortalError(403, 'agent not granted', 'KNOWLEDGE_NOT_GRANTED'))).toBe(
      translate(ADMIN_LANGUAGE, 'knowledgeNotGranted'),
    );
    expect(knowledgeErrorText(new PortalError(403, 'base denied', 'KNOWLEDGE_ACCESS_DENIED'))).toBe(
      translate(ADMIN_LANGUAGE, 'knowledgeAccessDenied'),
    );
    expect(knowledgeErrorText(new PortalError(403, 'admin only', 'ADMIN_REQUIRED'))).toBe(
      translate(ADMIN_LANGUAGE, 'knowledgeAdminRequired'),
    );
  });

  test('keeps the generic management forbidden text for unrecognized 403 codes', () => {
    expect(knowledgeErrorText(new PortalError(403, 'forbidden'))).toBe(
      translate(ADMIN_LANGUAGE, 'knowledgeForbiddenManaged'),
    );
  });
});
