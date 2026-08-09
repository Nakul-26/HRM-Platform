"use client";

import { useActionState } from "react";
import type { Employee, ShiftTemplate } from "@hrm/types";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { createShiftAssignmentAction, type ShiftAssignmentActionState } from "./actions";

const initialState: ShiftAssignmentActionState = {};

export function CreateShiftAssignmentForm({ employees, shiftTemplates }: { employees: Employee[]; shiftTemplates: ShiftTemplate[] }) {
  const [state, formAction, pending] = useActionState(createShiftAssignmentAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="employeeId">Employee</Label>
          <Select id="employeeId" name="employeeId" required defaultValue="">
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
          <Label htmlFor="shiftTemplateId">Shift</Label>
          <Select id="shiftTemplateId" name="shiftTemplateId" required defaultValue="">
            <option value="" disabled>
              Select a shift
            </option>
            {shiftTemplates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime}–{s.endTime})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="effectiveFrom">Effective from</Label>
          <Input id="effectiveFrom" name="effectiveFrom" type="date" required />
        </div>
        <div>
          <Label htmlFor="effectiveTo">Effective to (optional)</Label>
          <Input id="effectiveTo" name="effectiveTo" type="date" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Assigning..." : "Assign shift"}
      </Button>
    </form>
  );
}
