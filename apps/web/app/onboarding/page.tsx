import Link from "next/link";
import type { Branch, Department } from "@hrm/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { requireAuth } from "@/lib/requireAuth";
import { AddBranchForm, AddDepartmentForm, ImportCsvForm } from "./forms";

const CSV_HEADER =
  "employee_code,first_name,last_name,personal_email,work_email,phone,department_name,designation_title,branch_name,manager_employee_code,employment_type,date_of_joining";

export default async function OnboardingPage() {
  await requireAuth();

  const [departments, branches] = await Promise.all([
    gatewayFetch<Department[]>("/api/v1/departments?pageSize=100"),
    gatewayFetch<Branch[]>("/api/v1/branches?pageSize=100"),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Set up your organization</h1>
        <p className="text-sm text-slate-500">Add your org structure, then bring in your employee roster.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Departments ({departments.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(departments.data ?? []).map((d) => (
            <div key={d.id} className="text-sm text-slate-700">
              {d.name}
            </div>
          ))}
          <AddDepartmentForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Branches ({branches.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(branches.data ?? []).map((b) => (
            <div key={b.id} className="text-sm text-slate-700">
              {b.name}
            </div>
          ))}
          <AddBranchForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Import your employee roster</CardTitle>
          <CardDescription>Optional here — you can also do this later from Employees → Import CSV.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <code className="block overflow-x-auto rounded-md bg-slate-50 p-2 text-xs text-slate-700">{CSV_HEADER}</code>
          <ImportCsvForm />
        </CardContent>
      </Card>

      <Link href="/employees">
        <Button className="w-fit">Finish setup — go to Employees</Button>
      </Link>
    </div>
  );
}
