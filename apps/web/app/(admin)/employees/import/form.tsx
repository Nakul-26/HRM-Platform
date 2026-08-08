"use client";

import { useActionState } from "react";
import { Alert, Button } from "@hrm/ui";
import { importEmployeesAction, type ImportState } from "./actions";

const initialState: ImportState = {};

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importEmployeesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="error">
          <p>{state.error}</p>
          {state.rowErrors && state.rowErrors.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {state.rowErrors.map((row) => (
                <li key={row.row}>
                  Row {row.row}: {row.errors.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {typeof state.imported === "number" && (
        <Alert variant="success">Imported {state.imported} employee(s).</Alert>
      )}
      <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Importing..." : "Import"}
      </Button>
    </form>
  );
}
