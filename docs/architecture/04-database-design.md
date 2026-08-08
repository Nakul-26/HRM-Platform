# Database Design

Single Postgres cluster, one logical database, tables grouped by domain via naming prefix
(not physical schemas, to keep RLS policies and migrations uniform — see
[03-multi-tenancy.md](03-multi-tenancy.md)). Every table below has an implicit
`tenant_id UUID NOT NULL REFERENCES tenants(id)` and RLS policy unless noted otherwise.
Timestamps (`created_at`, `updated_at`, soft-delete `deleted_at`) are omitted from DDL for
brevity but present on every table.

## Platform

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  isolation_tier TEXT NOT NULL DEFAULT 'pooled', -- pooled | isolated
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | active | suspended
  plan TEXT NOT NULL DEFAULT 'trial',
  onboarding_step TEXT,
  fiscal_year_start_month SMALLINT NOT NULL DEFAULT 4,
  default_currency TEXT NOT NULL DEFAULT 'INR'
);

CREATE TABLE tenant_settings (
  tenant_id UUID REFERENCES tenants(id),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tenant_id, name)
);

CREATE TABLE permissions (
  key TEXT PRIMARY KEY,          -- e.g. 'leave.approve', 'payroll.run'
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id),
  permission_key TEXT REFERENCES permissions(key),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,          -- e.g. 'employee.updated'
  resource_type TEXT NOT NULL,
  resource_id UUID,
  before JSONB,
  after JSONB,
  ip_address INET,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (occurred_at); -- monthly partitions, append-only, no RLS UPDATE/DELETE grants
```

## Core HR

```sql
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  parent_department_id UUID REFERENCES departments(id)
);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  address JSONB,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'
);

CREATE TABLE designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  grade TEXT
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),        -- link to auth identity, nullable pre-activation
  employee_code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  personal_email TEXT,
  work_email TEXT,
  phone TEXT,
  department_id UUID REFERENCES departments(id),
  designation_id UUID REFERENCES designations(id),
  branch_id UUID REFERENCES branches(id),
  manager_id UUID REFERENCES employees(id),
  employment_type TEXT NOT NULL,            -- full_time | part_time | contract | intern
  date_of_joining DATE NOT NULL,
  date_of_exit DATE,
  status TEXT NOT NULL DEFAULT 'active',    -- active | on_leave | terminated
  UNIQUE (tenant_id, employee_code)
);
CREATE INDEX idx_employees_tenant_manager ON employees (tenant_id, manager_id);
CREATE INDEX idx_employees_tenant_department ON employees (tenant_id, department_id);
CREATE INDEX idx_employees_tenant_status ON employees (tenant_id, status);

CREATE TABLE employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  document_type TEXT NOT NULL,   -- id_proof | contract | certificate | ...
  r2_object_key TEXT NOT NULL,
  uploaded_by UUID REFERENCES employees(id)
);
```

## Attendance

```sql
CREATE TABLE shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_night_shift BOOLEAN NOT NULL DEFAULT false,
  grace_minutes SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE employee_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  shift_template_id UUID NOT NULL REFERENCES shift_templates(id),
  effective_from DATE NOT NULL,
  effective_to DATE
);

CREATE TABLE attendance_records (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  work_date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  source TEXT NOT NULL,          -- biometric | manual | mobile | web
  status TEXT NOT NULL,          -- present | absent | half_day | on_leave | holiday
  late_minutes INT NOT NULL DEFAULT 0,
  overtime_minutes INT NOT NULL DEFAULT 0,
  is_corrected BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tenant_id, employee_id, work_date)
) PARTITION BY RANGE (work_date); -- monthly partitions — see 08-scalability.md
CREATE INDEX idx_attendance_tenant_date ON attendance_records (tenant_id, work_date);
```

`attendance_records` is the highest-write-volume table in the schema; partitioning by month
keeps indexes small and makes archival of old partitions trivial (see
[08-scalability.md](08-scalability.md)).

## Leave

```sql
CREATE TABLE leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,           -- Casual, Sick, Earned, Comp-Off
  is_paid BOOLEAN NOT NULL DEFAULT true,
  accrual_rule JSONB            -- e.g. { "per": "month", "days": 1.5 }
);

CREATE TABLE leave_balances (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  year SMALLINT NOT NULL,
  entitled NUMERIC(6,2) NOT NULL DEFAULT 0,
  used NUMERIC(6,2) NOT NULL DEFAULT 0,
  carried_forward NUMERIC(6,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, employee_id, leave_type_id, year)
);

CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(4,2) NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  approver_id UUID REFERENCES employees(id),
  decided_at TIMESTAMPTZ
);
CREATE INDEX idx_leave_requests_tenant_status ON leave_requests (tenant_id, status);

CREATE TABLE holiday_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id), -- null = applies to all branches
  name TEXT NOT NULL,
  date DATE NOT NULL
);
```

## Payroll

```sql
CREATE TABLE salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  effective_from DATE NOT NULL,
  components JSONB NOT NULL      -- [{ "type": "basic", "amount": 50000 }, { "type": "hra", ... }]
);

CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  period_month SMALLINT NOT NULL,
  period_year SMALLINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | processing | completed | failed
  processed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, period_month, period_year)
);

CREATE TABLE payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  gross_earnings NUMERIC(12,2) NOT NULL,
  total_deductions NUMERIC(12,2) NOT NULL,
  net_pay NUMERIC(12,2) NOT NULL,
  breakdown JSONB NOT NULL,       -- full earnings/deductions/tax/PF/ESI line items
  r2_object_key TEXT,             -- generated PDF
  UNIQUE (tenant_id, payroll_run_id, employee_id)
);
```

Payroll intentionally denormalizes `breakdown` into JSONB per payslip rather than a fully
normalized line-items table — payslips are immutable historical records once generated, and a
line-items table buys nothing but join overhead for a document that's never edited in place.

## Recruitment

```sql
CREATE TABLE job_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  job_opening_id UUID NOT NULL REFERENCES job_openings(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  resume_r2_key TEXT,
  pipeline_stage TEXT NOT NULL DEFAULT 'applied' -- applied | screening | interview | offer | hired | rejected
);

CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  interviewer_id UUID REFERENCES employees(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  feedback TEXT,
  rating SMALLINT
);
```

## Performance

```sql
CREATE TABLE review_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  review_cycle_id UUID REFERENCES review_cycles(id),
  title TEXT NOT NULL,
  weight SMALLINT,
  progress SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  review_cycle_id UUID NOT NULL REFERENCES review_cycles(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  reviewer_id UUID NOT NULL REFERENCES employees(id),
  rating NUMERIC(3,1),
  comments TEXT
);
```

## Notifications

```sql
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  recipient_id UUID NOT NULL REFERENCES employees(id),
  channel TEXT NOT NULL,         -- email | sms | push | in_app
  template_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | sent | failed
  read_at TIMESTAMPTZ
);
CREATE INDEX idx_notifications_recipient_unread ON notifications (tenant_id, recipient_id) WHERE read_at IS NULL;
```

## Indexing strategy

- Every foreign key that's filtered on in a hot query gets a composite index led by
  `tenant_id` — RLS filters on `tenant_id` on every query, so it must always be the leading
  column, otherwise Postgres can't use the index to satisfy the RLS predicate efficiently.
- `attendance_records` and `audit_logs` are range-partitioned by date/month — both are
  append-heavy and queried mostly by recent date range; partitioning keeps working-set indexes
  small and makes retention/archival a partition-drop instead of a deletion.
- Partial indexes (`WHERE read_at IS NULL`, `WHERE status = 'pending'`) for the common
  "unread"/"pending approval" queries that dashboards poll constantly.
- JSONB columns (`components`, `breakdown`, `accrual_rule`) are not indexed by default — they're
  read whole by ID, never filtered on; if a future report needs to query inside them, add a
  targeted GIN index at that point rather than preemptively.
