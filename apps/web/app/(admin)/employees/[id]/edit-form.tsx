"use client";

import { useActionState } from "react";
import type { Employee } from "@hrm/types";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { updateEmployeeAction, type EmployeeFormState } from "../actions";

const initialState: EmployeeFormState = {};

export function EditEmployeeForm({
  employee,
  departments,
  branches,
  designations,
}: {
  employee: Employee;
  departments: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  designations: { id: string; title: string }[];
}) {
  const boundAction = updateEmployeeAction.bind(null, employee.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-4">
      {state.error && (
        <div className="col-span-2">
          <Alert variant="error">{state.error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="firstName">First name</Label>
        <Input id="firstName" name="firstName" defaultValue={employee.firstName} required />
      </div>
      <div>
        <Label htmlFor="lastName">Last name</Label>
        <Input id="lastName" name="lastName" defaultValue={employee.lastName} required />
      </div>
      <div>
        <Label htmlFor="workEmail">Work email</Label>
        <Input id="workEmail" name="workEmail" type="email" defaultValue={employee.workEmail ?? ""} />
      </div>
      <div>
        <Label htmlFor="personalEmail">Personal email</Label>
        <Input id="personalEmail" name="personalEmail" type="email" defaultValue={employee.personalEmail ?? ""} />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={employee.phone ?? ""} />
      </div>
      <div>
        <Label htmlFor="departmentId">Department</Label>
        <Select id="departmentId" name="departmentId" defaultValue={employee.departmentId ?? ""}>
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="branchId">Branch</Label>
        <Select id="branchId" name="branchId" defaultValue={employee.branchId ?? ""}>
          <option value="">—</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="designationId">Designation</Label>
        <Select id="designationId" name="designationId" defaultValue={employee.designationId ?? ""}>
          <option value="">—</option>
          {designations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </Select>
      </div>
      <div className="col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
