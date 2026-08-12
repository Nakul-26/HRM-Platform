"use client";

import { useActionState } from "react";
import type { Department } from "@hrm/types";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { createJobOpeningAction, type JobOpeningActionState } from "./actions";

const initialState: JobOpeningActionState = {};

export function CreateJobOpeningForm({ departments }: { departments: Department[] }) {
  const [state, formAction, pending] = useActionState(createJobOpeningAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
        </div>
        <div>
          <Label htmlFor="departmentId">Department</Label>
          <Select id="departmentId" name="departmentId" defaultValue="">
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="employmentType">Employment type</Label>
          <Select id="employmentType" name="employmentType" defaultValue="full_time">
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
            <option value="contract">Contract</option>
            <option value="intern">Intern</option>
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create job opening"}
      </Button>
    </form>
  );
}
