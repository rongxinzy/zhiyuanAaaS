# Zhiyuan Enterprise Extension Developer Guide

This repository contains the closed-source Zhiyuan enterprise extension. It is
loaded by the public Zhiyuan desktop application through the host capability
contract. Treat this file as the first repository-specific instruction for
coding agents and developers.

## Repository Boundaries

- `D:/rxzy/ZhiyuanAaaS` is the closed enterprise extension and Admin Console.
- `D:/rxzy/Agent-Enterprise-Protocol` is the public AEP contract, SDK, control
  service, gateway authorizer, reconciler, CLI, and integration tests.
- `D:/rxzy/zhiyuan-dev` is the public Zhiyuan desktop application. Keep
  enterprise implementation, policy, deployment configuration, and customer
  data out of that repository.
- Change the public application only when a versioned host capability or
  packaging overlay requires it. Do not copy enterprise source into the public
  tree.
- Pin public Zhiyuan core and AEP SDK inputs to immutable commits/releases in
  `build/build-manifest.json`; branches are not valid release inputs.

Product names, user-visible text, logs, test fixtures, and identifiers must use
Zhiyuan. Do not introduce retired brand names or expose internal runtime names
in product copy.

## Security and Secrets

- Never commit, print, paste into test fixtures, or place in build inputs a
  customer password, cloud model API key, refresh token, license private key,
  or signer private key.
- The license signer is a local/offline release tool and remains outside this
  repository. Runtime packages contain only the license file and trusted public
  keys needed for verification.
- Use environment variables for disposable local credentials, for example
  `ZHIYUAN_AEP_ADMIN_PASSWORD` and `ZHIYUAN_AEP_BASE_URL`.
- Use mock providers for automated tests. Real-provider tests must be explicit,
  time-bounded, and followed by key revocation/rotation and cleanup of temporary
  container configuration.
- The Electron renderer never receives AEP access/refresh/model tokens, gateway
  URLs, provider credentials, or license private material. Keep privileged
  operations in the extension main/runtime boundary.

## Toolchain and Install

- Node.js `>=24 <25` is required.
- Use the checked-in `package-lock.json` with `npm ci`; do not regenerate the
  dependency graph casually. `bun.lock` may be present for local tooling, but
  npm scripts and CI are the canonical path for this repository.
- AEP service development additionally requires Go 1.26, Docker Compose, and
  Git Bash for `gh` operations.

## Development Commands

From this repository:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run verify:admin
npm run verify:bundle
npm run verify:manifest
npm run verify:agent-control:e2e
npm run verify:model-acceptance
npm run verify:package-inputs
npm run verify:electron-package
npm run check
```

The Admin Console is a standalone browser application, not an Electron page:

```bash
npm run dev:admin       # Vite, normally http://localhost:5173
npm run build:admin
npm run serve:admin     # bundled static server; set ZHIYUAN_ADMIN_PORT if needed
```

There is no `admin:dev` script. Set `VITE_AEP_BASE_URL` for Vite development or
`ZHIYUAN_AEP_BASE_URL` for the static server when AEP is not on
`http://localhost:8080`.

## AEP and Gateway Startup Order

Inference and control are deliberately two linked paths:

```text
Electron -> Zhiyuan custom enterprise provider -> Higress OpenAI-compatible gateway -> cloud/local provider
Electron/Admin Console -> AEP control API (identity, catalog, assignments, events, telemetry)
```

Start AEP before the extension or Admin Console:

```bash
cd /d/rxzy/Agent-Enterprise-Protocol
npm ci
npm run compose:gateway:up
# health checks: http://localhost:8080/healthz and http://localhost:8090/healthz
```

The default stack uses a deterministic mock provider. Configure a real
OpenAI-compatible provider only through deployment environment/configuration;
never hard-code its key in `deploy/`, source, or documentation. Stop it with:

```bash
npm run compose:gateway:down
```

## Extension Development with Zhiyuan

Build the extension first, then point the public application's host at the
absolute bundle path:

```powershell
cd D:\rxzy\ZhiyuanAaaS
npm ci
npm run build:extension

cd D:\rxzy\zhiyuan-dev
$env:ZHIYUAN_ENTERPRISE_EXTENSION_DEV_PATH = 'D:\rxzy\ZhiyuanAaaS\dist\extension.cjs'
npm run electron:dev
```

The enterprise extension owns the password session, normalized enterprise
identity, managed model projection, Agent control loop, managed Skill root,
and enterprise settings surfaces. The host owns the Electron window, IPC
registration, local user-data directory, and the public runtime.

## Model and Reasoning Rules

- Enterprise models are projected into Zhiyuan's existing custom-provider
  mechanism. Do not create a second model runtime or a parallel provider UI.
- AEP manages model catalog, assignment, authorization, and short-lived model
  access. Actual inference remains on the direct custom-provider -> Higress path.
- Only enabled and assigned OpenAI-compatible models may be exposed in an
  enterprise build. Community/local provider configuration stays hidden and
  unauthorized model references must be rejected.
- Preserve streaming, multi-turn context, tool calls, and provider
  `reasoning_content`. Reasoning compatibility is model metadata; do not
  hard-code behavior from a model name. Providers may support different
  thinking levels (for example, a model can accept `low/high/max` but not
  `medium`).
- Verify non-streaming, SSE, timeout, 401, retry, reasoning replay, tool
  continuation, and context persistence before claiming a model is accepted.

## Admin Console UI

Before any UI change, read `DESIGN.md`, `src/ui/tea-theme.css`,
`src/ui/index.css`, `src/admin/theme.ts`, and the affected page. The console is
browser-only and communicates through `/aep` HTTP APIs; it must not use
Electron IPC, Node modules, or `process`.

- Use existing shadcn components from `src/ui/components/ui/*` and Lucide
  icons. Do not hand-roll buttons, badges, dialogs, tabs, fields, or icon SVGs.
- Keep the fixed shell: left navigation + top row + content area. Preserve the
  four top-level destinations and existing resource/model/event page ownership.
- Consume Tea/shadcn semantic tokens; do not add hex colors, Tailwind default
  color scales, one-off dark-mode colors, arbitrary spacing, or nested cards.
- Add all user-visible text to `src/admin/i18n.ts` in both Chinese and English.
- Check loading, error, empty, success, disabled, focus, light theme, dark
  theme, desktop, and narrow viewport states.
- After UI changes run `npm run typecheck`, `npm test`, `npm run verify:admin`,
  and `git diff --check`.

## Packaging and Release

The overlay must add files under `resources/zhiyuan-enterprise` without
overwriting public application files. Build and validate the extension inputs:

```bash
cd /d/rxzy/ZhiyuanAaaS
npm run build
npm run verify:package-inputs
```

For a local directory package, configure the relative overlay inputs expected by
`build/electron-builder.overlay.yml`, then run `electron-builder --dir` from the
public Zhiyuan repository. Validate the result with:

```bash
npm run verify:electron-package
```

The reproducible Windows installer is built by the public repository's GitHub
Actions workflow after the exact core commit and AaaS inputs are pinned. A
package made by disabling host packaging hooks is renderer-smoke-only and must
not be published.

## Tests and Acceptance

Use the narrowest relevant test first, then the full gate for release changes:

```bash
npm run verify:agent-control:e2e
npm run verify:model-acceptance
npm run check
```

The control E2E must cover login/session recovery, Agent binding, Skill
download/install/revocation, safe ZIP extraction, event acknowledgement,
telemetry, restart recovery, and managed filesystem ownership. Model acceptance
must cover the two-path request chain and must not expose provider credentials.

## Change and PR Rules

- Make one coherent change per PR and keep PRs stage-oriented (SDK/contract,
  service, extension, UI, packaging, or release verification).
- Commit messages and PR titles follow Conventional Commits.
- Use `apply_patch` for manual edits. Keep generated files and lockfile changes
  only when the command that owns them requires the update.
- Before opening a PR run `git diff --check`, the relevant tests, and inspect
  `git status` for unrelated changes. Never discard existing user changes.
- `gh` commands must be executed from Git Bash, not PowerShell.
