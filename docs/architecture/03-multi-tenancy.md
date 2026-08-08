# Multi-Tenancy

## Isolation model: shared database, shared schema, Row-Level Security

Every tenant-scoped table carries a `tenant_id UUID NOT NULL`. Postgres RLS policies enforce
that a connection can only see/modify rows matching the tenant_id set on its session — enforced
at the database engine, not just in application code, so a bug in one service's query can't
leak cross-tenant data.

```sql
-- Set once per request, right after acquiring a connection from the pool
SELECT set_config('app.current_tenant_id', $1, true); -- true = local to transaction

-- Applied to every tenant-scoped table
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employees
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

The API Gateway resolves the tenant (from subdomain, custom domain, or JWT claim) on every
request and every downstream service call carries `tenant_id` in its internal auth context;
the DB layer (`@hrm/db`) sets `app.current_tenant_id` before running any query, never trusting
a value passed only in application code.

**Why this over the alternatives, at this scale target:**

- **Schema-per-tenant** gives strong isolation but each migration must run against every
  tenant's schema, and Postgres has a practical ceiling well under 10,000 schemas before
  planner/catalog overhead and connection pooling become unmanageable. It fails the platform's
  own stated target before "10,000 organizations" is reached.
- **Database-per-tenant** is worse on the same axis, plus multiplies backup/monitoring/ops
  surface by tenant count.
- **Shared schema + RLS** keeps one physical schema, one set of migrations, one connection
  pool — operational cost stays flat as tenant count grows into the thousands.

**Escape hatch for large/regulated customers:** offer an **Isolated tier** — a dedicated schema
(or, for the largest accounts, a dedicated database on the same or a separate Postgres
instance) behind the same application code, selected by a `tenants.isolation_tier` flag that
the connection-resolution layer checks before routing a query. This is additive, not a
redesign — the RLS-based pooled model stays the default for the other 99% of tenants.

## Tenant resolution

- Each org gets a subdomain: `acme.hrmplatform.com`.
- Enterprise customers can map a custom domain (`hr.acme.com`) via a `custom_domains` table
  resolved at the edge (Workers) before any auth check.
- Tenant resolution happens once, at the Gateway, and is stamped into the JWT/session so every
  downstream service trusts it rather than re-deriving it.

## Organization onboarding

1. Self-serve signup → creates `tenants` row (status: `pending`) + first admin user via Better
   Auth's organization plugin.
2. Async provisioning job (`tenant.created` event) seeds default data: standard leave types,
   a default holiday calendar template, default roles/permissions, default salary structure
   template.
3. Guided setup wizard (org profile, branches, departments, first employees import via
   CSV/XLSX) — tracked as `tenants.onboarding_step` so users can resume.
4. `tenants.status` flips to `active` once onboarding completes; billing/plan starts.

## Organization settings & branding

- `tenant_settings` (key/value + typed JSON) for behavioral config: working week, fiscal year
  start, default currency, leave carry-forward rules, attendance grace period, etc. Read
  through Redis (tenant settings change rarely, read constantly).
- `tenant_branding`: logo (R2 object key), primary/secondary color tokens, custom email
  sender name — injected into the frontend theme at request time and into notification
  templates.

## Shared vs. isolated resources

| Resource | Shared across tenants | Isolated per tenant |
|---|---|---|
| Postgres compute/storage | Yes (pooled tier) | Optional (isolated tier only) |
| Redis | Yes, keys namespaced `tenant:{id}:...` | No |
| R2 buckets | Single bucket, objects namespaced `tenants/{id}/...` | No — object-key namespacing is sufficient isolation for blob storage |
| Background job queues | Yes, every job payload carries tenant_id | No |
| Auth (Better Auth org plugin) | Yes — one Identity service, orgs modeled as Better Auth "organizations" | No |

## Tenant-aware RBAC

Roles and permissions are tenant-scoped: `roles(tenant_id, name, ...)` and
`role_permissions(role_id, permission_key)`, so an org can define custom roles beyond the
system defaults (Admin, HR Manager, Manager, Employee) without affecting other tenants. See
[06-security.md](06-security.md) for the permission model in full. Every permission check
resolves through the requester's `tenant_id` first — there is no global role that spans
tenants except the platform's own internal super-admin, which is a distinct, separately
audited access path.
