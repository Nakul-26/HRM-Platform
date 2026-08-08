import { redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/requireAuth";
import { AppShell } from "@/components/app-shell";

const NAV_ITEMS = [
  { href: "/employees", label: "Employees" },
  { href: "/employees/import", label: "Import CSV" },
  { href: "/departments", label: "Departments" },
  { href: "/branches", label: "Branches" },
  { href: "/designations", label: "Designations" },
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
