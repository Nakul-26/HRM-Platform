# Monorepo Folder Structure

Turborepo, npm/pnpm workspaces. Every `apps/*` is independently deployable; every `packages/*`
is internal-only (never published), consumed via workspace protocol.

```
hrm-platform/
├── apps/
│   ├── web/                        # Next.js — admin console + employee self-service portal
│   │   ├── app/
│   │   │   ├── (auth)/             # sign-in, sign-up, org onboarding
│   │   │   ├── (admin)/            # HR-admin console, one folder per module
│   │   │   │   ├── employees/
│   │   │   │   ├── attendance/
│   │   │   │   ├── leave/
│   │   │   │   ├── payroll/
│   │   │   │   ├── recruitment/
│   │   │   │   ├── performance/
│   │   │   │   └── shifts/
│   │   │   └── (self-service)/     # employee-facing views, same data, permission-scoped
│   │   └── middleware.ts           # tenant resolution, auth guard
│   │
│   ├── gateway/                    # Hono on Workers — API Gateway/BFF
│   ├── identity-service/           # Better Auth + RBAC
│   ├── tenant-service/
│   ├── employee-service/
│   ├── attendance-service/
│   ├── leave-service/
│   ├── shift-service/
│   ├── recruitment-service/
│   ├── performance-service/
│   ├── notification-service/
│   ├── document-service/
│   │
│   ├── payroll-worker/             # dedicated container, not Workers — see 07-infrastructure-devops.md
│   └── reporting-worker/           # dedicated container
│
├── packages/
│   ├── types/                      # @hrm/types — Zod schemas + inferred types, shared FE/BE
│   ├── db/                         # @hrm/db — Drizzle schema per domain + migrations
│   │   └── src/schema/
│   │       ├── core.ts             # employees, departments, branches, designations
│   │       ├── attendance.ts
│   │       ├── leave.ts
│   │       ├── payroll.ts
│   │       ├── recruitment.ts
│   │       ├── performance.ts
│   │       └── platform.ts         # tenants, roles, permissions, audit_logs
│   ├── auth/                       # @hrm/auth — Better Auth config, RBAC helpers
│   ├── events/                     # @hrm/events — event envelope types, publish/subscribe
│   ├── ui/                         # @hrm/ui — shadcn/ui-based component library
│   ├── config/                     # @hrm/config — typed env loading (Zod)
│   ├── logger/                     # @hrm/logger — structured logging wrapper
│   ├── api-client/                 # @hrm/api-client — typed fetch client from OpenAPI
│   └── eslint-config/ , tsconfig/  # shared lint/TS base configs
│
├── infra/
│   ├── docker-compose.yml          # local Postgres, Redis, MinIO (R2 stand-in)
│   ├── terraform/ (or pulumi/)     # cloud resources as code
│   └── wrangler/                   # per-Worker wrangler.jsonc configs
│
├── docs/
│   └── architecture/               # this doc set
│
├── turbo.json
├── package.json
└── tsconfig.base.json
```

## Why this shape

- **Every domain service is its own `apps/*` entry** even though several share the same
  Postgres cluster — this is what makes "split Payroll into its own database later" a config
  change (point its Drizzle client at a different connection string) rather than an
  extraction project.
- **`packages/db` centralizes schema, not per-service schema files**, deliberately — with a
  shared database, a single source of truth for table definitions prevents two services from
  drifting on what a shared table (e.g. `employees`) looks like. Each service imports only the
  schema slices it needs.
- **`packages/types` is the contract boundary** between frontend and every backend service —
  a payroll response shape change is a type error in the frontend at build time, not a
  runtime surprise.
- Turborepo's task graph (`turbo.json`) scopes `build`/`typecheck`/`test` to only the packages
  affected by a given change, keeping CI fast as the number of `apps/*` grows.
