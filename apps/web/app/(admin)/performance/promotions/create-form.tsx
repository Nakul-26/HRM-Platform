"use client";

import { useActionState } from "react";
import type { Designation, Review, ReviewableEmployee, ReviewCycle } from "@hrm/types";
import { Alert, Button, Input, Label, Select, Textarea } from "@hrm/ui";
import { createPromotionAction, type PromotionActionState } from "./actions";

const initialState: PromotionActionState = {};

export function CreatePromotionForm({
  employees,
  reviews,
  cycles,
  designations,
}: {
  employees: ReviewableEmployee[];
  reviews: Review[];
  cycles: ReviewCycle[];
  designations: Designation[];
}) {
  const [state, formAction, pending] = useActionState(createPromotionAction, initialState);

  const employeeName = (id: string) => {
    const employee = employees.find((e) => e.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };
  const cycleName = (id: string) => cycles.find((c) => c.id === id)?.name ?? "Unknown cycle";

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
          <Label htmlFor="reviewId">Review it&apos;s tied to</Label>
          <Select id="reviewId" name="reviewId" defaultValue="" required>
            <option value="" disabled>
              Select a review
            </option>
            {reviews.map((r) => (
              <option key={r.id} value={r.id}>
                {employeeName(r.employeeId)} — {cycleName(r.reviewCycleId)} ({r.rating ?? "no rating"})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="newDesignationId">New designation</Label>
          <Select id="newDesignationId" name="newDesignationId" defaultValue="" required>
            <option value="" disabled>
              Select a designation
            </option>
            {designations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="effectiveDate">Effective date</Label>
          <Input id="effectiveDate" name="effectiveDate" type="date" required />
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Recording..." : "Record promotion"}
      </Button>
    </form>
  );
}
