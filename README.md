# Zhiyuan Enterprise Extension

This repository builds the enterprise extension loaded by the public Zhiyuan application.
Enterprise AEP configuration, policy, release inputs, and implementation remain isolated here; the
public application contains only the versioned extension host.

## Pinned Inputs

`build/build-manifest.json` is the source of truth for release inputs. It pins the exact public
core and AEP protocol commits, extension version, host API version, AEP SDK Release asset, and SDK
SHA-256 digest. Branches are never accepted as release inputs.

## Development

Node.js 24 is required.

```bash
npm ci
npm run check
```

The Admin Console is a standalone browser entrypoint for enterprise operators. Start the AEP
control service first, then run the console in a second terminal:

```bash
npm run dev:admin
```

Open the URL printed by Vite (normally `http://localhost:5173`). The console defaults to
`http://localhost:8080` for AEP; set `VITE_AEP_BASE_URL` when the service uses another address. Sign
in with an account carrying the `admin` or `enterprise_admin` role. The current MVP restores the
browser session, enforces the administrator role, and shows users, Agents, Skills, enterprise models,
and pending control events. Use `npm run build:admin` to emit the deployable static console at
`dist/admin`.

For a same-origin deployment, build first and use the bundled static server instead:

```bash
npm run verify:admin
npm run serve:admin
```

The server serves the console and proxies `/aep/*` to `ZHIYUAN_AEP_BASE_URL` (default
`http://localhost:8080`). Set `ZHIYUAN_ADMIN_PORT` to change the listen port.

`npm run build` emits the Node extension at `dist/extension.cjs`, the enterprise session UI at
`dist/ui/index.html`, and the standalone Admin Console at `dist/admin/index.html`. During public
application development, set `ZHIYUAN_ENTERPRISE_EXTENSION_DEV_PATH` to the absolute path of the
extension bundle. When packaging, set `ZHIYUAN_ENTERPRISE_EXTENSION_BUNDLE`,
`ZHIYUAN_ENTERPRISE_RENDERER_DIRECTORY`, `ZHIYUAN_ENTERPRISE_ADMIN_DIRECTORY`,
`ZHIYUAN_ENTERPRISE_NOTICE_FILE`, and `ZHIYUAN_ENTERPRISE_CONFIG_FILE` to paths relative to the
public application root. electron-builder resolves every `FileSet.from` against that root and does
not accept Windows absolute paths for these entries.
`build/electron-builder.overlay.yml` places all outputs under
`resources/zhiyuan-enterprise` without overwriting public source files.

The current extension provides API v1 lifecycle, password-session, enterprise renderer, enterprise
account settings, managed model projection, and Agent control. Authenticated sessions automatically
start the control loop, while sign-out and Electron shutdown stop it before releasing local state.

## Agent Control Backend

`createZhiyuanAgentControlBackend` creates the Node-only control runtime without requiring Electron.
It persists the control cursor, inbox, telemetry outbox, applied Skill revision, and managed Skill
ownership in SQLite. Events are stored before acknowledgement and resumed after restart. Skill ZIPs
are size and SHA-256 checked, extracted with traversal and symbolic-link protection, and installed
through staging and atomic directory replacement. Revocation removes only directories recorded as
managed by Zhiyuan.

The backend requires an authenticated AEP SDK client and explicit database and managed-Skill paths.
The Electron extension shares the password session's client with this backend, stores its SQLite
state under the application user-data directory, and installs assigned Skills only into the managed
root allocated by the public host. Successful filesystem changes notify the host SkillManager. The
headless factory remains exported for deterministic verification and service-independent testing.

With a local AEP control service running on `http://localhost:8080`, run the real backend scenario:

```bash
npm run verify:agent-control:e2e
```

The command creates isolated test data, verifies install and revocation end to end, removes the Skill
and assignment, and disables the temporary account. Override the endpoint and administrator login
with `ZHIYUAN_AEP_BASE_URL`, `ZHIYUAN_AEP_ENTERPRISE_ID`, `ZHIYUAN_AEP_ADMIN_USERNAME`, and
`ZHIYUAN_AEP_ADMIN_PASSWORD`.

Before invoking electron-builder, verify the closed-source package inputs with:

```bash
npm run build
npm run verify:package-inputs
```

The check validates the extension bundle, Renderer entrypoint, legal notice, and enterprise
configuration that the public application's `build/electron-builder.overlay.yml` injects under
`resources/zhiyuan-enterprise`. It also prints SHA-256 values and the immutable core, protocol,
and SDK pins used for the package. Override `ZHIYUAN_ENTERPRISE_EXTENSION_BUNDLE`,
`ZHIYUAN_ENTERPRISE_RENDERER_DIRECTORY`, `ZHIYUAN_ENTERPRISE_NOTICE_FILE`, or
`ZHIYUAN_ENTERPRISE_CONFIG_FILE` when packaging from a staging directory.

After `electron-builder --dir` finishes, verify the generated application directory with:

```bash
npm run verify:electron-package
```

Set `ZHIYUAN_ELECTRON_PACKAGE_DIR` when the output is not the sibling
`../zhiyuan-dev/dist/win-unpacked` directory. The check compares every injected enterprise file
against the AaaS build output and fails on missing, extra, or mismatched Renderer assets.

For a reproducible Windows installer, run the `Build Windows enterprise package` GitHub Actions
workflow from `main`. The workflow checks out the exact Zhiyuan core commit pinned in
`build/build-manifest.json`, prepares the pinned PortableGit, uv, Python, and Skill Python runtimes,
builds the overlay installer, verifies every injected enterprise asset and bundled runtime, and
performs the install/upgrade/uninstall smoke test. Its artifact contains the installer and
`SHA256SUMS.txt` and is retained for 14 days.

Local packaging uses the same `build/electron-builder.overlay.yml`, but the public core's packaging
hooks require reachable upstream release downloads or pre-populated offline inputs. In restricted
networks, set `ZHIYUAN_PORTABLE_GIT_ARCHIVE` and `ZHIYUAN_PORTABLE_UV_ARCHIVE` to the pinned archives
expected by the core scripts and prepare the uv-managed Python and Skill Python directories before
running electron-builder. A package made by disabling the host `beforePack` or `afterPack` hooks is
only suitable for renderer smoke testing and must not be published.

## Password Session Foundation

The extension provides a password-only AEP session service for Zhiyuan accounts. Operations are
serialized, concurrent startup restoration is coalesced, and no username or password is retained.
Only the refresh token is persisted through `ProtectedFileStorage`; callers must supply the
platform encryption adapter through `SafeStorageProtector`. Access and model tokens remain in the
AEP SDK's in-memory session state.

The session foundation is exposed through the public host's narrow session capability v1. The
enterprise renderer uses the host's renderer capability v1 for password login, recoverable-session
handling, and mandatory password changes. The renderer receives normalized session snapshots only;
access, refresh, and model tokens never cross into the iframe.

## Enterprise Account Settings

The extension registers an `Enterprise account` / `企业账户` page through settings capability
v1. The page reuses the sandboxed renderer bundle with a distinct `settings` surface and displays
only the normalized identity snapshot supplied by the host. Authenticated users can review their
user, email, enterprise, roles, and session expiry, change their password, or sign out. Signing out
publishes the normalized session transition so the public application's session gate takes control.
The extension also registers a separate `Enterprise models` / `企业模型` page with loading, empty,
retry, and populated states. It reads only the public host's normalized model catalog; connection
URLs and credentials remain unavailable to the sandboxed renderer. Account and model settings are
separate peer entries in the application settings sidebar rather than tabs inside one page.

## Managed Models

The extension registers the managed `custom_enterprise` configuration source and projects only
enabled, assigned, OpenAI-compatible gateway models returned by AEP into the public core's existing
custom-provider configuration. The public renderer receives display metadata and conservative
capability flags; it never receives the gateway URL or model access token. The source is exclusive,
so enterprise builds hide community and local model configuration and reject model references
outside the AEP-authorized catalog even while the control plane is unavailable.

AEP reasoning compatibility metadata is projected into the custom model's existing Pi runtime
configuration. A DeepSeek-compatible assignment enables reasoning-effort forwarding and preserves
assistant `reasoning_content` when a tool-call conversation continues. No second model runtime is
introduced.

The provider snapshot resolves its connection from the authenticated SDK session. Session
transitions trigger an immediate refresh, while a 30-second poll refreshes assignments and the
short-lived model token. Temporary control-plane failures clear the managed snapshot without
reopening personal providers; the exclusive policy remains active independently.

## Runtime Configuration

Enterprise packaging must provide `resources/zhiyuan-enterprise/config.json`; use
`build/enterprise-config.example.json` as the schema reference. It contains the AEP base URL, the
explicit insecure-HTTP development switch, and (when license activation is enabled) the license
file name, deployment ID, and trusted public keys. Customer credentials and license private keys
are never build inputs. Each installation creates a stable UUID under the application user-data
directory for AEP Agent binding.

The extension registers its password-session provider through public session capability v1 and its
managed Skill root through Skill capability v1. It uses Electron platform encryption for refresh-token
persistence, starts Agent control only while authenticated, and closes the control database before
unregistering the managed root during shutdown. The renderer receives only normalized session and
identity snapshots.

## License

The npm package is marked private and `UNLICENSED`. The root legal notice is interim and must be
reviewed before any external distribution.
