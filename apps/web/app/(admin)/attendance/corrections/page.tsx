import type { AttendanceCorrection, Employee } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { ApprovalActions } from "./approval-actions";

export default async function AttendanceCorrectionsPage() {
  const [correctionsResult, employeesResult] = await Promise.all([
    gatewayFetch<AttendanceCorrection[]>("/api/v1/attendance/corrections?status=pending&pageSize=100"),
    gatewayFetch<Employee[]>("/api/v1/employees?pageSize=200"),
  ]);

  const corrections = correctionsResult.data ?? [];
  const employees = employeesResult.data ?? [];

  const employeeName = (id: string) => {
    const employee = employees.find((e) => e.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending attendance corrections ({corrections.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Employee</TableHeaderCell>
              <TableHeaderCell>Date</TableHeaderCell>
              <TableHeaderCell>Requested clock-in</TableHeaderCell>
              <TableHeaderCell>Requested clock-out</TableHeaderCell>
              <TableHeaderCell>Requested status</TableHeaderCell>
              <TableHeaderCell>Reason</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {corrections.map((corr) => (
              <TableRow key={corr.id}>
                <TableCell>{employeeName(corr.employeeId)}</TableCell>
                <TableCell>{corr.workDate}</TableCell>
                <TableCell>{corr.requestedClockIn ? new Date(corr.requestedClockIn).toISOString().slice(11, 16) : "—"}</TableCell>
                <TableCell>{corr.requestedClockOut ? new Date(corr.requestedClockOut).toISOString().slice(11, 16) : "—"}</TableCell>
                <TableCell>{corr.requestedStatus ?? "—"}</TableCell>
                <TableCell>{corr.reason ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <ApprovalActions requestId={corr.id} />
                </TableCell>
              </TableRow>
            ))}
            {corrections.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>No pending correction requests.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
