"use client";

import { useActionState } from "react";
import type { PayrollTaxConfig } from "@hrm/types";
import { Alert, Button, Input, Label, Textarea } from "@hrm/ui";
import { updateTaxConfigAction, type TaxConfigActionState } from "./actions";

const initialState: TaxConfigActionState = {};

export function EditTaxConfigForm({ config }: { config: PayrollTaxConfig }) {
  const [state, formAction, pending] = useActionState(updateTaxConfigAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pfEmployeeRate">PF — employee rate</Label>
          <Input id="pfEmployeeRate" name="pfEmployeeRate" type="number" step="0.0001" defaultValue={config.pfEmployeeRate} />
        </div>
        <div>
          <Label htmlFor="pfEmployerRate">PF — employer rate</Label>
          <Input id="pfEmployerRate" name="pfEmployerRate" type="number" step="0.0001" defaultValue={config.pfEmployerRate} />
        </div>
        <div>
          <Label htmlFor="pfWageCeiling">PF wage ceiling (blank = full basic)</Label>
          <Input id="pfWageCeiling" name="pfWageCeiling" type="number" step="0.01" defaultValue={config.pfWageCeiling ?? ""} />
        </div>
        <div>
          <Label htmlFor="esiEmployeeRate">ESI — employee rate</Label>
          <Input id="esiEmployeeRate" name="esiEmployeeRate" type="number" step="0.0001" defaultValue={config.esiEmployeeRate} />
        </div>
        <div>
          <Label htmlFor="esiEmployerRate">ESI — employer rate</Label>
          <Input id="esiEmployerRate" name="esiEmployerRate" type="number" step="0.0001" defaultValue={config.esiEmployerRate} />
        </div>
        <div>
          <Label htmlFor="esiWageThreshold">ESI wage threshold</Label>
          <Input id="esiWageThreshold" name="esiWageThreshold" type="number" step="0.01" defaultValue={config.esiWageThreshold} />
        </div>
        <div>
          <Label htmlFor="standardDeduction">Standard deduction (annual)</Label>
          <Input id="standardDeduction" name="standardDeduction" type="number" step="0.01" defaultValue={config.standardDeduction} />
        </div>
        <div>
          <Label htmlFor="cessRate">Cess rate</Label>
          <Input id="cessRate" name="cessRate" type="number" step="0.0001" defaultValue={config.cessRate} />
        </div>
      </div>
      <div>
        <Label htmlFor="taxSlabs">Income tax slabs (JSON — annual amounts, upTo: null for the top slab)</Label>
        <Textarea id="taxSlabs" name="taxSlabs" rows={6} defaultValue={JSON.stringify(config.taxSlabs, null, 2)} />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : "Save tax configuration"}
      </Button>
    </form>
  );
}
