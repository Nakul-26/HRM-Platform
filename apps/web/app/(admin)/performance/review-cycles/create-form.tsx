"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label } from "@hrm/ui";
import { createReviewCycleAction, type ReviewCycleActionState } from "./actions";

const initialState: ReviewCycleActionState = {};

export function CreateReviewCycleForm() {
  const [state, formAction, pending] = useActionState(createReviewCycleAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
        </div>
        <div>
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" name="startDate" type="date" required />
        </div>
        <div>
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" name="endDate" type="date" required />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create review cycle"}
      </Button>
    </form>
  );
}
