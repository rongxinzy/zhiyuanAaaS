import { UserRound } from 'lucide-react';

import type { EnterpriseSessionIdentity } from '../../../host-contract.js';
import type { EnterpriseRendererLanguage } from '../../../renderer-contract.js';
import { translate, type TranslationKey } from '../../i18n.js';
import { AccountSettings } from './AccountSettings.js';

interface EnterpriseSettingsProps {
  readonly language: EnterpriseRendererLanguage;
  readonly identity: EnterpriseSessionIdentity;
  readonly pending: boolean;
  readonly signingOut: boolean;
  readonly error: TranslationKey | null;
  readonly success: TranslationKey | null;
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
  onPasswordChange,
  onSignOut,
}: EnterpriseSettingsProps) {
  return (
    <main className="h-full overflow-y-auto bg-background p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card">
            <UserRound aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-snug">
              {translate(language, 'accountTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {translate(language, 'accountDescription')}
            </p>
          </div>
        </header>

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
      </div>
    </main>
  );
}
