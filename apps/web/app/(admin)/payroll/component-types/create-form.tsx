"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { createPayComponentTypeAction, type PayComponentTypeActionState } from "./actions";

const initialState: PayComponentTypeActionState = {};

export function CreatePayComponentTypeForm() {
  const [state, formAction, pending] = useActionState(createPayComponentTypeAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" placeholder="e.g. hra" required />
        </div>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="e.g. House Rent Allowance" required />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Select id="category" name="category" defaultValue="earning">
            <option value="earning">Earning</option>
            <option value="deduction">Deduction</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="calculationType">Calculation</Label>
          <Select id="calculationType" name="calculationType" defaultValue="fixed">
            <option value="fixed">Fixed amount</option>
            <option value="percentage_of_basic">% of basic</option>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input id="isTaxable" name="isTaxable" type="checkbox" defaultChecked className="h-4 w-4" />
          <Label htmlFor="isTaxable">Taxable</Label>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Adding..." : "Add component type"}
      </Button>
    </form>
  );
}
