# Zhiyuan Enterprise Extension

This private repository builds the closed enterprise extension loaded by the public Zhiyuan
application. Private AEP configuration, enterprise policy, release inputs, and implementation
remain here; the public application contains only the versioned extension host.

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

## License

This repository is private and `UNLICENSED`. The root legal notice is an interim proprietary
notice and must be reviewed before any external distribution.
