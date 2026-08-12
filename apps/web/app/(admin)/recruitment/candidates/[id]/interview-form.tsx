"use client";

import { useActionState } from "react";
import type { Employee } from "@hrm/types";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { scheduleInterviewAction, type CandidateDetailActionState } from "./actions";

const initialState: CandidateDetailActionState = {};

export function InterviewForm({ candidateId, employees }: { candidateId: string; employees: Employee[] }) {
  const [state, formAction, pending] = useActionState(scheduleInterviewAction.bind(null, candidateId), initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="interviewerId">Interviewer</Label>
          <Select id="interviewerId" name="interviewerId" defaultValue="" required>
            <option value="" disabled>
              Select an interviewer
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="scheduledAt">Scheduled at</Label>
          <Input id="scheduledAt" name="scheduledAt" type="datetime-local" required />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit" size="sm">
        {pending ? "Scheduling..." : "Schedule interview"}
      </Button>
    </form>
  );
}
