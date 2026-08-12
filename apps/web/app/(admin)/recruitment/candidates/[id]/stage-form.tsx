"use client";

import { useActionState } from "react";
import { Alert, Button, Select } from "@hrm/ui";
import { updateStageAction, type CandidateDetailActionState } from "./actions";

const initialState: CandidateDetailActionState = {};
const STAGES = ["applied", "screening", "interview", "offer", "rejected"] as const;

export function StageForm({ candidateId, currentStage }: { candidateId: string; currentStage: string }) {
  const [state, formAction, pending] = useActionState(updateStageAction.bind(null, candidateId), initialState);

  return (
    <form action={formAction} className="flex items-end gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Select name="pipelineStage" defaultValue={currentStage} className="w-40">
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Updating..." : "Update stage"}
      </Button>
    </form>
  );
}
