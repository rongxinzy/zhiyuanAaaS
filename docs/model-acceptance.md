# Enterprise Model Acceptance

The enterprise model path is released in three separate checks. The first two are
deterministic and suitable for CI. The last one is an Electron release-candidate check
because it requires the public Zhiyuan desktop runtime.

## Deterministic gate

From this repository, run:

```bash
npm ci
npm run verify:model-acceptance
```

The command verifies the AaaS build and tests, checks that the Zhiyuan core, AEP
protocol, and SDK inputs are immutable, then runs the protocol repository's
OpenAI-compatible gateway scenario. Set `AEP_PROTOCOL_ROOT` when the protocol
repository is not the sibling directory `../Agent-Enterprise-Protocol`.

The gateway scenario covers:

- enterprise model assignment and model-token authorization;
- Higress routing and server-only provider credential injection;
- non-streaming and SSE responses, including `reasoning_content`;
- DeepSeek-compatible reasoning replay for tool turns;
- model-token expiry, unauthorized model rejection, and safe telemetry.

The enterprise extension release-candidate contract can be checked independently after a build:

```bash
npm run build
npm run verify:electron-rc
```

This verifies the host registration lifecycle, enterprise session projection, exclusive managed
model projection, OpenAI-compatible fail-closed behavior, and redaction of provider credentials
and passwords. Set `ZHIYUAN_ELECTRON_PACKAGE_DIR` to also compare a packaged Electron directory;
CI sets `ZHIYUAN_REQUIRE_ELECTRON_PACKAGE=1` so a missing package fails the gate. The script never
requires a real provider API key.

The Windows packaging workflow writes `SHA256SUMS.txt` and runs
`npm run verify:release-artifacts` before uploading the installer. The verifier rejects
missing, extra, duplicate, malformed, or mismatched checksum entries.

## Electron release-candidate check

1. Start the AEP gateway Compose stack and verify `http://127.0.0.1:8080/healthz`.
2. Build this repository with `npm run build`.
3. Build the public Zhiyuan repository with `npm run build` and compile the Electron
   main process with `bunx tsc --project electron-tsconfig.json`.
4. Load the extension bundle and renderer from this repository using the documented
   `ZHIYUAN_ENTERPRISE_EXTENSION_DEV_PATH` and
   `ZHIYUAN_ENTERPRISE_RENDERER_DIRECTORY` variables.
5. In Electron, sign in with an AEP account that has an assigned enterprise model.
6. Select the managed model and send one normal request, one streaming request, and
   one reasoning/tool continuation. Confirm the assistant response, cancellation,
   and that no provider credential appears in the renderer or logs.

The Electron check must use a disposable account and test data. Provider keys are
environment or secret-manager inputs only; they must never be committed to either
repository.
