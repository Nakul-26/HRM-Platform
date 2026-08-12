"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@hrm/ui";
import { submitReviewAction } from "./actions";

export function SubmitReviewButton({ reviewId }: { reviewId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitReviewAction(reviewId);
      if (!result.ok) setError(result.error ?? "Could not submit this review.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="button" size="sm" disabled={pending} onClick={handleSubmit}>
        {pending ? "Submitting..." : "Submit"}
      </Button>
    </div>
  );
}
