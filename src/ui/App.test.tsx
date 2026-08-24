// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  EnterpriseSessionStatus,
  type EnterpriseSessionResult,
} from '../host-contract.js';
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

    expect(await screen.findByText('Your previous session could not be restored. Sign in again.'))
      .toBeInTheDocument();
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
      ),
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise account' })).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Zhiyuan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  test('fails safely when settings is opened without an authenticated session', async () => {
    render(<App />);
    act(() =>
      initialize(
        { ok: true, snapshot: { status: EnterpriseSessionStatus.SignedOut } },
        EnterpriseRendererLanguage.English,
        EnterpriseRendererSurface.Settings,
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
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      data: {
        source: EnterpriseRendererMessageSource.Host,
        apiVersion: 1,
        type: EnterpriseRendererMessageType.Initialize,
        surface,
        language,
        theme: EnterpriseRendererTheme.Light,
        session,
      },
    }),
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
