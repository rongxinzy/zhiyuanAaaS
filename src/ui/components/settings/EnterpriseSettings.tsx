import { Settings2, UserRound, Waypoints } from 'lucide-react';

import type { EnterpriseSessionIdentity, ExternalModel } from '../../../host-contract.js';
import type { EnterpriseRendererLanguage } from '../../../renderer-contract.js';
import { translate, type TranslationKey } from '../../i18n.js';
import { AccountSettings } from './AccountSettings.js';
import { ManagedModels } from './ManagedModels.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.js';

export const EnterpriseSettingsTab = {
  Account: 'account',
  Models: 'models',
} as const;

interface EnterpriseSettingsProps {
  readonly language: EnterpriseRendererLanguage;
  readonly identity: EnterpriseSessionIdentity;
  readonly pending: boolean;
  readonly signingOut: boolean;
  readonly error: TranslationKey | null;
  readonly success: TranslationKey | null;
  readonly loadModels: () => Promise<readonly ExternalModel[]>;
  readonly onPasswordChange: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<boolean>;
  readonly onSignOut: () => Promise<void>;
}

export function EnterpriseSettings({
  language,
  identity,
  pending,
  signingOut,
  error,
  success,
  loadModels,
  onPasswordChange,
  onSignOut,
}: EnterpriseSettingsProps) {
  return (
    <main className="h-full overflow-y-auto bg-background p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card">
            <Settings2 aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-snug">
              {translate(language, 'enterpriseSettingsTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {translate(language, 'enterpriseSettingsDescription')}
            </p>
          </div>
        </header>

        <Tabs defaultValue={EnterpriseSettingsTab.Account}>
          <TabsList aria-label={translate(language, 'enterpriseSettingsViews')}>
            <TabsTrigger value={EnterpriseSettingsTab.Account}>
              <UserRound aria-hidden="true" />
              <span className="truncate">{translate(language, 'accountTab')}</span>
            </TabsTrigger>
            <TabsTrigger value={EnterpriseSettingsTab.Models}>
              <Waypoints aria-hidden="true" />
              <span className="truncate">{translate(language, 'managedModelsTab')}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value={EnterpriseSettingsTab.Account}>
            <AccountSettings
              language={language}
              identity={identity}
              pending={pending}
              signingOut={signingOut}
              error={error}
              success={success}
              onPasswordChange={onPasswordChange}
              onSignOut={onSignOut}
            />
          </TabsContent>
          <TabsContent value={EnterpriseSettingsTab.Models}>
            <ManagedModels language={language} loadModels={loadModels} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
