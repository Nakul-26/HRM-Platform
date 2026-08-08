"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@hrm/ui";
import { createDesignationAction, type DesignationActionState } from "./actions";

const initialState: DesignationActionState = {};

export function CreateDesignationForm() {
  const [state, formAction, pending] = useActionState(createDesignationAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="flex-1">
        <Input name="title" placeholder="e.g. Staff Engineer" required />
      </div>
      <div className="flex-1">
        <Input name="grade" placeholder="e.g. L5" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add designation"}
      </Button>
    </form>
  );
}
