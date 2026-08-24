export const ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION = 1 as const;
export const ZHIYUAN_ENTERPRISE_SESSION_CAPABILITY_API_VERSION = 1 as const;

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
  | { readonly status: 'unavailable' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'recoverable' }
  | { readonly status: 'authenticated'; readonly identity: EnterpriseSessionIdentity };

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
  };
}

export interface ZhiyuanEnterpriseExtension {
  readonly apiVersion: typeof ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION;
  readonly id: string;
  initialize(context: ZhiyuanEnterpriseHostContext): Promise<void>;
  dispose(): Promise<void>;
}
