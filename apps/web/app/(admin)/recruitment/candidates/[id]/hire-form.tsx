"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Branch, Department, Designation, Employee } from "@hrm/types";
import { Alert, Button, Input, Label, Select } from "@hrm/ui";
import { hireAction, type CandidateDetailActionState } from "./actions";

const initialState: CandidateDetailActionState = {};

export function HireForm({
  candidateId,
  suggestedJoiningDate,
  departments,
  designations,
  branches,
  employees,
}: {
  candidateId: string;
  suggestedJoiningDate: string | null;
  departments: Department[];
  designations: Designation[];
  branches: Branch[];
  employees: Employee[];
}) {
  const [state, formAction, pending] = useActionState(hireAction.bind(null, candidateId), initialState);

  if (state.employeeId) {
    return (
      <Alert variant="success">
        Hired.{" "}
        <Link href={`/employees/${state.employeeId}`} className="underline">
          View the new employee record
        </Link>
        .
      </Alert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="employeeCode">Employee code</Label>
          <Input id="employeeCode" name="employeeCode" required />
        </div>
        <div>
          <Label htmlFor="dateOfJoining">Date of joining (defaults to the accepted offer's joining date)</Label>
          <Input id="dateOfJoining" name="dateOfJoining" type="date" defaultValue={suggestedJoiningDate ?? undefined} />
        </div>
        <div>
          <Label htmlFor="departmentId">Department (defaults to the job opening's)</Label>
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
          <Label htmlFor="designationId">Designation (defaults to the accepted offer's)</Label>
          <Select id="designationId" name="designationId" defaultValue="">
            <option value="">—</option>
            {designations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
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
          <Label htmlFor="managerId">Manager</Label>
          <Select id="managerId" name="managerId" defaultValue="">
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Hiring..." : "Hire candidate"}
      </Button>
    </form>
  );
}
