# Tech Stack Rationale

For every choice: why it fits, the trade-off accepted, and the alternative considered.

## Frontend

| Choice | Why | Trade-off accepted | Alternative considered |
|---|---|---|---|
| **Next.js (App Router)** | Server components cut client JS for data-heavy HR screens (tables, dashboards); file-based routing scales cleanly across dozens of module screens; built-in edge-friendly middleware for tenant resolution | App Router's caching model has a learning curve and RSC/client boundary requires discipline | Remix (comparable, smaller ecosystem); plain Vite SPA (loses SSR/SEO for marketing/onboarding pages, no real benefit here) |
| **TypeScript** | Non-negotiable at this domain complexity — payroll/tax logic without types is a liability | Slightly slower initial dev velocity | None seriously considered |
| **Tailwind CSS + shadcn/ui** | shadcn gives owned, composable component source (not a black-box dependency) — critical since white-labeling/branding is a requirement | Larger upfront component inventory to assemble vs. a batteries-included UI kit | MUI (harder to theme per-tenant deeply), Ant Design (heavier, less composable) |
| **TanStack Query** | Server-state caching/invalidation is most of an HR app's frontend complexity (lists, filters, optimistic approval actions) | Another mental model alongside RSC data fetching — needs a clear rule: RSC for initial load, TanStack Query for interactive/mutating views | Plain SWR (less feature-complete for mutations/optimistic updates) |
| **React Hook Form + Zod** | Every module has non-trivial forms (salary structures, leave policies); Zod schemas are shared with the backend via `@hrm/types`, so validation logic is written once | None significant | Formik (worse TS inference, less maintained) |

## Backend

| Choice | Why | Trade-off accepted | Alternative considered |
|---|---|---|---|
| **Node.js + TypeScript** | One language across stack; shared types end-to-end; largest hiring pool | Not the fastest runtime for CPU-bound work (payroll tax calc) — mitigated by running that on dedicated compute, not Workers | Go/Rust for backend (faster, but forks the type system from frontend and slows a small team down) |
| **Hono** | Runs identically on Cloudflare Workers, Node, Bun, or containers — same framework whether a service is edge-serverless or a dedicated payroll worker, so moving a service between the two is a deployment change, not a rewrite | Smaller ecosystem/middleware catalog than Express | Express (Node-only, awkward on Workers), Fastify (Node-only) |
| **Drizzle ORM** | SQL-first, fully-typed, no hidden query behavior — matters when payroll correctness depends on knowing exactly what SQL runs; lightweight enough for Workers' size/CPU limits | Less "batteries included" than Prisma (no built-in migration UI) | Prisma (heavier runtime, historically slower cold start on Workers) |

## Database & storage

| Choice | Why | Trade-off accepted | Alternative considered |
|---|---|---|---|
| **PostgreSQL** | Row-Level Security is the backbone of the multi-tenancy model ([03-multi-tenancy.md](03-multi-tenancy.md)); mature JSON support for flexible per-tenant custom fields; strong consistency for payroll | Vertical scaling ceiling eventually requires read replicas/sharding — planned for in [08-scalability.md](08-scalability.md) | MySQL (weaker RLS story), MongoDB (wrong fit — HRMS data is fundamentally relational: employees↔departments↔payroll↔leave) |
| **Redis** | Session cache, rate-limit counters, leave-balance read cache, job queue backing for anything not on Cloudflare Queues | Another moving part to operate | Memcached (no pub/sub, no data structures needed for rate limiting) |
| **Cloudflare R2** | S3-compatible, zero egress fees — matters because payslips/resumes/documents are downloaded constantly and egress-billed storage (S3) would be a real recurring cost at scale | Slightly less mature ecosystem/tooling than S3 | S3 (proven, but egress cost compounds with thousands of tenants downloading payslips monthly) |

## Authentication

| Choice | Why | Trade-off accepted | Alternative considered |
|---|---|---|---|
| **Better Auth** | Native organization/multi-tenancy plugin, framework-agnostic (works with Hono), owns the session/JWT/MFA primitives instead of hand-rolling them | Younger project than Auth0/Clerk — mitigated by it being self-hosted (no vendor lock-in, full data control, no per-MAU pricing) | Clerk/Auth0 (fast to start, but per-user pricing becomes expensive at "hundreds of thousands of employees" and data residency is a bigger lift with a third party) |
| **JWT + refresh tokens** | Stateless verification at the edge (Gateway checks JWT without a DB round-trip); refresh tokens rotated and stored server-side for revocability | Must handle revocation-before-expiry (short-lived access tokens + a revocation check on refresh) | Pure session cookies only (simpler, but doesn't fit service-to-service calls cleanly) |

## Infrastructure

Serverless-by-default, dedicated-by-exception — full per-service breakdown in
[07-infrastructure-devops.md](07-infrastructure-devops.md). Cloudflare Workers were chosen as
the default runtime because Hono, R2, Queues, and Hyperdrive (Postgres connection pooling at
the edge) are all first-party and integrate without glue code; a Node/container platform
(Fly.io, Railway, or bare VMs) is layered in only for Payroll batch runs and Reporting exports
where Workers' CPU-time limits are the wrong constraint.
