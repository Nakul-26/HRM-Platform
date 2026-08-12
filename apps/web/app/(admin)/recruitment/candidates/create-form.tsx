"use client";

import { useActionState } from "react";
import type { JobOpening } from "@hrm/types";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { createCandidateAction, type CandidateActionState } from "./actions";

const initialState: CandidateActionState = {};

export function CreateCandidateForm({ jobOpenings }: { jobOpenings: JobOpening[] }) {
  const [state, formAction, pending] = useActionState(createCandidateAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="jobOpeningId">Job opening</Label>
          <Select id="jobOpeningId" name="jobOpeningId" defaultValue="" required>
            <option value="" disabled>
              Select a job opening
            </option>
            {jobOpenings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create candidate"}
      </Button>
    </form>
  );
}
