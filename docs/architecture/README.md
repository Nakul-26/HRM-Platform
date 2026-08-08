# HRMS/ERP Platform — Architecture Documentation

This is the master architecture reference for the platform. It is written to be actively
developed and maintained for years, not a one-time planning artifact — update it as decisions
change.

## Reading order

| # | Doc | Covers |
|---|-----|--------|
| 1 | [01-services-and-communication.md](01-services-and-communication.md) | Service boundaries, why each exists, sync/async communication, event catalog |
| 2 | [02-tech-stack-rationale.md](02-tech-stack-rationale.md) | Every stack choice, why, trade-offs, alternatives considered |
| 3 | [03-multi-tenancy.md](03-multi-tenancy.md) | Tenant isolation, onboarding, tenant-aware auth/RBAC, branding |
| 4 | [04-database-design.md](04-database-design.md) | Schemas, DDL, relationships, indexing strategy |
| 5 | [05-api-design.md](05-api-design.md) | REST conventions, versioning, errors, pagination, OpenAPI |
| 6 | [06-security.md](06-security.md) | RBAC, audit logs, API security, encryption, secrets |
| 7 | [07-infrastructure-devops.md](07-infrastructure-devops.md) | Serverless vs. dedicated per component, CI/CD, environments |
| 8 | [08-scalability.md](08-scalability.md) | Growth path from 10 → 10,000 orgs |
| 9 | [09-folder-structure.md](09-folder-structure.md) | Turborepo monorepo layout |
| 10 | [10-roadmap.md](10-roadmap.md) | MVP → enterprise phased delivery plan |

## Founding architectural decisions

These are load-bearing decisions everything else follows from. Revisit them only with strong
evidence, not preference.

1. **"Modular services on a shared Postgres cluster," not "microservices with a database
   each."** Payroll must reconcile against final Attendance and Leave state inside the same
   pay cycle. Enforcing that consistency across independent databases requires sagas/outbox
   patterns everywhere for zero real benefit at MVP scale. Instead: independently deployable
   services, each owning a Postgres **schema** (not a separate database), talking to each other
   through REST + events. Payroll, Attendance ingestion, Notifications, and Reporting are the
   first candidates to graduate to physically separate databases once their load profiles
   diverge from the rest (see [08-scalability.md](08-scalability.md)).

2. **Shared database, shared schema, tenant_id + Postgres Row-Level Security** for
   multi-tenancy, not schema-per-tenant or database-per-tenant. At thousands of tenants,
   per-tenant schemas/databases blow up migration time, connection pool count, and backup
   orchestration. RLS keeps one physical schema doing the isolation work at the DB engine
   level. An "isolated tier" (dedicated schema or DB) is offered later as a paid option for
   large/regulated customers — see [03-multi-tenancy.md](03-multi-tenancy.md).

3. **Serverless is the default; dedicated compute is the exception, justified per-service.**
   Cloudflare Workers/Hono handle anything short-lived and stateless (API gateway, CRUD
   services, webhooks, notification dispatch). Long-running, CPU-heavy, or strict-consistency
   batch work (payroll runs, report generation, biometric device batch sync) runs on dedicated
   containers/workers that aren't fighting a 30-50ms CPU budget. Every service's placement is
   justified explicitly in [07-infrastructure-devops.md](07-infrastructure-devops.md).

4. **Event-driven where coupling would otherwise leak across domains; synchronous REST for
   everything a user is waiting on.** An employee's leave approval synchronously updates the
   leave record, then asynchronously fans out to notification, attendance-mapping, and
   payroll's leave-balance cache via a queue. See the event catalog in
   [01-services-and-communication.md](01-services-and-communication.md).

5. **Start monolith-shaped, split by proven pain, not by anticipated pain.** Every "service"
   in this doc set is a separately deployable module from day one (own folder, own API surface,
   own schema) so splitting it out later is a deployment change, not a rewrite.
