# Services & Communication

## Service inventory

Each row is an independently deployable module: own route namespace, own Drizzle schema
namespace, own test suite, own on-call boundary. "Placement" is justified in depth in
[07-infrastructure-devops.md](07-infrastructure-devops.md) — summarized here.

| Service | Owns | Why independent | Placement |
|---|---|---|---|
| **API Gateway / BFF** | Routing, tenant resolution, session verification, rate limiting, request aggregation for the frontend | Single ingress simplifies auth, CORS, rate-limiting, and versioning; frontend never talks to internal services directly | Cloudflare Workers (edge) |
| **Identity & Access** | Auth (Better Auth), sessions, MFA, RBAC role/permission definitions, API keys | Highest security sensitivity; changes to auth must be reviewable/testable in isolation from business logic | Workers + Hyperdrive (Postgres) |
| **Tenant / Organization** | Org record, org settings, branding, subscription/plan, onboarding state | Tenant lifecycle (provisioning, suspension, billing) is operationally distinct from any HR domain logic | Workers + Hyperdrive |
| **Employee (Core HR)** | Employee profiles, org structure, departments, designations, branches, employment types, employee documents metadata, lifecycle events | The "master data" every other domain reads; changes here (e.g. GDPR erasure) have platform-wide implications | Workers + Hyperdrive |
| **Attendance** | Daily attendance, manual corrections, biometric device ingestion, overtime, work hours, late tracking | Extreme write bursts (everyone clocking in ~9am); ingestion path must never block on the rest of the platform | Ingestion: Workers + Queue buffer. Aggregation/reporting: dedicated worker |
| **Leave** | Leave policies/types, requests, approval workflow, holiday calendar, balances, comp-off | Stateful approval workflow (state machine) with SLA-sensitive notifications | Workers + Hyperdrive |
| **Shift Scheduling** | Shift templates, rotations, night shifts, flexible shifts, attendance mapping | Rotation generation is a distinct scheduling algorithm, reused by Attendance but not owned by it | Workers + Hyperdrive |
| **Payroll** | Salary structures, earnings/deductions, tax, PF/ESI, payroll runs, payslips | Batch runs process thousands of employees with strict correctness/idempotency requirements and can run minutes, not milliseconds — the opposite of everything above | Dedicated container/worker, queue-triggered, own DB once tenant volume demands it |
| **Recruitment** | Job openings, candidates, resumes, interviews, offers, pipeline | Fully separate lifecycle from an "employee" (candidate isn't a tenant employee yet); heavy unstructured data (resumes) | Workers + Hyperdrive + R2 |
| **Performance** | Goals, KPIs, review cycles, ratings, promotions | Long review cycles, mostly read-heavy outside cycle windows | Workers + Hyperdrive |
| **Notification** | Email/SMS/push dispatch, templates, delivery status | Every other service produces notification events; centralizing dispatch avoids N copies of retry/template logic | Queue consumer, Workers |
| **Document/File** | Presigned upload/download URLs to R2, virus-scan hook, retention policy | File handling security (validation, scanning, expiring URLs) is a cross-cutting concern best owned once | Workers + R2 |
| **Reporting/Analytics** | Cross-domain reports, exports (PDF/XLSX), dashboards | Long-running aggregation queries and export generation don't belong on the request-serving path; often needs a read replica | Dedicated worker, read replica |
| **Audit Log** | Append-only record of sensitive actions across all services | Must be tamper-evident and centrally queryable for compliance; every service is a producer, none should own the store | Queue consumer → append-only table, Workers |

Employee Self-Service is **not** a separate service — it's a permission-scoped view composed by
the BFF over Employee/Attendance/Leave/Payroll/Performance/Notification, using the same RBAC
that gates HR-admin access. Building it as its own backend would just duplicate every read
endpoint above with a narrower filter.

## Communication

**Synchronous (REST, via the API Gateway):** anything a human is waiting on — viewing a
profile, submitting a leave request, approving it, downloading a payslip. Services call each
other synchronously only for read-your-own-data lookups needed to validate a request in-flight
(e.g. Leave calling Employee to confirm the requester's manager for approval routing). Avoid
sync call chains deeper than 2 hops — if Payroll needs Attendance and Leave and Employee data,
it reads from materialized, event-updated local tables instead of calling three services
per employee per pay run.

**Asynchronous (event bus, Cloudflare Queues → later Kafka/Redpanda if volume demands):**
anything that fans out to multiple consumers or doesn't need to complete before the triggering
request returns.

## Event catalog (v1)

| Event | Producer | Consumers | Purpose |
|---|---|---|---|
| `employee.created` | Employee | Payroll, Leave, Attendance, Notification, Audit | Provision salary structure draft, initialize leave balances, welcome email |
| `employee.terminated` | Employee | Payroll, Leave, Attendance, Identity, Audit | Final settlement trigger, revoke access, freeze attendance |
| `leave.approved` / `leave.rejected` | Leave | Attendance, Payroll, Notification, Audit | Update attendance mapping, adjust payroll leave-balance cache, notify employee |
| `attendance.corrected` | Attendance | Payroll, Audit | Downstream payroll recompute flag |
| `payroll.run.completed` | Payroll | Notification, Audit, Document | Trigger payslip generation + delivery |
| `candidate.hired` | Recruitment | Employee, Notification | Convert candidate → employee record |
| `document.uploaded` | Document | Audit, (virus-scan worker) | Compliance trail, async scanning |
| `review_cycle.closed` | Performance | Payroll, Notification | Feed into promotion/increment workflows |
| `*.* ` (all of the above) | every service | Audit | Single audit trail, append-only |

Each event is a small, versioned JSON envelope: `{ event, version, tenant_id, occurred_at,
actor_id, payload }`. Producers write to an **outbox table** in the same transaction as their
state change (transactional outbox pattern) and a poller/CDC publishes to the queue — this
avoids the classic "DB write succeeded, event publish failed" split-brain bug without needing
distributed transactions.

## Shared libraries (not services)

Cross-cutting code lives in `packages/`, not as network services — see
[09-folder-structure.md](09-folder-structure.md):

- `@hrm/types` — Zod schemas + inferred TS types, shared frontend/backend
- `@hrm/db` — Drizzle schema definitions, one namespace per domain, migrations
- `@hrm/auth` — Better Auth config, RBAC/permission evaluation helpers
- `@hrm/ui` — shadcn/ui-based component library
- `@hrm/config` — typed env var loading/validation
- `@hrm/events` — event envelope types + publish/subscribe helpers
- `@hrm/api-client` — typed fetch client generated from OpenAPI
