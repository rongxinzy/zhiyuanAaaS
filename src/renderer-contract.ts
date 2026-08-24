import type {
  EnterprisePasswordChangeInput,
  EnterprisePasswordLoginInput,
  EnterpriseSessionResult,
} from './host-contract.js';

export const EnterpriseRendererMessageSource = {
  Host: 'zhiyuan.enterprise.host',
  Module: 'zhiyuan.enterprise.module',
} as const;

export const EnterpriseRendererMessageType = {
  Ready: 'ready',
  Initialize: 'initialize',
  SessionRequest: 'session-request',
  SessionResponse: 'session-response',
} as const;

export const EnterpriseRendererSessionOperation = {
  Snapshot: 'snapshot',
  Login: 'login',
  ChangePassword: 'change-password',
  Logout: 'logout',
} as const;
export type EnterpriseRendererSessionOperation =
  (typeof EnterpriseRendererSessionOperation)[keyof typeof EnterpriseRendererSessionOperation];

export const EnterpriseRendererSurface = {
  SessionGate: 'session-gate',
  Settings: 'settings',
} as const;
export type EnterpriseRendererSurface =
  (typeof EnterpriseRendererSurface)[keyof typeof EnterpriseRendererSurface];

export const EnterpriseRendererLanguage = {
  Chinese: 'zh',
  English: 'en',
} as const;
export type EnterpriseRendererLanguage =
  (typeof EnterpriseRendererLanguage)[keyof typeof EnterpriseRendererLanguage];

export const EnterpriseRendererTheme = {
  Light: 'light',
  Dark: 'dark',
} as const;
export type EnterpriseRendererTheme =
  (typeof EnterpriseRendererTheme)[keyof typeof EnterpriseRendererTheme];

export interface EnterpriseRendererReadyMessage {
  readonly source: typeof EnterpriseRendererMessageSource.Module;
  readonly apiVersion: 1;
  readonly type: typeof EnterpriseRendererMessageType.Ready;
}

export interface EnterpriseRendererInitializeMessage {
  readonly source: typeof EnterpriseRendererMessageSource.Host;
  readonly apiVersion: 1;
  readonly type: typeof EnterpriseRendererMessageType.Initialize;
  readonly surface: EnterpriseRendererSurface;
  readonly language: EnterpriseRendererLanguage;
  readonly theme: EnterpriseRendererTheme;
  readonly session: EnterpriseSessionResult;
}

export type EnterpriseRendererSessionRequestMessage =
  | {
      readonly source: typeof EnterpriseRendererMessageSource.Module;
      readonly apiVersion: 1;
      readonly type: typeof EnterpriseRendererMessageType.SessionRequest;
      readonly requestId: string;
      readonly operation: typeof EnterpriseRendererSessionOperation.Snapshot;
    }
  | {
      readonly source: typeof EnterpriseRendererMessageSource.Module;
      readonly apiVersion: 1;
      readonly type: typeof EnterpriseRendererMessageType.SessionRequest;
      readonly requestId: string;
      readonly operation: typeof EnterpriseRendererSessionOperation.Login;
      readonly input: EnterprisePasswordLoginInput;
    }
  | {
      readonly source: typeof EnterpriseRendererMessageSource.Module;
      readonly apiVersion: 1;
      readonly type: typeof EnterpriseRendererMessageType.SessionRequest;
      readonly requestId: string;
      readonly operation: typeof EnterpriseRendererSessionOperation.ChangePassword;
      readonly input: EnterprisePasswordChangeInput;
    }
  | {
      readonly source: typeof EnterpriseRendererMessageSource.Module;
      readonly apiVersion: 1;
      readonly type: typeof EnterpriseRendererMessageType.SessionRequest;
      readonly requestId: string;
      readonly operation: typeof EnterpriseRendererSessionOperation.Logout;
    };

export interface EnterpriseRendererSessionResponseMessage {
  readonly source: typeof EnterpriseRendererMessageSource.Host;
  readonly apiVersion: 1;
  readonly type: typeof EnterpriseRendererMessageType.SessionResponse;
  readonly requestId: string;
  readonly result: EnterpriseSessionResult;
}
