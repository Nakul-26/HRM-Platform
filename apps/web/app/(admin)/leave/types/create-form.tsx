"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { createLeaveTypeAction, type LeaveTypeActionState } from "./actions";

const initialState: LeaveTypeActionState = {};

export function CreateLeaveTypeForm() {
  const [state, formAction, pending] = useActionState(createLeaveTypeAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="e.g. Casual Leave" required />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input id="isPaid" name="isPaid" type="checkbox" defaultChecked className="h-4 w-4" />
          <Label htmlFor="isPaid">Paid</Label>
        </div>
        <div>
          <Label htmlFor="accrualPer">Accrual</Label>
          <Select id="accrualPer" name="accrualPer" defaultValue="none">
            <option value="none">No automatic accrual</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="accrualDays">Days per period</Label>
          <Input id="accrualDays" name="accrualDays" type="number" min="0" step="0.5" placeholder="e.g. 1.5" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Adding..." : "Add leave type"}
      </Button>
    </form>
  );
}
