# Zhiyuan Enterprise Extension

This repository builds the enterprise extension loaded by the public Zhiyuan application.
Enterprise AEP configuration, policy, release inputs, and implementation remain isolated here; the
public application contains only the versioned extension host.

## Pinned Inputs

`build/build-manifest.json` is the source of truth for release inputs. It pins the exact public
core commit, extension version, host API version, AEP SDK Release asset, and SDK SHA-256 digest.
Branches are never accepted as release inputs.

## Development

Node.js 24 is required.

```bash
npm ci
npm run check
```

`npm run build` emits the Node extension at `dist/extension.cjs` and the enterprise session UI at
`dist/ui/index.html`. During public application development, set
`ZHIYUAN_ENTERPRISE_EXTENSION_DEV_PATH` to the absolute path of the extension bundle. Set
`ZHIYUAN_ENTERPRISE_RENDERER_DIRECTORY` to the absolute path of `dist/ui` when packaging the public
application. `build/electron-builder.overlay.yml` places both outputs under
`resources/zhiyuan-enterprise` without overwriting public source files.

The current extension provides API v1 lifecycle, password-session, enterprise renderer, enterprise
account settings, and managed model projection capabilities. Skill reconciliation and control-event
processing remain separately reviewed capabilities.

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
The same settings surface includes a managed-model view with loading, empty, retry, and populated
states. It reads only the public host's normalized model catalog; connection URLs and credentials
remain unavailable to the sandboxed renderer.

## Managed Models

The extension registers `external.zhiyuan` through external model capability v1 and projects only
enabled, assigned, OpenAI-compatible gateway models returned by AEP. The public renderer receives
display metadata and conservative capability flags; it never receives the gateway URL or model
access token. The provider is exclusive, so enterprise builds hide community and local model
configuration and the runtime rejects every model reference outside the AEP-authorized catalog.

The model connection is resolved from the authenticated SDK session when the runtime starts a turn.
The SDK refresh path rotates the short-lived model token before it is handed to the main-process
runtime. Session transitions trigger an immediate model refresh, while a 30-second comparison poll
detects remote assignment changes. Temporary control-plane failures preserve the last displayed
model list, and authorization is checked again before every conversation turn.

## Runtime Configuration

Enterprise packaging must provide `resources/zhiyuan-enterprise/config.json`; use
`build/enterprise-config.example.json` as the schema reference. The file contains only the AEP base
URL and the explicit insecure-HTTP development switch. Customer credentials are never build
inputs. Each installation creates a stable UUID under the application user-data directory for AEP
Agent binding.

The extension registers its password-session provider through public session capability v1. It
uses Electron platform encryption for refresh-token persistence and unregisters the provider during
application shutdown. The renderer receives only normalized session and identity snapshots.

## License

The npm package is marked private and `UNLICENSED`. The root legal notice is interim and must be
reviewed before any external distribution.
