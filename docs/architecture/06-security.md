# Security

## RBAC & permission system

Two-level model: **roles** group **permissions**; permissions are fine-grained action strings
(`employee.read`, `employee.write`, `leave.approve`, `payroll.run`, `payroll.view_others`).
System default roles (Admin, HR Manager, Manager, Employee) ship pre-wired; tenants can define
custom roles composed from the same permission set (see `roles`/`role_permissions` in
[04-database-design.md](04-database-design.md)).

Two additional scoping dimensions beyond the role's permission set:

- **Ownership scope**: most permissions are implicitly scoped to "self" or "direct reports"
  unless an explicit `*_all` variant is granted (`leave.approve` on your reports vs.
  `leave.approve_all`). This is enforced in a shared `@hrm/auth` helper, not duplicated per
  service, so the ownership check is written once and can't drift between modules.
- **Tenant scope**: every permission check is implicitly `AND tenant_id = current_tenant`,
  enforced twice — once in application middleware (fast rejection) and once by Postgres RLS
  (defense in depth if the middleware check is ever missed).

## Audit logs

Every mutating action across every service publishes to the `audit_logs` append-only,
partitioned table (schema in [04-database-design.md](04-database-design.md)) via the event bus
— producers never write audit rows directly to avoid coupling every service to that table's
shape. Table grants: services have `INSERT` only; `UPDATE`/`DELETE` are revoked at the DB role
level so a compromised service credential can't tamper with history.

## API security

- **AuthN**: Better Auth session cookie for browser clients; short-lived JWT (15 min) + refresh
  token (rotated, stored server-side, revocable) for the mobile/API/service-to-service path.
- **AuthZ**: every request resolved to `{ tenant_id, employee_id, role, permissions }` once at
  the Gateway, signed and forwarded internally so downstream services trust it without
  re-querying Identity on every call.
- **Rate limiting**: token-bucket in Redis, keyed by `tenant_id + IP` for anonymous endpoints
  and `tenant_id + user_id` for authenticated ones — per-tenant keying stops one noisy tenant
  from exhausting the limit for everyone else on a shared limiter.
- **Input validation**: every request body validated against the shared Zod schema
  (`@hrm/types`) before it reaches business logic — the same schema Drizzle's insert/update
  types are derived from, so a validated payload is guaranteed shaped correctly for the query
  layer.
- **SQL injection**: eliminated structurally — Drizzle's query builder parameterizes all
  values; the only risk surface is raw SQL escape hatches, which are code-reviewed as a
  required checklist item and never accept unsanitized user input.
- **XSS**: React escapes by default; the only real risk is `dangerouslySetInnerHTML` for
  rich-text fields (offer letters, email templates) — those pass through a sanitizer
  (allow-listed tags) before storage, not just before render, so no consumer of that data can
  forget the step.
- **CSRF**: SameSite=Lax cookies for the session, plus a double-submit CSRF token for
  state-changing form posts from the browser session flow specifically (the JWT-bearer API
  path is not cookie-based and isn't CSRF-exposed).

## Encryption

- **In transit**: TLS everywhere (Cloudflare terminates at the edge; internal Workers↔Hyperdrive↔Postgres traffic stays within Cloudflare's network, encrypted).
- **At rest**: Postgres volume encryption (provider-managed) plus **application-level
  encryption** for a short list of especially sensitive columns — bank account numbers, tax
  IDs (PAN/SSN-equivalent) — using AES-256-GCM with per-tenant data keys, so a raw DB dump or
  backup alone doesn't expose that data. Data keys are themselves encrypted by a root key held
  in the secrets manager, not in the database.
- **R2 objects**: encrypted at rest by the provider; presigned URLs are short-lived
  (5–15 min) and scoped to a single object key, never a bucket-wide credential.

## Secure file uploads

- Client requests a presigned R2 upload URL from the Document service, which validates
  content-type/size limits and the caller's permission to upload for that resource *before*
  issuing the URL — the client never gets a broad-write credential.
- Uploaded files are scanned asynchronously (`document.uploaded` event → scanning worker)
  before being marked `available`; until then the file is visible only to its uploader, not
  shared/downloadable by others.
- File type allow-listing by extension **and** magic-byte sniffing (extension alone is
  spoofable) for anything accepted as a document/resume/certificate.

## Secrets management

- No secrets in code or `.env` files committed to the repo. Per-environment secrets live in
  Cloudflare's secrets store (Workers) / the container platform's secrets manager (Payroll
  worker), injected at deploy time.
- Rotation: database credentials and the JWT signing key are rotated on a schedule (90 days)
  and immediately on suspected compromise; JWT rotation uses a key-ID (`kid`) header so old
  tokens remain verifiable during the rotation window instead of invalidating every active
  session at once.

## Password & session policy

- Delegated to Better Auth: minimum length + breached-password check (via
  k-anonymity HaveIBeenPwned API, not a plaintext check), configurable per-tenant complexity
  rules for enterprise customers who require it.
- MFA-ready: TOTP support wired at the Identity service level from day one (module described
  as "MFA-ready" in the stack requirements means the schema/flow exists even if not enforced
  by default — enforcement is a tenant setting, on by default for Admin/HR Manager roles once
  shipped).
- Sessions are revocable server-side (refresh-token table), with an explicit "log out all
  devices" action, and are invalidated immediately on role/permission change or termination
  (`employee.terminated` event → Identity revokes all sessions).
