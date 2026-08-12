"use client";

import { useActionState } from "react";
import type { ReviewCycle } from "@hrm/types";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { createGoalAction, type GoalActionState } from "./actions";

const initialState: GoalActionState = {};

export function GoalCreateForm({ cycles }: { cycles: ReviewCycle[] }) {
  const [state, formAction, pending] = useActionState(createGoalAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
        </div>
        <div>
          <Label htmlFor="weight">Weight (%)</Label>
          <Input id="weight" name="weight" type="number" min="0" max="100" />
        </div>
        <div>
          <Label htmlFor="reviewCycleId">Review cycle</Label>
          <Select id="reviewCycleId" name="reviewCycleId" defaultValue="">
            <option value="">—</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Adding..." : "Add goal"}
      </Button>
    </form>
  );
}
