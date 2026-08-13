"use client";

import { useActionState } from "react";
import { Alert, Button } from "@hrm/ui";
import { saveMfaPolicyAction, type MfaPolicyActionState } from "./actions";

const initialState: MfaPolicyActionState = {};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  hr_manager: "HR Manager",
  manager: "Manager",
  employee: "Employee",
};

export function MfaPolicyForm({ allRoles, requiredRoles }: { allRoles: readonly string[]; requiredRoles: string[] }) {
  const [state, formAction, pending] = useActionState(saveMfaPolicyAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <p className="text-sm text-slate-600">
        Roles checked below must have MFA enabled to log in with a password. Anyone can enroll voluntarily from{" "}
        <span className="font-medium">Security</span> regardless of this policy.
      </p>
      <div className="flex flex-col gap-2">
        {allRoles.map((role) => (
          <div key={role} className="flex items-center gap-2">
            <input
              id={`role-${role}`}
              name="requiredRoles"
              type="checkbox"
              value={role}
              defaultChecked={requiredRoles.includes(role)}
              className="h-4 w-4"
            />
            <label htmlFor={`role-${role}`} className="text-sm">
              {ROLE_LABELS[role] ?? role}
            </label>
          </div>
        ))}
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save MFA policy"}
        </Button>
      </div>
    </form>
  );
}
