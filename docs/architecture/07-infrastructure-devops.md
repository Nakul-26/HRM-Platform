# Infrastructure & DevOps

## Serverless vs. dedicated, per component

| Component | Placement | Why |
|---|---|---|
| API Gateway | Cloudflare Workers | Stateless request routing at the edge; scales to zero and to spikes instantly; nearest-region latency for a global tenant base |
| Authentication | Workers + Hyperdrive | Request/response is short-lived; Hyperdrive gives pooled Postgres access without Workers holding long-lived connections themselves |
| Employee/Leave/Recruitment/Performance/Shift services | Workers + Hyperdrive | All CRUD-shaped, sub-second, no long-running computation — the common case Workers are built for |
| Attendance ingestion (biometric webhooks, clock-in/out) | Workers → Cloudflare Queue | Ingestion must absorb bursts (everyone clocking in at once) without blocking; Workers accept the request and enqueue, decoupling ingestion rate from processing rate |
| Attendance aggregation/reporting | Dedicated worker (container) | Daily/monthly aggregation across large row counts benefits from a longer-lived process and connection, not a fresh cold-start per batch |
| **Payroll processing** | Dedicated container (Node), queue-triggered | A tenant's monthly run processes every employee's tax/PF/ESI calculation in one logically atomic batch; this can run minutes, which exceeds Workers' CPU-time budget, and correctness/idempotency matter more than edge latency here |
| Notification dispatch | Workers, Queue consumer | Pure fan-out I/O (call an email/SMS provider API) — no benefit from a long-lived process |
| Document/File | Workers + R2 | Presigned URL issuance is a trivial, stateless operation |
| Reporting/Analytics exports | Dedicated worker, read replica | PDF/XLSX generation for large exports is CPU/memory-heavy and shouldn't compete with transactional traffic for primary DB connections |
| Audit log ingestion | Workers, Queue consumer | High-volume append-only writes, no business logic beyond validation |
| Scheduled jobs (leave accrual, holiday calendar rollover, payroll trigger, session cleanup) | Cloudflare Cron Triggers → Queue → appropriate worker | Cron Triggers are the scheduling primitive; heavy jobs immediately hand off to the dedicated worker rather than running inline on a cron-triggered Worker |

**Rule of thumb applied throughout:** if a task must finish in the time a user is willing to
wait for a page to load, it's a Worker. If it's a batch job with a duration measured in minutes,
touches money, or needs a long-lived DB connection for consistency, it's dedicated compute.

## Environments

`local` → `preview` (per-PR, ephemeral) → `staging` → `production`. Preview environments are
full stack (Workers + a scoped-down Postgres branch via Neon/Supabase branching, or a
seeded schema) so a PR can be reviewed against real behavior, not just a diff.

## CI/CD pipeline

1. **PR opened** → lint (ESLint/Biome) + typecheck (`tsc --noEmit` across the monorepo via
   Turborepo's cached task graph, so only affected packages re-check) + unit tests + build.
2. **Preview deploy** — Workers services deploy to a per-PR preview URL; frontend deploys to a
   Vercel/Cloudflare Pages preview; migrations run against a scoped preview DB branch.
3. **Merge to `main`** → deploy to `staging` automatically; integration + E2E suite (Playwright)
   runs against staging.
4. **Promote to `production`** — manual approval gate, then deploy. Database migrations are a
   **separate, preceding step** from code deploy (never bundled in the same deploy action),
   and are always additive/backward-compatible (see rollback strategy below) so the previous
   code version keeps working during the rollout window.

## Docker & environment management

- Workers services don't need containers (Wrangler handles their build/deploy directly).
- Dedicated services (Payroll, Reporting workers) are containerized (multi-stage Dockerfile,
  distroless runtime image) for portability across the container host and to keep local dev
  parity with production.
- `docker-compose.yml` for local dev: Postgres, Redis, and a local S3-compatible R2 stand-in
  (MinIO), so a new developer runs one command and has the full data layer without touching
  cloud accounts.

## Secrets & config

- Typed env loading/validation via `@hrm/config` (Zod schema per service) — a missing or
  malformed env var fails at boot, not at first use in production.
- Environment values themselves live in Cloudflare's secret bindings / the container
  platform's secret store, never in the repo (see [06-security.md](06-security.md)).

## Logging, monitoring, health checks

- Structured JSON logs (`@hrm/logger`, wraps pino), every log line carries `requestId`,
  `tenant_id`, `service` — shippable to any log sink (Logpush from Cloudflare, or a hosted
  option like Axiom/Datadog) without reformatting.
- Every service exposes `/health` (process is up) and `/ready` (DB/Redis reachable) —
  `/ready` is what's wired into deploy gates and the container platform's restart policy.
- Metrics: request rate/latency/error-rate per service and per tenant (the per-tenant cut
  matters — it's how a noisy or struggling tenant is caught before it becomes a platform-wide
  incident). Traces propagate `requestId` across the Gateway → service → queue-consumer chain.
- Alerting on: error-rate thresholds, payroll run failures (paged, not just logged — money is
  involved), queue depth/age (backlog growing means a consumer is stuck), Postgres connection
  pool saturation.

## Automated testing

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure logic — payroll tax calc, leave-balance math, permission evaluation |
| Integration | Vitest + real Postgres (via `docker-compose`/testcontainers) | Service DB layer, RLS policies actually enforced in tests, not mocked away |
| Contract | OpenAPI-schema validation in CI | Every service's responses match its published spec — catches drift before the frontend does |
| E2E | Playwright | Golden paths: onboarding → add employee → apply leave → approve → run payroll → download payslip |
| Load | k6, targeted at Attendance ingestion and Payroll runs specifically | These two are the components explicitly designed around load profile — verify the design assumption, don't just assume it |

RLS policies are tested with integration tests that assert cross-tenant reads return zero
rows, not just that same-tenant reads work — the isolation guarantee is the thing most worth
a regression test.

## Deployment strategy & rollbacks

- Workers: atomic deploy with instant rollback to the previous Worker version (Cloudflare
  keeps prior versions addressable) — no blue/green orchestration needed, the platform gives
  it for free.
- Dedicated containers: rolling deploy with health-check gating; previous image tag stays
  available for immediate redeploy on failure.
- Database migrations are always backward-compatible for at least one release
  (additive columns, new tables, no drops/renames in the same release that removes the old
  code path) — this is what makes "rollback the code" safe without also having to reverse a
  migration under production load.
