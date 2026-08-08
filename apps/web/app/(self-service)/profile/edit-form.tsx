"use client";

import { useActionState } from "react";
import type { Employee } from "@hrm/types";
import { Alert, Button, Input, Label } from "@hrm/ui";
import { updateProfileAction, type ProfileFormState } from "./actions";

const initialState: ProfileFormState = {};

export function EditProfileForm({ employee }: { employee: Employee }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && <Alert variant="success">Profile updated.</Alert>}
      <div>
        <Label htmlFor="personalEmail">Personal email</Label>
        <Input id="personalEmail" name="personalEmail" type="email" defaultValue={employee.personalEmail ?? ""} />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={employee.phone ?? ""} />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
