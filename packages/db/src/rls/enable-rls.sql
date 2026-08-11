-- Row-Level Security setup (docs/architecture/03-multi-tenancy.md).
--
-- Applied by src/migrate.ts immediately after the Drizzle-generated schema
-- migrations, because none of this is expressible in Drizzle's typed schema
-- builder: RLS policies, role creation/grants, and partial indexes.
--
-- IMPORTANT: Postgres superusers AND table owners bypass RLS by default.
-- Tables are created by the migration-running role (DATABASE_URL, an admin
-- connection). The `hrm_app` role below is deliberately a distinct,
-- non-owner, non-superuser role — services and tests connect as `hrm_app`
-- (APP_DATABASE_URL) specifically so these policies are not silently
-- bypassed. Connecting as the admin role for anything other than
-- migrations defeats this entire section.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hrm_app') THEN
    CREATE ROLE hrm_app LOGIN PASSWORD 'hrm_app_dev_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO hrm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hrm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hrm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hrm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hrm_app;

-- audit_logs is append-only: a compromised service credential must not be
-- able to rewrite or erase history (docs/architecture/06-security.md).
REVOKE UPDATE, DELETE ON audit_logs FROM hrm_app;

-- One policy shape, applied to every table that carries tenant_id. Reads
-- AND writes are scoped: USING gates what's visible, WITH CHECK gates what
-- can be inserted/updated so a caller can't write a row into a tenant it
-- isn't scoped to, even if it somehow got the tenant_id value.
DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'tenant_settings', 'roles', 'audit_logs',
    'user', 'session', 'account',
    'departments', 'branches', 'designations', 'employees', 'employee_documents',
    'shift_templates', 'employee_shift_assignments', 'attendance_records', 'attendance_corrections',
    'leave_types', 'leave_balances', 'leave_requests', 'holiday_calendar',
    'pay_component_types', 'payroll_tax_config', 'salary_structures', 'payroll_runs', 'payslips',
    'job_openings', 'candidates', 'interviews',
    'review_cycles', 'goals', 'reviews',
    'notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    -- NULLIF guards against a Postgres quirk: once a session has touched a
    -- custom GUC via set_config(..., true) even inside a transaction that
    -- later commits, current_setting(name, true) returns '' (not NULL) on
    -- subsequent calls in that session instead of NULL — casting '' to uuid
    -- errors instead of safely denying. NULLIF(..., '') normalizes both
    -- "never set" and "reset after being set" to NULL, which the cast and
    -- the equality check both handle as a clean deny.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;

-- Partial index for the "unread notifications" query dashboards poll
-- constantly (not expressible as a typed Drizzle index — see schema/notifications.ts).
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications (tenant_id, recipient_id)
  WHERE read_at IS NULL;
