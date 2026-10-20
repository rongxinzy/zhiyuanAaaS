import { channelTranslations } from './channel-translations.js';
import { authTranslations } from './i18n-auth.js';
import { computeTranslations } from './i18n-compute.js';
import { employeesTranslations } from './i18n-employees.js';
import { eventsTranslations } from './i18n-events.js';
import { gatewayLimitsTranslations } from './i18n-gateway-limits.js';
import { gatewayObserveTranslations } from './i18n-gateway-observe.js';
import { gatewayTestingTranslations } from './i18n-gateway-testing.js';
import { identityTranslations } from './i18n-identity.js';
import { modelsTranslations } from './i18n-models.js';
import { operationsTranslations } from './i18n-operations.js';
import { permissionsTranslations } from './i18n-permissions.js';
import { pricingTranslations } from './i18n-pricing.js';
import { publicationTranslations } from './i18n-publication.js';
import { routesTranslations } from './i18n-routes.js';
import { shellTranslations } from './i18n-shell.js';
import { skillsTranslations } from './i18n-skills.js';
import { usersTranslations } from './i18n-users.js';
import { knowledgeTranslations } from './knowledge-translations.js';

const translations = {
  zh: {
    ...channelTranslations.zh,
    ...knowledgeTranslations.zh,
    ...publicationTranslations.zh,
    ...pricingTranslations.zh,
    ...gatewayTestingTranslations.zh,
    ...gatewayLimitsTranslations.zh,
    ...gatewayObserveTranslations.zh,
    ...shellTranslations.zh,
    ...employeesTranslations.zh,
    ...authTranslations.zh,
    ...permissionsTranslations.zh,
    ...usersTranslations.zh,
    ...skillsTranslations.zh,
    ...modelsTranslations.zh,
    ...operationsTranslations.zh,
    ...routesTranslations.zh,
    ...eventsTranslations.zh,
    ...identityTranslations.zh,
    ...computeTranslations.zh,
  },
  en: {
    ...channelTranslations.en,
    ...knowledgeTranslations.en,
    ...publicationTranslations.en,
    ...pricingTranslations.en,
    ...gatewayTestingTranslations.en,
    ...gatewayLimitsTranslations.en,
    ...gatewayObserveTranslations.en,
    ...shellTranslations.en,
    ...employeesTranslations.en,
    ...authTranslations.en,
    ...permissionsTranslations.en,
    ...usersTranslations.en,
    ...skillsTranslations.en,
    ...modelsTranslations.en,
    ...operationsTranslations.en,
    ...routesTranslations.en,
    ...eventsTranslations.en,
    ...identityTranslations.en,
    ...computeTranslations.en,
  },
} as const;
export type AdminLanguage = keyof typeof translations;
export type AdminTranslationKey = keyof (typeof translations)['zh'];
export const ADMIN_LANGUAGE: AdminLanguage = 'zh';
export const translate = (language: AdminLanguage, key: AdminTranslationKey): string => translations[language][key];
