"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@hrm/ui";
import { createHolidayAction, type HolidayActionState } from "./actions";

const initialState: HolidayActionState = {};

export function CreateHolidayForm() {
  const [state, formAction, pending] = useActionState(createHolidayAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="flex-1">
        <Input name="name" placeholder="e.g. Independence Day" required />
      </div>
      <div>
        <Input name="date" type="date" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add holiday"}
      </Button>
    </form>
  );
}
