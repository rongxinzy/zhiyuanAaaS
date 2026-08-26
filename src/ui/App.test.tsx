// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { EnterpriseSessionStatus, type EnterpriseSessionResult } from '../host-contract.js';
import {
  EnterpriseRendererLanguage,
  EnterpriseRendererMessageSource,
  EnterpriseRendererMessageType,
  EnterpriseRendererSurface,
  type EnterpriseRendererSurface as EnterpriseRendererSurfaceValue,
  EnterpriseRendererTheme,
  type EnterpriseRendererLanguage as EnterpriseRendererLanguageValue,
} from '../renderer-contract.js';
import { App } from './App.js';

let postMessage: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  postMessage = vi.spyOn(window, 'postMessage');
});

afterEach(() => {
  cleanup();
  postMessage.mockRestore();
});

describe('enterprise session UI', () => {
  test('renders the Chinese login form for a signed-out session', async () => {
    render(<App />);
    act(() => initialize({ ok: true, snapshot: { status: EnterpriseSessionStatus.SignedOut } }));

    expect(await screen.findByRole('heading', { name: '登录知远' })).toBeInTheDocument();
    expect(screen.getByLabelText('企业 ID')).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  test('renders the English recovery state without exposing host errors', async () => {
    render(<App />);
    act(() =>
      initialize(
        { ok: true, snapshot: { status: EnterpriseSessionStatus.Recoverable } },
        EnterpriseRendererLanguage.English,
      ),
    );

    expect(
      await screen.findByText('Your previous session could not be restored. Sign in again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('renders forced password change with a sign-out escape hatch', async () => {
    render(<App />);
    act(() => initialize(authenticated(true)));

    expect(await screen.findByRole('heading', { name: '更新密码' })).toBeInTheDocument();
    expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
    expect(screen.getByLabelText('新密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认新密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出并重新登录' })).toBeInTheDocument();
  });

  test('renders authenticated account details on the settings surface', async () => {
    render(<App />);
    act(() =>
      initialize(
        authenticated(false),
        EnterpriseRendererLanguage.English,
        EnterpriseRendererSurface.Settings,
        'account',
      ),
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise account' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Zhiyuan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  test('shows a loading skeleton and populated managed models from the host catalog', async () => {
    render(<App />);
    act(() =>
      initialize(
        authenticated(false),
        EnterpriseRendererLanguage.English,
        EnterpriseRendererSurface.Settings,
        'models',
      ),
    );

    expect(screen.getByRole('status', { name: 'Loading managed models' })).toBeInTheDocument();
    await waitForCatalogRequests(1);
    act(() =>
      respondToLatestCatalog({
        ok: true,
        models: [
          {
            id: 'managed-model',
            displayName: 'Managed Model',
            providerKey: 'custom_enterprise',
            providerDisplayName: 'Zhiyuan',
            contextWindow: 128_000,
            isDefault: true,
            capabilities: { toolCalling: 'supported', imageInput: 'supported' },
            baseUrl: 'https://gateway.example.test/v1',
            apiKey: 'must-not-cross-the-frame-boundary',
          },
          {
            id: 'other-model',
            displayName: 'Other provider model',
            providerKey: 'custom_other',
            providerDisplayName: 'Other',
            isDefault: false,
          },
        ],
      }),
    );

    expect(await screen.findByRole('heading', { name: 'Managed Model' })).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('128,000 tokens')).toBeInTheDocument();
    expect(screen.getByText('Tool calling')).toBeInTheDocument();
    expect(screen.getByText('Image input')).toBeInTheDocument();
    expect(screen.queryByText('Other provider model')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('gateway.example.test');
    expect(document.body.textContent).not.toContain('must-not-cross');
  });

  test('shows a useful empty managed-model state', async () => {
    render(<App />);
    act(() =>
      initialize(
        authenticated(false),
        EnterpriseRendererLanguage.English,
        EnterpriseRendererSurface.Settings,
        'models',
      ),
    );
    await waitForCatalogRequests(1);
    act(() => respondToLatestCatalog({ ok: true, models: [] }));

    expect(await screen.findByRole('heading', { name: 'No models assigned' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Refresh' })).not.toHaveLength(0);
  });

  test('normalizes model catalog failures and offers a retry', async () => {
    render(<App />);
    act(() =>
      initialize(
        authenticated(false),
        EnterpriseRendererLanguage.English,
        EnterpriseRendererSurface.Settings,
        'models',
      ),
    );
    await waitForCatalogRequests(1);
    act(() => respondToLatestCatalog({ ok: false, error: 'sensitive host detail' }));

    expect(
      await screen.findByRole('heading', { name: 'Models are unavailable' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('sensitive host detail');
  });

  test('requests a fresh model catalog on manual refresh', async () => {
    render(<App />);
    act(() =>
      initialize(
        authenticated(false),
        EnterpriseRendererLanguage.English,
        EnterpriseRendererSurface.Settings,
        'models',
      ),
    );
    await waitForCatalogRequests(1);
    act(() => respondToLatestCatalog({ ok: true, models: [] }));
    const [refresh] = await screen.findAllByRole('button', { name: 'Refresh' });
    fireEvent.click(refresh!);

    await waitForCatalogRequests(2);
    expect(screen.getByRole('status', { name: 'Loading managed models' })).toBeInTheDocument();
  });

  test('fails safely when settings is opened without an authenticated session', async () => {
    render(<App />);
    act(() =>
      initialize(
        { ok: true, snapshot: { status: EnterpriseSessionStatus.SignedOut } },
        EnterpriseRendererLanguage.English,
        EnterpriseRendererSurface.Settings,
        'account',
      ),
    );

    expect(await screen.findByText('Sign-in required')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });
});

function initialize(
  session: EnterpriseSessionResult,
  language: EnterpriseRendererLanguageValue = EnterpriseRendererLanguage.Chinese,
  surface: EnterpriseRendererSurfaceValue = EnterpriseRendererSurface.SessionGate,
  pageId: string | null = null,
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      data: {
        source: EnterpriseRendererMessageSource.Host,
        apiVersion: 1,
        type: EnterpriseRendererMessageType.Initialize,
        surface,
        pageId,
        language,
        theme: EnterpriseRendererTheme.Light,
        session,
      },
    }),
  );
}

async function waitForCatalogRequests(count: number): Promise<void> {
  await waitFor(() => expect(catalogRequests()).toHaveLength(count));
}

function respondToLatestCatalog(result: unknown): void {
  const request = catalogRequests().at(-1);
  if (!request || typeof request.requestId !== 'string') {
    throw new Error('Expected a model catalog request.');
  }
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      data: {
        source: EnterpriseRendererMessageSource.Host,
        apiVersion: 1,
        type: EnterpriseRendererMessageType.ModelCatalogResponse,
        requestId: request.requestId,
        result,
      },
    }),
  );
}

function catalogRequests(): Array<Record<string, unknown>> {
  const calls = postMessage.mock.calls as unknown as Array<readonly [unknown, ...unknown[]]>;
  return calls
    .map(call => call[0])
    .filter(
      (message: unknown): message is Record<string, unknown> =>
        message !== null &&
        typeof message === 'object' &&
        (message as Record<string, unknown>).type ===
          EnterpriseRendererMessageType.ModelCatalogRequest,
    );
}

function authenticated(passwordChangeRequired: boolean) {
  return {
    ok: true as const,
    snapshot: {
      status: EnterpriseSessionStatus.Authenticated,
      identity: {
        user: { id: 'user-1', displayName: 'Administrator' },
        enterprise: { id: 'enterprise-1', name: 'Zhiyuan' },
        roles: ['admin'],
        sessionExpiresAt: '2026-08-24T12:00:00Z',
        passwordChangeRequired,
      },
    },
  };
}
