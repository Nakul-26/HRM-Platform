"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@hrm/ui";
import { addBranchAction, addDepartmentAction, importCsvAction, type OnboardingActionState } from "./actions";

const initialState: OnboardingActionState = {};

export function AddDepartmentForm() {
  const [state, formAction, pending] = useActionState(addDepartmentAction, initialState);
  return (
    <form action={formAction} className="flex items-end gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Input name="name" placeholder="e.g. Engineering" required className="flex-1" />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </Button>
    </form>
  );
}

export function AddBranchForm() {
  const [state, formAction, pending] = useActionState(addBranchAction, initialState);
  return (
    <form action={formAction} className="flex items-end gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Input name="name" placeholder="e.g. Bangalore HQ" required className="flex-1" />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </Button>
    </form>
  );
}

export function ImportCsvForm() {
  const [state, formAction, pending] = useActionState(importCsvAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
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
      {typeof state.imported === "number" && <Alert variant="success">Imported {state.imported} employee(s).</Alert>}
      <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Importing..." : "Import employees"}
      </Button>
    </form>
  );
}
