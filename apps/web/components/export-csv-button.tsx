"use client";

import { useState, useTransition } from "react";
import { Button } from "@hrm/ui";

/** Downloads a CSV export: the server action fetches the file (bearer-token auth happens server-side), the browser just saves the returned text as a file. */
export function ExportCsvButton({
  action,
  filename,
  label = "Export CSV",
}: {
  action: () => Promise<{ ok: boolean; csv?: string; error?: string }>;
  filename: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok || result.csv === undefined) {
        setError(result.error ?? "Export failed.");
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Exporting..." : label}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
