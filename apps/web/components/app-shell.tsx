import Link from "next/link";
import type { AuthContext } from "@hrm/types";
import { SignOutButton } from "./sign-out-button";

export function AppShell({
  auth,
  navItems,
  children,
}: {
  auth: AuthContext;
  navItems: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white p-4">
        <div className="mb-6 px-2 text-lg font-semibold text-slate-900">HRM</div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-100 pt-3">
          <p className="px-2 text-xs text-slate-500">{auth.roleName}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
