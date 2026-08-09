"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AttendanceRecord, ShiftTemplate } from "@hrm/types";
import { Alert, Button } from "@hrm/ui";
import { clockInAction, clockOutAction } from "./actions";

export function ClockWidget({
  todayRecord,
  shiftTemplate,
}: {
  todayRecord: AttendanceRecord | null;
  shiftTemplate: ShiftTemplate | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClockIn() {
    setError(null);
    startTransition(async () => {
      const result = await clockInAction();
      if (!result.ok) setError(result.error ?? "Could not clock in.");
      else router.refresh();
    });
  }

  function handleClockOut() {
    setError(null);
    startTransition(async () => {
      const result = await clockOutAction();
      if (!result.ok) setError(result.error ?? "Could not clock out.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}
      <p className="text-sm text-slate-500">
        {shiftTemplate ? `Your shift: ${shiftTemplate.startTime}–${shiftTemplate.endTime}` : "No shift assigned."}
      </p>
      {!todayRecord?.clockIn && (
        <Button type="button" disabled={pending} onClick={handleClockIn} className="w-fit">
          Clock in
        </Button>
      )}
      {todayRecord?.clockIn && !todayRecord.clockOut && (
        <Button type="button" disabled={pending} onClick={handleClockOut} className="w-fit">
          Clock out
        </Button>
      )}
      {todayRecord?.clockIn && todayRecord.clockOut && <p className="text-sm">Done for today.</p>}
    </div>
  );
}
