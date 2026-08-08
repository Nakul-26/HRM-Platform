"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@hrm/ui";
import { createBranchAction, type BranchActionState } from "./actions";

const initialState: BranchActionState = {};

export function CreateBranchForm() {
  const [state, formAction, pending] = useActionState(createBranchAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="flex-1">
        <Input name="name" placeholder="e.g. Bangalore HQ" required />
      </div>
      <div className="flex-1">
        <Input name="timezone" placeholder="Asia/Kolkata" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add branch"}
      </Button>
    </form>
  );
}
