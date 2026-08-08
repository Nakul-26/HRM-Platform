import { eq } from "drizzle-orm";
import { PERMISSIONS } from "@hrm/types";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient } from "./client";
import { permissions, tenants } from "./schema/index";
import { createTenant } from "./onboarding";

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "employee.read": "View direct reports' employee records",
  "employee.read_all": "View any employee record in the tenant",
  "employee.write": "Edit direct reports' employee records",
  "employee.write_all": "Edit any employee record in the tenant",
  "employee.terminate": "Mark an employee as terminated",
  "department.manage": "Create/edit departments, branches, designations",
  "attendance.read": "View direct reports' attendance",
  "attendance.read_all": "View any employee's attendance",
  "attendance.correct": "Correct direct reports' attendance records",
  "attendance.correct_all": "Correct any employee's attendance records",
  "leave.apply": "Apply for one's own leave",
  "leave.approve": "Approve/reject direct reports' leave requests",
  "leave.approve_all": "Approve/reject any employee's leave requests",
  "leave.policy.manage": "Manage leave types, accrual rules, holiday calendar",
  "payroll.run": "Trigger a payroll run",
  "payroll.view": "View one's own payslips",
  "payroll.view_all": "View any employee's payslips",
  "recruitment.manage": "Manage job openings, candidates, interviews",
  "performance.review": "Submit reviews for direct reports",
  "performance.review_all": "Submit reviews for any employee",
  "tenant.settings.manage": "Edit tenant-wide settings and branding",
  "role.manage": "Create/edit custom roles",
  "audit_log.read": "View the audit log",
};

async function main() {
  const env = loadEnv(baseEnvSchema);
  const db = createDbClient(env.DATABASE_URL);

  console.log("Seeding permission catalog...");
  await db
    .insert(permissions)
    .values(PERMISSIONS.map((key) => ({ key, description: PERMISSION_DESCRIPTIONS[key] ?? key })))
    .onConflictDoNothing();

  if (env.NODE_ENV === "development") {
    const [existing] = await db.select().from(tenants).where(eq(tenants.subdomain, "demo"));
    if (existing) {
      console.log(`Demo tenant already exists (${existing.id}), skipping — seed is safe to re-run.`);
    } else {
      console.log("Seeding local dev demo tenant...");
      const tenant = await createTenant(db, {
        slug: "demo",
        name: "Demo Org",
        adminEmail: "admin@demo.local",
        adminName: "Demo Admin",
        adminPassword: "DemoPass123!",
      });
      console.log(`Created tenant '${tenant.subdomain}' (${tenant.id})`);
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
