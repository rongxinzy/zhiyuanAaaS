# Zhiyuan Admin Console

This repository builds the closed-source Zhiyuan Admin Console, a standalone browser application
for enterprise operators, plus its deployment manifests (`deploy/`). The console talks to the AEP
control service over HTTP; it has no Electron or Node runtime surface.

The enterprise client extension, enterprise renderer, license, agent-control, and Windows
packaging/signing moved to [rongxinzy/RongxinAI](https://github.com/rongxinzy/RongxinAI) (the
`enterprise/` directory; installers are built by its `Build Zhiyuan Enterprise Windows package`
workflow).

## Development

Node.js 24 is required.

```bash
npm ci
npm run check
```

The Admin Console is a standalone browser entrypoint for enterprise operators.

Admin UI changes follow [DESIGN.md](DESIGN.md) and the Admin Console section of
[AGENTS.md](AGENTS.md): use Ant Design components and the existing root `ConfigProvider` tokens.

Start the AEP control service first, then run the console in a second terminal:

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

## Verification

```bash
npm run typecheck
npm test
npm run test:coverage
npm run verify:admin
npm run verify:admin:e2e
```

`npm run verify:admin:real-e2e` exercises the console against a live AEP control service and needs
disposable administrator credentials through `ZHIYUAN_AEP_ADMIN_PASSWORD` (see
[AGENTS.md](AGENTS.md) for the local stack).

## License

The npm package is marked private and `UNLICENSED`. The root legal notice is interim and must be
reviewed before any external distribution.
