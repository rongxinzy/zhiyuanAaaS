# Admin Console CRUD Matrix

This matrix records the lifecycle exposed by the Admin Console and the
corresponding AEP operation. A resource is considered complete when its
supported lifecycle is available in the UI and covered by a component or wire
contract test. Not every resource has a physical `DELETE` operation.

| Resource | Create | Read | Update | Delete or terminal action | Coverage |
| --- | --- | --- | --- | --- | --- |
| Users | Create user; JSON import | Paginated list | Profile, status, password reset, role/team membership replacement | Disable account; the AEP contract intentionally has no user delete | `Resources.test.tsx`; `scripts/verify-admin-crud-browser.mjs` |
| Teams | Create | List | Name, description, enabled | Delete non-built-in team | `Resources.test.tsx`; `scripts/verify-admin-crud-browser.mjs` |
| Roles | Create | List and permission catalog | Name, description, enabled, permissions | Delete non-built-in role | `Resources.test.tsx`; `scripts/verify-admin-crud-browser.mjs` |
| Skills | Create | List with state and versions | Name, description, active/withdrawn state | Delete Skill; upload/publish/withdraw individual versions | `Resources.test.tsx`, `assignment-wire.test.ts`; `scripts/verify-admin-crud-browser.mjs` |
| Skill assignments | Grant to user, role, or team | List | N/A; assignments are immutable | Revoke assignment | `Resources.test.tsx`, `assignment-wire.test.ts`; `scripts/verify-admin-crud-browser.mjs` |
| Models | Create gateway model | List with assignments | Display name, endpoint, upstream model, enabled/default | Delete model; revoke assignment | `Models.test.tsx`; `scripts/verify-admin-crud-browser.mjs` |
| Model assignments | Grant to user, role, or team | List with each model | N/A; assignments are immutable | Revoke assignment | `Models.test.tsx`, `assignment-wire.test.ts`; `scripts/verify-admin-crud-browser.mjs` |
| Credentials | Create | List masked metadata | Metadata, enabled, secret rotation | Delete credential; revoke assignment | `Operations.test.tsx`; `scripts/verify-admin-crud-browser.mjs` |
| Credential assignments | Grant to user, role, or team | List under credential | N/A; assignments are immutable | Revoke assignment | `Operations.test.tsx`; `scripts/verify-admin-crud-browser.mjs` |
| Licenses | Import signed license envelope | List | N/A; signed payload is immutable | Revoke license | `Operations.test.tsx`; `scripts/verify-admin-crud-browser.mjs` |
| Sessions | N/A | Filtered list | N/A | N/A; session revocation is not exposed by the current AEP contract | `Operations.test.tsx` |
| Control events | Publish | Filtered, paginated list and detail | N/A after publication | Cancel active event | `Events.test.tsx`; `scripts/verify-admin-crud-browser.mjs` |
| Audit records and deliveries | N/A | Filtered, paginated records and delivery detail | N/A | N/A; immutable audit trail | `Events.test.tsx` |
| Data plane desired state | N/A | Desired state and observed status | Edit routes and publish revision | Remove a route from the next desired state | `Operations.test.tsx`; `scripts/verify-admin-crud-browser.mjs` |

## Contract notes

The browser-level lifecycle evidence is produced by:

```bash
npm run verify:admin:e2e
```

The verifier runs the built console against a stateful HTTP mock and asserts
both the request path and the resulting resource state. It intentionally does
not claim mutation coverage for sessions or audit records because those are
read-only contracts.

For a running AEP Control Service, the same lifecycle can be exercised through
the real browser and database-backed API:

```bash
ZHIYUAN_AEP_BASE_URL=http://127.0.0.1:8080 npm run verify:admin:real-e2e
```

The real verifier creates uniquely prefixed test resources, exercises the
successful UI paths, verifies the resulting API state, and removes all
deletable resources. User rows remain disabled rather than deleted because
the contract retains them for audit and ownership references. License import
success still requires a deployment configured with the vendor trusted public
key; the mock verifier covers that lifecycle without placing signing material
in the Admin Console repository.

- The Skill editor keeps `enabled` as a UI compatibility field, but the wire
  contract uses `state: active|withdrawn`. The console client strips `enabled`
  from create requests and translates it for patch requests.
- Built-in teams and roles cannot be deleted. This is enforced by disabling
  the destructive action in the UI; the service remains the authority.
- Users are retained for audit and ownership references. Disabling an account
  is the supported account-removal operation.
- License import and event publication are append-oriented operations. Editing
  a signed license or an already published event would invalidate auditability,
  so the UI exposes terminal revoke/cancel actions instead.
