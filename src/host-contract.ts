export const ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION = 1 as const;
export const ZHIYUAN_ENTERPRISE_SESSION_CAPABILITY_API_VERSION = 1 as const;
export const ZHIYUAN_ENTERPRISE_RENDERER_CAPABILITY_API_VERSION = 1 as const;
export const ZHIYUAN_ENTERPRISE_SETTINGS_CAPABILITY_API_VERSION = 1 as const;
export const EXTERNAL_MODEL_CAPABILITY_API_VERSION = 1 as const;

export const ExternalModelProtocol = {
  OpenAICompatible: 'openai-compatible',
} as const;
export type ExternalModelProtocol =
  (typeof ExternalModelProtocol)[keyof typeof ExternalModelProtocol];

export const ModelCapabilityStatus = {
  Supported: 'supported',
  Unsupported: 'unsupported',
  Unknown: 'unknown',
} as const;
export type ModelCapabilityStatus =
  (typeof ModelCapabilityStatus)[keyof typeof ModelCapabilityStatus];

export interface ModelCapabilities {
  readonly toolCalling: ModelCapabilityStatus;
  readonly imageInput: ModelCapabilityStatus;
  readonly videoInput: ModelCapabilityStatus;
  readonly audioInput: ModelCapabilityStatus;
  readonly documentInput: ModelCapabilityStatus;
  readonly reasoning: ModelCapabilityStatus;
}

export interface ExternalModelDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly protocol: ExternalModelProtocol;
  readonly capabilities?: Partial<ModelCapabilities>;
  readonly contextWindow?: number;
  readonly isDefault?: boolean;
}

export interface ExternalModelConnection {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelId: string;
}

export const EnterpriseSessionStatus = {
  Unavailable: 'unavailable',
  SignedOut: 'signed-out',
  Recoverable: 'recoverable',
  Authenticated: 'authenticated',
} as const;

export type EnterpriseSessionIdentity = {
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly email?: string | null;
  };
  readonly enterprise: {
    readonly id: string;
    readonly name: string;
  };
  readonly roles: readonly string[];
  readonly sessionExpiresAt: string;
  readonly passwordChangeRequired: boolean;
};

export type EnterpriseSessionSnapshot =
  | { readonly status: typeof EnterpriseSessionStatus.Unavailable }
  | { readonly status: typeof EnterpriseSessionStatus.SignedOut }
  | { readonly status: typeof EnterpriseSessionStatus.Recoverable }
  | {
      readonly status: typeof EnterpriseSessionStatus.Authenticated;
      readonly identity: EnterpriseSessionIdentity;
    };

export type EnterpriseSessionErrorCode = 'UNAVAILABLE' | 'INVALID_INPUT' | 'OPERATION_FAILED';

export type EnterpriseSessionResult =
  | { readonly ok: true; readonly snapshot: EnterpriseSessionSnapshot }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: EnterpriseSessionErrorCode;
        readonly message: string;
      };
    };

export interface EnterprisePasswordLoginInput {
  readonly enterpriseId: string;
  readonly username: string;
  readonly password: string;
}

export interface EnterprisePasswordChangeInput {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface ZhiyuanEnterpriseSessionProvider {
  snapshot(): EnterpriseSessionSnapshot | Promise<EnterpriseSessionSnapshot>;
  login(input: EnterprisePasswordLoginInput): Promise<EnterpriseSessionSnapshot>;
  changePassword(input: EnterprisePasswordChangeInput): Promise<EnterpriseSessionSnapshot>;
  logout(): Promise<EnterpriseSessionSnapshot>;
}

export interface ZhiyuanEnterpriseSessionHostCapability {
  readonly apiVersion: typeof ZHIYUAN_ENTERPRISE_SESSION_CAPABILITY_API_VERSION;
  registerProvider(provider: ZhiyuanEnterpriseSessionProvider): () => void;
}

export interface ZhiyuanEnterpriseRendererHostCapability {
  readonly apiVersion: typeof ZHIYUAN_ENTERPRISE_RENDERER_CAPABILITY_API_VERSION;
  registerSessionGate(entrypoint: string): () => void;
}

export interface ZhiyuanEnterpriseSettingsPageRegistration {
  readonly entrypoint: string;
  readonly labels: {
    readonly zh: string;
    readonly en: string;
  };
}

export interface ZhiyuanEnterpriseSettingsHostCapability {
  readonly apiVersion: typeof ZHIYUAN_ENTERPRISE_SETTINGS_CAPABILITY_API_VERSION;
  registerPage(page: ZhiyuanEnterpriseSettingsPageRegistration): () => void;
}

export interface ExternalModelProvider {
  readonly id: string;
  readonly displayName: string;
  listModels(): Promise<readonly ExternalModelDescriptor[]>;
  resolveConnection(modelId: string): Promise<ExternalModelConnection>;
  onDidChange?(listener: () => void): () => void;
}

export interface ExternalModelHostCapability {
  readonly apiVersion: typeof EXTERNAL_MODEL_CAPABILITY_API_VERSION;
  registerProvider(provider: ExternalModelProvider): () => void;
}

export interface ZhiyuanEnterpriseHostContext {
  readonly apiVersion: typeof ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION;
  readonly appVersion: string;
  readonly isPackaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly paths: {
    readonly resources: string;
    readonly userData: string;
  };
  readonly capabilities: {
    readonly session: ZhiyuanEnterpriseSessionHostCapability | null;
    readonly renderer: ZhiyuanEnterpriseRendererHostCapability | null;
    readonly settings: ZhiyuanEnterpriseSettingsHostCapability | null;
    readonly models: ExternalModelHostCapability | null;
  };
}

export interface ZhiyuanEnterpriseExtension {
  readonly apiVersion: typeof ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION;
  readonly id: string;
  initialize(context: ZhiyuanEnterpriseHostContext): Promise<void>;
  dispose(): Promise<void>;
}
