import type { Employee, ShiftAssignment, ShiftTemplate } from "@hrm/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateShiftAssignmentForm } from "./create-form";
import { deleteShiftAssignmentAction } from "./actions";

export default async function ShiftAssignmentsPage() {
  const [assignmentsResult, employeesResult, shiftsResult] = await Promise.all([
    gatewayFetch<ShiftAssignment[]>("/api/v1/attendance/shift-assignments?pageSize=200"),
    gatewayFetch<Employee[]>("/api/v1/employees?pageSize=200"),
    gatewayFetch<ShiftTemplate[]>("/api/v1/attendance/shifts?pageSize=100"),
  ]);

  const assignments = assignmentsResult.data ?? [];
  const employees = employeesResult.data ?? [];
  const shiftTemplates = shiftsResult.data ?? [];

  const employeeName = (id: string) => {
    const employee = employees.find((e) => e.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };
  const shiftName = (id: string) => shiftTemplates.find((s) => s.id === id)?.name ?? "Unknown";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New shift assignment</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateShiftAssignmentForm employees={employees} shiftTemplates={shiftTemplates} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shift assignments ({assignments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Employee</TableHeaderCell>
                <TableHeaderCell>Shift</TableHeaderCell>
                <TableHeaderCell>Effective from</TableHeaderCell>
                <TableHeaderCell>Effective to</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{employeeName(a.employeeId)}</TableCell>
                  <TableCell>{shiftName(a.shiftTemplateId)}</TableCell>
                  <TableCell>{a.effectiveFrom}</TableCell>
                  <TableCell>{a.effectiveTo ?? "Ongoing"}</TableCell>
                  <TableCell className="text-right">
                    <form action={deleteShiftAssignmentAction.bind(null, a.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {assignments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No shift assignments yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
