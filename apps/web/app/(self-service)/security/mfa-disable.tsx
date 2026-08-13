"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label } from "@hrm/ui";
import { disableMfaAction, type DisableState } from "./actions";

const initialState: DisableState = {};

export function MfaDisable() {
  const [state, formAction, pending] = useActionState(disableMfaAction, initialState);

  if (state.disabled) {
    return <Alert variant="info">MFA has been disabled on your account.</Alert>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <p className="text-sm text-slate-600">MFA is currently enabled. Enter a current code (or a backup code) to disable it.</p>
      <div>
        <Label htmlFor="disable-code">Code</Label>
        <Input id="disable-code" name="code" inputMode="numeric" maxLength={10} required />
      </div>
      <div>
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? "Disabling..." : "Disable MFA"}
        </Button>
      </div>
    </form>
  );
}
