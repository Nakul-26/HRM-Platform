"use client";

import { useActionState } from "react";
import type { LeaveType } from "@hrm/types";
import { Alert, Button, Input, Label, Select, Textarea } from "@hrm/ui";
import { applyLeaveAction, type ApplyLeaveState } from "./actions";

const initialState: ApplyLeaveState = {};

export function RequestLeaveForm({ leaveTypes }: { leaveTypes: LeaveType[] }) {
  const [state, formAction, pending] = useActionState(applyLeaveAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && <Alert variant="success">Leave request submitted.</Alert>}
      <div>
        <Label htmlFor="leaveTypeId">Leave type</Label>
        <Select id="leaveTypeId" name="leaveTypeId" required defaultValue="">
          <option value="" disabled>
            Select a leave type
          </option>
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" name="startDate" type="date" required />
        </div>
        <div>
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" name="endDate" type="date" required />
        </div>
      </div>
      <div>
        <Label htmlFor="reason">Reason (optional)</Label>
        <Textarea id="reason" name="reason" rows={3} />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Submitting..." : "Submit request"}
      </Button>
    </form>
  );
}
