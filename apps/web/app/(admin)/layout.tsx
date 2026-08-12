import { redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/requireAuth";
import { AppShell } from "@/components/app-shell";

const NAV_ITEMS = [
  { href: "/employees", label: "Employees" },
  { href: "/employees/import", label: "Import CSV" },
  { href: "/departments", label: "Departments" },
  { href: "/branches", label: "Branches" },
  { href: "/designations", label: "Designations" },
  { href: "/leave/types", label: "Leave Types" },
  { href: "/leave/holidays", label: "Holidays" },
  { href: "/leave/approvals", label: "Leave Approvals" },
  { href: "/attendance/shifts", label: "Shift Templates" },
  { href: "/attendance/shift-assignments", label: "Shift Assignments" },
  { href: "/attendance/corrections", label: "Attendance Corrections" },
  { href: "/payroll/component-types", label: "Pay Component Types" },
  { href: "/payroll/salary-structures", label: "Salary Structures" },
  { href: "/payroll/tax-config", label: "Payroll Tax Config" },
  { href: "/payroll/runs", label: "Payroll Runs" },
  { href: "/recruitment/job-openings", label: "Job Openings" },
  { href: "/recruitment/candidates", label: "Candidates" },
  { href: "/performance/review-cycles", label: "Review Cycles" },
  { href: "/performance/reviews", label: "Reviews" },
  { href: "/performance/promotions", label: "Promotions" },
  { href: "/audit-log", label: "Audit Log" },
  { href: "/directory", label: "Directory" },
  { href: "/profile", label: "My Profile" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  const isAdmin = hasPermission(auth, "employee.write_all") || hasPermission(auth, "department.manage");
  if (!isAdmin) redirect("/profile");

  return (
    <AppShell auth={auth} navItems={NAV_ITEMS}>
      {children}
    </AppShell>
  );
}
