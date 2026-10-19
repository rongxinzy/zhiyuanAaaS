# CI gate (agent-speed path)

Pull request CI is a **single workflow** (`CI validation`) tuned for fast merges:

| Required check (branch protection) | Meaning |
| --- | --- |
| `verify` | Aggregates lint, typecheck, unit tests, build, dead-code (knip + vulture), large-file budget, and **path-scoped** Playwright CRUD E2E |
| `ci-gate` | Lightweight pass-through after `verify` succeeds (same workflow; no separate metadata publisher) |

## Per-PR jobs (parallel)

- **lint-typecheck** — Biome + `tsc`
- **test** — `vitest run` (no merge-blocking coverage)
- **build** — `verify:admin` (Vite build + console boundary script)
- **dead-code** — knip (zero findings) + vulture on `.github` Python
- **large-files** — `scripts/check-large-files.mjs` (2 MiB cap; `docs/screenshots/**` allowlisted)
- **browser-e2e** — only when `src/admin/**` or browser harness scripts change (paths-filter)

## Off the PR path (scheduled)

- **CodeQL** — nightly (` .github/workflows/codeql.yml`)
- **Dependency audit** — nightly high-severity `npm audit`

## Retired

- Separate **DevOps gate** workflow (`pull_request_target` / `workflow_run`) and **gate-tests** inventory
- **coverage-ratchet**, PR template/title validation, and per-PR CodeQL
- Optional **AEP real-service E2E** on every PR (re-enable via a dedicated workflow/variable when needed)

Concurrency cancels in-flight runs for the same PR head to save runner minutes.
