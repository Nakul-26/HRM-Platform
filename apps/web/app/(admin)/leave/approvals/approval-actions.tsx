"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Textarea } from "@hrm/ui";
import { approveLeaveRequestAction, rejectLeaveRequestAction } from "./actions";

export function ApprovalActions({ requestId }: { requestId: string }) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveLeaveRequestAction(requestId);
      if (!result.ok) setError(result.error ?? "Could not approve.");
      else router.refresh();
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectLeaveRequestAction(requestId, reason);
      if (!result.ok) setError(result.error ?? "Could not reject.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={handleApprove}>
          Approve
        </Button>
        <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => setShowReject((v) => !v)}>
          Reject
        </Button>
      </div>
      {showReject && (
        <div className="flex w-64 flex-col gap-2">
          <Textarea
            rows={2}
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={handleReject}>
            Confirm reject
          </Button>
        </div>
      )}
    </div>
  );
}
