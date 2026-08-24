import { CircleAlert, LogIn } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import type { EnterpriseRendererLanguage } from '../../../renderer-contract.js';
import { Alert, AlertDescription } from '../ui/alert.js';
import { Button } from '../ui/button.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/field.js';
import { Input } from '../ui/input.js';
import { Spinner } from '../ui/spinner.js';
import { translate, type TranslationKey } from '../../i18n.js';

interface LoginFormProps {
  readonly language: EnterpriseRendererLanguage;
  readonly recoverable: boolean;
  readonly pending: boolean;
  readonly error: TranslationKey | null;
  readonly onSubmit: (input: {
    enterpriseId: string;
    username: string;
    password: string;
  }) => Promise<void>;
}

export function LoginForm({ language, recoverable, pending, error, onSubmit }: LoginFormProps) {
  const [enterpriseId, setEnterpriseId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<TranslationKey | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enterpriseId.trim() || !username.trim() || !password) {
      setValidationError('requiredFields');
      return;
    }
    setValidationError(null);
    void onSubmit({ enterpriseId: enterpriseId.trim(), username: username.trim(), password });
  };

  const displayedError = validationError ?? error;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {recoverable ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{translate(language, 'sessionRecoveryFailed')}</AlertDescription>
        </Alert>
      ) : null}
      {displayedError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{translate(language, displayedError)}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={displayedError ? true : undefined}>
          <FieldLabel htmlFor="enterprise-id">{translate(language, 'enterpriseId')}</FieldLabel>
          <Input
            id="enterprise-id"
            name="enterpriseId"
            value={enterpriseId}
            onChange={event => setEnterpriseId(event.target.value)}
            placeholder={translate(language, 'enterpriseIdPlaceholder')}
            autoComplete="organization"
            maxLength={256}
            disabled={pending}
            aria-invalid={displayedError ? true : undefined}
            autoFocus
          />
        </Field>
        <Field data-invalid={displayedError ? true : undefined}>
          <FieldLabel htmlFor="username">{translate(language, 'username')}</FieldLabel>
          <Input
            id="username"
            name="username"
            value={username}
            onChange={event => setUsername(event.target.value)}
            placeholder={translate(language, 'usernamePlaceholder')}
            autoComplete="username"
            maxLength={320}
            disabled={pending}
            aria-invalid={displayedError ? true : undefined}
          />
        </Field>
        <Field data-invalid={displayedError ? true : undefined}>
          <FieldLabel htmlFor="password">{translate(language, 'password')}</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder={translate(language, 'passwordPlaceholder')}
            autoComplete="current-password"
            maxLength={1024}
            disabled={pending}
            aria-invalid={displayedError ? true : undefined}
          />
          {validationError ? <FieldError>{translate(language, validationError)}</FieldError> : null}
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? <Spinner data-icon="inline-start" /> : <LogIn data-icon="inline-start" />}
        {translate(language, pending ? 'loggingIn' : 'login')}
      </Button>
    </form>
  );
}
