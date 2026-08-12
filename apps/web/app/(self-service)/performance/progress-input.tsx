"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@hrm/ui";
import { updateGoalProgressAction } from "./actions";

export function ProgressInput({ goalId, initialProgress }: { goalId: string; initialProgress: number }) {
  const [progress, setProgress] = useState(initialProgress);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    startTransition(async () => {
      const result = await updateGoalProgressAction(goalId, progress);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        type="number"
        min="0"
        max="100"
        value={progress}
        onChange={(e) => setProgress(Number.parseInt(e.target.value, 10) || 0)}
        className="w-20"
      />
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={handleSave}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
