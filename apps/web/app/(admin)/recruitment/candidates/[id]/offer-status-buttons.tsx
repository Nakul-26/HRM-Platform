"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@hrm/ui";
import { updateOfferStatusAction } from "./actions";

export function OfferStatusButtons({ candidateId, offerId, status }: { candidateId: string; offerId: string; status: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateStatus(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateOfferStatusAction(candidateId, offerId, next);
      if (!result.ok) setError(result.error ?? "Could not update this offer.");
      else router.refresh();
    });
  }

  if (status !== "pending") return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => updateStatus("accepted")}>
          Accept
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => updateStatus("declined")}>
          Decline
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => updateStatus("withdrawn")}>
          Withdraw
        </Button>
      </div>
    </div>
  );
}
