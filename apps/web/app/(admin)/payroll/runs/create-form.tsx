"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label } from "@hrm/ui";
import { createPayrollRunAction, type PayrollRunActionState } from "./actions";

const initialState: PayrollRunActionState = {};

export function CreatePayrollRunForm() {
  const [state, formAction, pending] = useActionState(createPayrollRunAction, initialState);
  const now = new Date();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="periodMonth">Month (1-12)</Label>
          <Input id="periodMonth" name="periodMonth" type="number" min="1" max="12" defaultValue={now.getMonth() + 1} required />
        </div>
        <div>
          <Label htmlFor="periodYear">Year</Label>
          <Input id="periodYear" name="periodYear" type="number" min="2000" max="2100" defaultValue={now.getFullYear()} required />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create payroll run"}
      </Button>
    </form>
  );
}
