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

`npm run build` emits `dist/extension.cjs`. During public application development, set
`ZHIYUAN_ENTERPRISE_EXTENSION_DEV_PATH` to the absolute path of that file. Enterprise packaging
uses `build/electron-builder.overlay.yml` to place the same artifact at
`resources/zhiyuan-enterprise/extension.cjs` without overwriting public source files.

The current extension is an API v1 lifecycle skeleton. Authentication IPC, local token storage,
managed model projection, Skill reconciliation, and control-event processing will be introduced
as separately reviewed capabilities.

## Password Session Foundation

The extension provides a password-only AEP session service for Zhiyuan accounts. Operations are
serialized, concurrent startup restoration is coalesced, and no username or password is retained.
Only the refresh token is persisted through `ProtectedFileStorage`; callers must supply the
platform encryption adapter through `SafeStorageProtector`. Access and model tokens remain in the
AEP SDK's in-memory session state.

The session foundation is exposed through the public host's narrow session capability v1. No login
UI is included in this stage.

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
