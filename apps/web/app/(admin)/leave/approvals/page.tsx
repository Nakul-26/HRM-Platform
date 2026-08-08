import type { Employee, LeaveRequest, LeaveType } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { ApprovalActions } from "./approval-actions";

export default async function LeaveApprovalsPage() {
  const [requestsResult, employeesResult, typesResult] = await Promise.all([
    gatewayFetch<LeaveRequest[]>("/api/v1/leave/requests?status=pending&pageSize=100"),
    gatewayFetch<Employee[]>("/api/v1/employees?pageSize=200"),
    gatewayFetch<LeaveType[]>("/api/v1/leave/types?pageSize=100"),
  ]);

  const requests = requestsResult.data ?? [];
  const employees = employeesResult.data ?? [];
  const types = typesResult.data ?? [];

  const employeeName = (id: string) => {
    const employee = employees.find((e) => e.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "Unknown";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending leave requests ({requests.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Employee</TableHeaderCell>
              <TableHeaderCell>Leave type</TableHeaderCell>
              <TableHeaderCell>Dates</TableHeaderCell>
              <TableHeaderCell>Days</TableHeaderCell>
              <TableHeaderCell>Reason</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{employeeName(r.employeeId)}</TableCell>
                <TableCell>{typeName(r.leaveTypeId)}</TableCell>
                <TableCell>
                  {r.startDate} to {r.endDate}
                </TableCell>
                <TableCell>{r.days}</TableCell>
                <TableCell>{r.reason ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <ApprovalActions requestId={r.id} />
                </TableCell>
              </TableRow>
            ))}
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>No pending leave requests.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
