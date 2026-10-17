export type ChannelProvider = 'feishu' | 'wecom' | 'wechat';
export type EmployeeChannel = {
  readonly provider: ChannelProvider;
  readonly enabled: boolean;
  readonly runtimeReady: boolean;
  readonly configured: boolean;
  readonly workerState: 'unknown' | 'running' | 'connected' | 'stopped';
  readonly values: Readonly<Record<string, string>>;
  readonly hasSecret: boolean;
};
export type EmployeeChannels = {
  readonly employee: string;
  readonly phase: string;
  readonly runtimeAvailable: boolean;
  readonly hibernationEnabled: boolean;
  readonly checkedAt?: string;
  readonly providers: readonly EmployeeChannel[];
};
export type ChannelQR = {
  readonly id: string;
  readonly status: 'pending' | 'scanned' | 'verification_required' | 'confirmed' | 'expired' | 'failed';
  readonly qrcode_content: string;
  readonly expires_in: number;
};

type ChannelRequest = (
  method: string,
  path: string,
  body?: unknown,
  headers?: Readonly<Record<string, string>>,
  signal?: AbortSignal,
) => Promise<{ readonly status: number; readonly data: unknown }>;

export class ChannelClient {
  constructor(
    private readonly request: ChannelRequest,
    private readonly error: (status: number, data: unknown) => Error,
    private readonly invalid: (message: string) => Error,
  ) {}

  async employeeChannels(name: string, signal?: AbortSignal): Promise<EmployeeChannels> {
    const { status, data } = await this.request(
      'GET',
      `/api/v1/employees/${encodeURIComponent(name)}/channels`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw this.error(status, data);
    const result = data as EmployeeChannels | null;
    if (
      !result ||
      result.employee !== name ||
      typeof result.phase !== 'string' ||
      typeof result.runtimeAvailable !== 'boolean' ||
      typeof result.hibernationEnabled !== 'boolean' ||
      !Array.isArray(result.providers) ||
      result.providers.length !== 3
    )
      throw this.invalid('Invalid channel response');
    const seen = new Set<string>();
    const providers = result.providers.map((item) => {
      if (
        !item ||
        !['feishu', 'wecom', 'wechat'].includes(item.provider) ||
        seen.has(item.provider) ||
        typeof item.enabled !== 'boolean' ||
        typeof item.runtimeReady !== 'boolean' ||
        typeof item.configured !== 'boolean' ||
        typeof item.hasSecret !== 'boolean' ||
        !['unknown', 'running', 'connected', 'stopped'].includes(item.workerState)
      )
        throw this.invalid('Invalid channel response');
      seen.add(item.provider);
      const values: Record<string, string> = {};
      const key = item.provider === 'feishu' ? 'app_id' : item.provider === 'wecom' ? 'bot_id' : '';
      if (key && typeof item.values?.[key] === 'string') values[key] = item.values[key];
      return {
        provider: item.provider,
        enabled: item.enabled,
        runtimeReady: item.runtimeReady,
        configured: item.configured,
        workerState: item.workerState,
        hasSecret: item.hasSecret,
        values,
      };
    });
    return { ...result, providers };
  }

  async activateChannel(name: string, provider: ChannelProvider, enabled: boolean): Promise<void> {
    const { status, data } = await this.request(
      'PUT',
      `/api/v1/employees/${encodeURIComponent(name)}/channels/${provider}/activation`,
      { enabled },
    );
    if (status !== 202) throw this.error(status, data);
  }

  async wakeChannelEmployee(name: string): Promise<void> {
    const { status, data } = await this.request('POST', `/api/v1/employees/${encodeURIComponent(name)}/channels/wake`);
    if (status !== 202) throw this.error(status, data);
  }

  async configureChannel(
    name: string,
    provider: ChannelProvider,
    values: Readonly<Record<string, string>>,
  ): Promise<void> {
    const { status, data } = await this.request(
      'POST',
      `/api/v1/employees/${encodeURIComponent(name)}/channels/${provider}/runtime-config`,
      { values },
    );
    if (status !== 200 || (data as { accepted?: unknown } | null)?.accepted !== true) throw this.error(status, data);
  }

  async restartChannel(name: string, provider: ChannelProvider): Promise<void> {
    const { status, data } = await this.request(
      'POST',
      `/api/v1/employees/${encodeURIComponent(name)}/channels/${provider}/restart`,
    );
    if (status !== 200 || (data as { accepted?: unknown } | null)?.accepted !== true) throw this.error(status, data);
  }

  async channelQR(
    name: string,
    action: 'qr-login' | 'qr-poll' | 'qr-cancel',
    id?: string,
    verifyCode?: string,
    signal?: AbortSignal,
  ): Promise<ChannelQR | null> {
    const { status, data } = await this.request(
      'POST',
      `/api/v1/employees/${encodeURIComponent(name)}/channels/wechat/${action}`,
      id ? { id, ...(verifyCode ? { verifyCode } : {}) } : undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw this.error(status, data);
    if (action === 'qr-cancel') return null;
    const result = data as ChannelQR | null;
    if (
      !result ||
      typeof result.id !== 'string' ||
      typeof result.qrcode_content !== 'string' ||
      typeof result.expires_in !== 'number' ||
      !['pending', 'scanned', 'verification_required', 'confirmed', 'expired', 'failed'].includes(result.status)
    )
      throw this.invalid('Invalid QR response');
    return result;
  }
}
