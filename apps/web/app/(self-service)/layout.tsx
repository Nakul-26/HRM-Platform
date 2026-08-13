import { requireAuth } from "@/lib/requireAuth";
import { AppShell } from "@/components/app-shell";

const NAV_ITEMS = [
  { href: "/profile", label: "My Profile" },
  { href: "/attendance", label: "Attendance" },
  { href: "/leave", label: "My Leave" },
  { href: "/payroll", label: "Payslips" },
  { href: "/interviews", label: "My Interviews" },
  { href: "/performance", label: "My Performance" },
  { href: "/reports", label: "Reports" },
  { href: "/security", label: "Security" },
  { href: "/directory", label: "Directory" },
];

export default async function SelfServiceLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  return (
    <AppShell auth={auth} navItems={NAV_ITEMS}>
      {children}
    </AppShell>
  );
}
