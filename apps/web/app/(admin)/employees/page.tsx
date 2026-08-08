import Link from "next/link";
import type { Employee } from "@hrm/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";

const STATUS_VARIANT = { active: "success", on_leave: "warning", terminated: "destructive" } as const;

export default async function EmployeesPage() {
  const result = await gatewayFetch<Employee[]>("/api/v1/employees?pageSize=100");
  const employees = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Employees</h1>
        <Link href="/employees/new">
          <Button>New employee</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All employees ({employees.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Work email</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>{emp.employeeCode}</TableCell>
                  <TableCell>
                    <Link href={`/employees/${emp.id}`} className="font-medium text-slate-900 hover:underline">
                      {emp.firstName} {emp.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{emp.workEmail ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[emp.status]}>{emp.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>No employees yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
