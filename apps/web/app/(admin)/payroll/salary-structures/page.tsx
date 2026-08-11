import type { Employee, PayComponentType, SalaryStructure } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateSalaryStructureForm } from "./create-form";

export default async function SalaryStructuresPage() {
  const [structuresResult, employeesResult, componentTypesResult] = await Promise.all([
    gatewayFetch<SalaryStructure[]>("/api/v1/payroll/salary-structures?pageSize=200"),
    gatewayFetch<Employee[]>("/api/v1/employees?pageSize=200"),
    gatewayFetch<PayComponentType[]>("/api/v1/payroll/component-types?pageSize=100"),
  ]);

  const structures = structuresResult.data ?? [];
  const employees = employeesResult.data ?? [];
  const componentTypes = componentTypesResult.data ?? [];

  const employeeName = (id: string) => {
    const employee = employees.find((e) => e.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New salary structure</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateSalaryStructureForm employees={employees} componentTypes={componentTypes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salary structures ({structures.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Employee</TableHeaderCell>
                <TableHeaderCell>Effective from</TableHeaderCell>
                <TableHeaderCell>Components</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {structures.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{employeeName(s.employeeId)}</TableCell>
                  <TableCell>{s.effectiveFrom}</TableCell>
                  <TableCell>
                    {s.components.map((c) => `${c.code}: ${c.amount}`).join(", ")}
                  </TableCell>
                </TableRow>
              ))}
              {structures.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>No salary structures yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
