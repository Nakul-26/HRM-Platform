"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@hrm/ui";
import { closeReviewCycleAction } from "./actions";

export function CloseCycleButton({ cycleId }: { cycleId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClose() {
    setError(null);
    startTransition(async () => {
      const result = await closeReviewCycleAction(cycleId);
      if (!result.ok) setError(result.error ?? "Could not close this review cycle.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={handleClose}>
        {pending ? "Closing..." : "Close cycle"}
      </Button>
    </div>
  );
}
