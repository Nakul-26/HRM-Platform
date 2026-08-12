"use client";

import { useActionState } from "react";
import type { Designation } from "@hrm/types";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { createOfferAction, type CandidateDetailActionState } from "./actions";

const initialState: CandidateDetailActionState = {};

export function OfferForm({ candidateId, designations }: { candidateId: string; designations: Designation[] }) {
  const [state, formAction, pending] = useActionState(createOfferAction.bind(null, candidateId), initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="designationId">Designation</Label>
          <Select id="designationId" name="designationId" defaultValue="">
            <option value="">—</option>
            {designations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="offeredCtc">Offered CTC</Label>
          <Input id="offeredCtc" name="offeredCtc" type="number" step="0.01" required />
        </div>
        <div>
          <Label htmlFor="joiningDate">Joining date</Label>
          <Input id="joiningDate" name="joiningDate" type="date" required />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit" size="sm">
        {pending ? "Creating..." : "Create offer"}
      </Button>
    </form>
  );
}
