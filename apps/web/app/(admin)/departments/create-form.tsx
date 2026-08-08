"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@hrm/ui";
import { createDepartmentAction, type DepartmentActionState } from "./actions";

const initialState: DepartmentActionState = {};

export function CreateDepartmentForm() {
  const [state, formAction, pending] = useActionState(createDepartmentAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="flex-1">
        <Input name="name" placeholder="e.g. Engineering" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add department"}
      </Button>
    </form>
  );
}
