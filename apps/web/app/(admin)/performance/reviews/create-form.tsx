"use client";

import { useActionState } from "react";
import type { ReviewableEmployee, ReviewCycle } from "@hrm/types";
import { Alert, Button, Input, Label, Select, Textarea } from "@hrm/ui";
import { createReviewAction, type ReviewActionState } from "./actions";

const initialState: ReviewActionState = {};

export function CreateReviewForm({ employees, cycles }: { employees: ReviewableEmployee[]; cycles: ReviewCycle[] }) {
  const [state, formAction, pending] = useActionState(createReviewAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="employeeId">Employee</Label>
          <Select id="employeeId" name="employeeId" defaultValue="" required>
            <option value="" disabled>
              Select an employee
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="reviewCycleId">Review cycle</Label>
          <Select id="reviewCycleId" name="reviewCycleId" defaultValue="" required>
            <option value="" disabled>
              Select a review cycle
            </option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="rating">Rating (0-5)</Label>
          <Input id="rating" name="rating" type="number" min="0" max="5" step="0.1" />
        </div>
      </div>
      <div>
        <Label htmlFor="comments">Comments</Label>
        <Textarea id="comments" name="comments" rows={3} />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create review"}
      </Button>
    </form>
  );
}
