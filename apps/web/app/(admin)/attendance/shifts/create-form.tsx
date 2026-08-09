"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label } from "@hrm/ui";
import { createShiftTemplateAction, type ShiftTemplateActionState } from "./actions";

const initialState: ShiftTemplateActionState = {};

export function CreateShiftTemplateForm() {
  const [state, formAction, pending] = useActionState(createShiftTemplateAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="e.g. General Shift" required />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input id="isNightShift" name="isNightShift" type="checkbox" className="h-4 w-4" />
          <Label htmlFor="isNightShift">Night shift</Label>
        </div>
        <div>
          <Label htmlFor="startTime">Start time</Label>
          <Input id="startTime" name="startTime" type="time" required />
        </div>
        <div>
          <Label htmlFor="endTime">End time</Label>
          <Input id="endTime" name="endTime" type="time" required />
        </div>
        <div>
          <Label htmlFor="graceMinutes">Grace minutes</Label>
          <Input id="graceMinutes" name="graceMinutes" type="number" min="0" placeholder="e.g. 10" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Adding..." : "Add shift template"}
      </Button>
    </form>
  );
}
