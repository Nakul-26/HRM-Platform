"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@hrm/ui";
import { executePayrollRunAction } from "../actions";

export function ExecuteRunButton({ runId, disabled }: { runId: string; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleExecute() {
    setError(null);
    startTransition(async () => {
      const result = await executePayrollRunAction(runId);
      if (!result.ok) setError(result.error ?? "Could not execute this payroll run.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="button" disabled={disabled || pending} onClick={handleExecute}>
        {pending ? "Processing..." : "Execute"}
      </Button>
    </div>
  );
}
