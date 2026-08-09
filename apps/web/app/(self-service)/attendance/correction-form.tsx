"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label, Select, Textarea } from "@hrm/ui";
import { applyCorrectionAction, type ApplyCorrectionState } from "./actions";

const initialState: ApplyCorrectionState = {};

export function CorrectionForm() {
  const [state, formAction, pending] = useActionState(applyCorrectionAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && <Alert variant="success">Correction request submitted.</Alert>}
      <div>
        <Label htmlFor="workDate">Work date</Label>
        <Input id="workDate" name="workDate" type="date" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="requestedClockInTime">Corrected clock-in (UTC)</Label>
          <Input id="requestedClockInTime" name="requestedClockInTime" type="time" />
        </div>
        <div>
          <Label htmlFor="requestedClockOutTime">Corrected clock-out (UTC)</Label>
          <Input id="requestedClockOutTime" name="requestedClockOutTime" type="time" />
        </div>
      </div>
      <div>
        <Label htmlFor="requestedStatus">Corrected status (optional)</Label>
        <Select id="requestedStatus" name="requestedStatus" defaultValue="">
          <option value="">No change</option>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="half_day">Half day</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="reason">Reason</Label>
        <Textarea id="reason" name="reason" rows={3} />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Submitting..." : "Submit correction request"}
      </Button>
    </form>
  );
}
