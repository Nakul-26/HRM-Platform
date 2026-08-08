"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { createEmployeeAction, type EmployeeFormState } from "../actions";

const initialState: EmployeeFormState = {};

export function NewEmployeeForm({
  departments,
  branches,
  designations,
}: {
  departments: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  designations: { id: string; title: string }[];
}) {
  const [state, formAction, pending] = useActionState(createEmployeeAction, initialState);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-4">
      {state.error && (
        <div className="col-span-2">
          <Alert variant="error">{state.error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="employeeCode">Employee code</Label>
        <Input id="employeeCode" name="employeeCode" required />
      </div>
      <div>
        <Label htmlFor="dateOfJoining">Date of joining</Label>
        <Input id="dateOfJoining" name="dateOfJoining" type="date" required />
      </div>
      <div>
        <Label htmlFor="firstName">First name</Label>
        <Input id="firstName" name="firstName" required />
      </div>
      <div>
        <Label htmlFor="lastName">Last name</Label>
        <Input id="lastName" name="lastName" required />
      </div>
      <div>
        <Label htmlFor="workEmail">Work email</Label>
        <Input id="workEmail" name="workEmail" type="email" />
      </div>
      <div>
        <Label htmlFor="personalEmail">Personal email</Label>
        <Input id="personalEmail" name="personalEmail" type="email" />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" />
      </div>
      <div>
        <Label htmlFor="employmentType">Employment type</Label>
        <Select id="employmentType" name="employmentType" defaultValue="full_time">
          <option value="full_time">Full-time</option>
          <option value="part_time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="intern">Intern</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="departmentId">Department</Label>
        <Select id="departmentId" name="departmentId" defaultValue="">
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
        <Select id="branchId" name="branchId" defaultValue="">
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
        <Select id="designationId" name="designationId" defaultValue="">
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
          {pending ? "Creating..." : "Create employee"}
        </Button>
      </div>
    </form>
  );
}
