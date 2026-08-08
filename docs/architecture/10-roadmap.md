# Development Roadmap

Six phases, each shippable and demoable on its own. Phases 0-2 are the MVP; 3-5 add enterprise
capability. Complexity ratings are relative to this project, not absolute.

## Phase 0 — Platform foundation

**Objective:** everything every later module depends on exists and is provably correct before
any HR feature is built on top of it.

- Deliverables: monorepo scaffold ([09-folder-structure.md](09-folder-structure.md)); `tenants`,
  `users`, `roles`, `permissions` schema; Better Auth wired with org plugin; RLS policies on a
  seed table with a passing cross-tenant-isolation test; API Gateway skeleton with tenant
  resolution + JWT verification; CI pipeline (lint/typecheck/test/build); local
  `docker-compose` dev environment.
- Dependencies: none.
- Complexity: **High** — this phase is disproportionately hard relative to how little user-
  visible functionality it produces, because every mistake here (tenant isolation, auth) is
  expensive to fix later. Do not compress this phase to hit a demo date.
- Testing requirements: RLS isolation integration tests are mandatory and blocking, not
  optional — this is the one thing that must never regress silently.
- Definition of done: a second tenant can sign up, and an automated test proves tenant A's API
  calls return zero rows of tenant B's data under every seeded table.

## Phase 1 — Core HR + Employee Self-Service (MVP core)

**Objective:** an org can fully onboard its employee roster and employees can see their own
data.

- Deliverables: Employee service (CRUD, org structure, departments/designations/branches,
  document upload via Document service); onboarding wizard + CSV import; self-service portal
  (profile view/edit, document upload, org directory).
- Dependencies: Phase 0.
- Complexity: Medium.
- Testing: unit tests on validation rules; E2E for onboarding → add employee → employee logs
  in and sees own profile.
- Definition of done: a real org can be onboarded end-to-end with no manual DB intervention.

## Phase 2 — Attendance + Leave (MVP complete)

**Objective:** the two highest-frequency daily-use modules are live — this is the version
worth pitching to a first paying customer.

- Deliverables: shift templates + assignment; manual + web clock-in/out; attendance
  corrections + approval; leave types/policies/holiday calendar; leave request + approval
  workflow; leave balance accrual job; self-service leave apply/view, attendance view.
- Dependencies: Phase 1 (employees, org structure).
- Complexity: Medium-High (approval workflow state machine, accrual scheduling correctness).
- Testing: integration tests on the leave state machine (every legal transition, every
  illegal transition rejected); load test on attendance ingestion at expected clock-in burst
  volume for target org sizes.
- Definition of done: an employee can apply for leave, a manager can approve it, and it's
  correctly reflected in attendance + balance without manual reconciliation.

**→ MVP ships here.** Recruitment, Performance, Shift complexity beyond basics, and Payroll
are deliberately sequenced after MVP validation, not bundled into it — payroll in particular
is the single highest-liability module (real money, tax compliance) and should be built once
the platform's core data (attendance, leave) has been running in production long enough to
trust its accuracy as payroll's input.

## Phase 3 — Payroll

**Objective:** the highest-risk, highest-value module, built on now-proven attendance/leave
data.

- Deliverables: salary structure management; earnings/deductions configuration; tax/PF/ESI
  calculation engine (jurisdiction-configurable); payroll run (dedicated worker, queue-
  triggered, idempotent); payslip generation (PDF, R2-stored) + delivery; payroll reports.
- Dependencies: Phase 2 (attendance for LOP calculation, leave for balance-encashment).
- Complexity: **Very High** — tax/statutory logic must be correct, not approximately correct;
  budget for this being the longest phase.
- Testing: exhaustive unit tests on the calculation engine against known-correct worked
  examples; idempotency test (re-running a "completed" payroll run must not double-pay);
  reconciliation test against a manually computed sample payroll for at least one real
  jurisdiction before launch.
- Definition of done: a full monthly payroll run for a pilot tenant matches a manually
  verified calculation to the paisa/cent, and re-triggering the run is a safe no-op.

## Phase 4 — Recruitment + Performance

**Objective:** round out the full module list from the original spec; both are lower-risk,
lower-frequency than Phases 1-3.

- Deliverables: job openings, candidate pipeline, interview scheduling/feedback, offer
  management; goal management, review cycles, ratings, promotion workflow.
- Dependencies: Phase 1 (candidate→employee conversion needs Employee service).
- Complexity: Medium.
- Testing: E2E on the hiring pipeline (job → candidate → interview → offer → hired →
  employee record created) and the review cycle lifecycle.
- Definition of done: a candidate hired through Recruitment appears as a fully-formed
  Employee record with no manual data re-entry.

## Phase 5 — Enterprise hardening & scale-out

**Objective:** the capabilities that don't matter at 10 tenants but are required to sell to
100+ and to the first large/regulated customer.

- Deliverables: Isolated tenancy tier; read replica + Reporting service with export
  generation; audit log UI/export for compliance; custom branding/white-label; SSO
  (SAML/OIDC) for enterprise IdPs; MFA enforcement; rate-limit tuning and abuse monitoring;
  attendance table partitioning cutover; payroll worker pool scaling.
- Dependencies: Phases 0-4 in production with real usage data to know what actually needs
  hardening (don't pre-optimize against [08-scalability.md](08-scalability.md) stages the
  platform hasn't reached yet).
- Complexity: High, but spread across many independent workstreams that can run in parallel
  with different owners.
- Testing: security review / pen test before enterprise SSO and the isolated tier ship;
  load test against Phase-appropriate scale target from
  [08-scalability.md](08-scalability.md).
- Definition of done: platform passes an external security review and can onboard a
  contractually-isolated enterprise tenant without code changes.
