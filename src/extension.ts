import {
  ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION,
  type ZhiyuanEnterpriseExtension,
  type ZhiyuanEnterpriseHostContext,
} from './host-contract.js';

export const ZHIYUAN_ENTERPRISE_EXTENSION_ID = 'zhiyuan.aaas';

type ExtensionState =
  | { readonly status: 'idle' }
  | { readonly status: 'active'; readonly context: ZhiyuanEnterpriseHostContext }
  | { readonly status: 'disposed' };

class ZhiyuanAaaSExtension implements ZhiyuanEnterpriseExtension {
  readonly apiVersion = ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION;
  readonly id = ZHIYUAN_ENTERPRISE_EXTENSION_ID;
  #state: ExtensionState = { status: 'idle' };

  async initialize(context: ZhiyuanEnterpriseHostContext): Promise<void> {
    if (this.#state.status !== 'idle') {
      throw new Error(`Zhiyuan enterprise extension cannot initialize from ${this.#state.status}.`);
    }
    if (context.apiVersion !== ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION) {
      throw new Error('Zhiyuan enterprise extension host API version is not supported.');
    }
    this.#state = { status: 'active', context };
  }

  async dispose(): Promise<void> {
    this.#state = { status: 'disposed' };
  }
}

export function createZhiyuanEnterpriseExtension(): ZhiyuanEnterpriseExtension {
  return new ZhiyuanAaaSExtension();
}

export { createZhiyuanPasswordSession } from './session/factory.js';
