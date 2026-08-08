import { notFound } from "next/navigation";
import type { Branch, Department, Designation, Employee } from "@hrm/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { EditEmployeeForm } from "./edit-form";
import { terminateEmployeeAction } from "../actions";

const STATUS_VARIANT = { active: "success", on_leave: "warning", terminated: "destructive" } as const;

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [employeeResult, departments, branches, designations] = await Promise.all([
    gatewayFetch<Employee>(`/api/v1/employees/${id}`),
    gatewayFetch<Department[]>("/api/v1/departments?pageSize=100"),
    gatewayFetch<Branch[]>("/api/v1/branches?pageSize=100"),
    gatewayFetch<Designation[]>("/api/v1/designations?pageSize=100"),
  ]);

  if (employeeResult.status === 404) notFound();
  const employee = employeeResult.data;
  if (!employee) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="text-sm text-slate-500">{employee.employeeCode}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_VARIANT[employee.status]}>{employee.status}</Badge>
          {employee.status !== "terminated" && (
            <form action={terminateEmployeeAction.bind(null, employee.id)}>
              <Button type="submit" variant="destructive" size="sm">
                Terminate
              </Button>
            </form>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <EditEmployeeForm
            employee={employee}
            departments={departments.data ?? []}
            branches={branches.data ?? []}
            designations={designations.data ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
