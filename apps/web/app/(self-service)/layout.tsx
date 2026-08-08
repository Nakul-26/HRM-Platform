import { requireAuth } from "@/lib/requireAuth";
import { AppShell } from "@/components/app-shell";

const NAV_ITEMS = [
  { href: "/profile", label: "My Profile" },
  { href: "/leave", label: "My Leave" },
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
