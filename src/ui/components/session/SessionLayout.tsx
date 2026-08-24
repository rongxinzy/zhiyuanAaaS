import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import type { EnterpriseRendererLanguage } from '../../../renderer-contract.js';
import { translate } from '../../i18n.js';

interface SessionLayoutProps {
  readonly language: EnterpriseRendererLanguage;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

export function SessionLayout({ language, title, description, children }: SessionLayoutProps) {
  return (
    <main className="flex min-h-full items-center justify-center bg-background p-6">
      <section className="flex w-full max-w-md flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-card">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <span className="text-base font-semibold">{translate(language, 'brand')}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold leading-snug">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
