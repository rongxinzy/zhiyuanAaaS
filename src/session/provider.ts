import type {
  EnterprisePasswordChangeInput,
  EnterprisePasswordLoginInput,
  EnterpriseSessionSnapshot,
  ZhiyuanEnterpriseSessionProvider,
} from '../host-contract.js';
import type { ZhiyuanPasswordSession } from './password-session.js';

export class ZhiyuanPasswordSessionProvider implements ZhiyuanEnterpriseSessionProvider {
  readonly #session: ZhiyuanPasswordSession;

  constructor(session: ZhiyuanPasswordSession) {
    this.#session = session;
  }

  snapshot(): EnterpriseSessionSnapshot {
    return this.#session.snapshot();
  }

  login(input: EnterprisePasswordLoginInput): Promise<EnterpriseSessionSnapshot> {
    return this.#session.login(input);
  }

  changePassword(input: EnterprisePasswordChangeInput): Promise<EnterpriseSessionSnapshot> {
    return this.#session.changePassword(input.currentPassword, input.newPassword);
  }

  logout(): Promise<EnterpriseSessionSnapshot> {
    return this.#session.logout();
  }
}
