# Zhiyuan Admin Console Developer Guide

This repository contains the Zhiyuan Admin Console, a standalone
browser application for enterprise operators that talks to the AEP control
service over HTTP, plus its deployment manifests. Treat this file as the first
repository-specific instruction for coding agents and developers.

## Repository Boundaries

- `D:/rxzy/ZhiyuanAaaS` is the Admin Console and its deployment
  configuration.
- `D:/rxzy/Agent-Enterprise-Protocol` is the public AEP contract, SDK, control
  service, gateway authorizer, reconciler, CLI, and integration tests.
- The enterprise client extension, enterprise renderer, license, agent-control,
  and Windows packaging/signing moved to `rongxinzy/RongxinAI` (the
  `enterprise/` directory there; enterprise Windows installers are built by
  its `Build Zhiyuan Enterprise Windows package` workflow). Do not reintroduce
  extension code, Electron host contracts, or packaging overlays here.
- The public Zhiyuan desktop application lives in `rongxinzy/RongxinAI`; keep
  enterprise implementation, policy, deployment configuration, and customer
  data out of the public tree except through that repository's review process.

Product names, user-visible text, logs, test fixtures, and identifiers must use
Zhiyuan. Do not introduce retired brand names or expose internal runtime names
in product copy.

## Security and Secrets

- Never commit, print, paste into test fixtures, or place in build inputs a
  customer password, cloud model API key, refresh token, license private key,
  or signer private key.
- Use environment variables for disposable local credentials, for example
  `ZHIYUAN_AEP_ADMIN_PASSWORD` and `ZHIYUAN_AEP_BASE_URL`.
- Use mock providers for automated tests. Real-provider tests must be explicit,
  time-bounded, and followed by key revocation/rotation and cleanup of temporary
  container configuration.
- The Admin Console is a browser application and never receives AEP
  access/refresh/model tokens beyond its own operator session, provider
  credentials, or license private material.

## Toolchain and Install

- Node.js `>=24 <25` is required.
- Use the checked-in `package-lock.json` with `npm ci`; do not regenerate the
  dependency graph casually.
- Running the local AEP stack for development requires Docker Compose (see
  below). `gh` operations must run from Git Bash.

## Development Commands

```bash
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run build            # builds the Admin Console to dist/admin
npm run verify:admin
npm run verify:admin:e2e
npm run verify:admin:pricing:e2e
npm run verify:admin:real-e2e  # requires a running AEP Control Service
npm run lint
npm run check            # lint && typecheck && test && build && verify:admin
```

The Admin Console is a standalone browser application:

```bash
npm run dev:admin       # Vite, normally http://localhost:5173
npm run build:admin
npm run serve:admin     # bundled static server; set ZHIYUAN_ADMIN_PORT if needed
```

There is no `admin:dev` script. Set `VITE_AEP_BASE_URL` for Vite development or
`ZHIYUAN_AEP_BASE_URL` for the static server when AEP is not on
`http://localhost:8080`.

## AEP Startup Order

The Admin Console talks only to the AEP control API (identity, catalog,
assignments, events, telemetry); model inference paths belong to the enterprise
extension in RongxinAI. Start AEP before the console:

```bash
cd /d/rxzy/Agent-Enterprise-Protocol
npm ci
npm run compose:gateway:up
# health checks: http://localhost:8080/healthz and http://localhost:8090/healthz
```

The default stack uses a deterministic mock provider. Stop it with:

```bash
npm run compose:gateway:down
```

## Admin Console UI

Before any Admin Console UI change, read `DESIGN.md`, `src/admin/App.tsx`,
`src/admin/main.tsx`, `src/admin/admin.css`, `src/admin/theme.ts`, and the
affected page. The console is
browser-only and communicates through `/aep` HTTP APIs; it must not use
Electron IPC, Node modules, or `process`.

- Use Ant Design components from `antd` and existing business composites from
  `src/admin/components/*`. Use `@ant-design/icons` for new controls; preserve
  existing Lucide icons where already used. Do not hand-roll buttons, tags,
  dialogs, tabs, fields, selects, or icon SVGs.
- Keep the fixed shell: left navigation + top row + content area. Preserve the
  current destinations, permissions, route compatibility, and page ownership
  defined in `src/admin/App.tsx`; do not restore obsolete navigation layouts.
- Reuse the root Ant Design `ConfigProvider` and its light/dark algorithms.
  Consume `theme.useToken()` in React and `--ant-*` variables in admin CSS.
  Keep the current seed tokens (`colorPrimary: '#1677ff'`, `borderRadius: 6`,
  `fontSize: 14`) centralized in `App.tsx`; never copy colors into pages or
  create a second page-level theme. Match existing Card, Select, popup, and
  disabled styles. Do not add Tailwind color scales, one-off dark-mode colors,
  arbitrary spacing, or nested cards.
- The Admin Console ships antd styling only; `scripts/verify-admin-console.mjs`
  guards this build boundary on the built CSS.
- Add all user-visible text to `src/admin/i18n.ts` in both Chinese and English.
- Check loading, error, empty, success, disabled, focus, light theme, dark
  theme, desktop, and narrow viewport states.
- After UI changes run `npm run typecheck`, `npm test`, `npm run verify:admin`,
  and `git diff --check`.
- For documentation-only guidance corrections, check the guidance against the
  current source, Markdown links, `git diff --check`, and the PR file scope.
  Report that runtime checks were not run when no runtime files changed.

## Tests and Acceptance

Use the narrowest relevant test first, then the full gate for release changes:

```bash
npm run verify:admin
npm run verify:admin:e2e
npm run check
```

Browser E2E uses Chrome via `playwright-core`; real-service E2E requires the
AEP control service and disposable credentials through environment variables.

## Change and PR Rules

- Make one coherent change per PR and keep PRs stage-oriented (console UI,
  console API client, deployment, or CI).
- Commit messages and PR titles follow Conventional Commits.
- Use `apply_patch` for manual edits. Keep generated files and lockfile changes
  only when the command that owns them requires the update.
- Before opening a PR run `git diff --check`, the relevant tests, and inspect
  `git status` for unrelated changes. Never discard existing user changes.
- `gh` commands must be executed from Git Bash, not PowerShell.

## 跨仓协作规范

提交、PR 标题与说明、review、bug fix 验证遵循 [DEVOPS.md](DEVOPS.md)。本仓已有专项安全与 CI 门继续执行。

## File Size

- New files must not exceed 5000 tokens (estimated as ceil(characters / 4)). If you modify an existing file over that limit, you are responsible for splitting it. Markdown (`*.md`, `*.mdx`) is exempt.
- `.githooks/pre-commit` blocks newly added files over 5000 tokens. It is the only git hook; lint and tests run in CI. Enable it once per clone: `git config core.hooksPath .githooks`.
