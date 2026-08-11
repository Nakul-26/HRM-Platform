"use client";

import { useActionState } from "react";
import type { Employee, PayComponentType } from "@hrm/types";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { createSalaryStructureAction, type SalaryStructureActionState } from "./actions";

const initialState: SalaryStructureActionState = {};
const COMPONENT_ROWS = 5;

export function CreateSalaryStructureForm({
  employees,
  componentTypes,
}: {
  employees: Employee[];
  componentTypes: PayComponentType[];
}) {
  const [state, formAction, pending] = useActionState(createSalaryStructureAction, initialState);

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
                {e.firstName} {e.lastName} ({e.employeeCode})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="effectiveFrom">Effective from</Label>
          <Input id="effectiveFrom" name="effectiveFrom" type="date" required />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Components</Label>
        {Array.from({ length: COMPONENT_ROWS }, (_, i) => (
          <div key={i} className="grid grid-cols-2 gap-4">
            <Select name={`componentCode${i}`} defaultValue="">
              <option value="">—</option>
              {componentTypes.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>
            <Input name={`componentAmount${i}`} type="number" step="0.01" placeholder="Amount" />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create salary structure"}
      </Button>
    </form>
  );
}
