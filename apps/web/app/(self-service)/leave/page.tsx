import type { LeaveBalance, LeaveRequest, LeaveType } from "@hrm/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { RequestLeaveForm } from "./request-form";
import { cancelLeaveAction } from "./actions";

const STATUS_VARIANT: Record<LeaveRequest["status"], "success" | "warning" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "destructive",
};

export default async function LeavePage() {
  const [balancesResult, typesResult, requestsResult] = await Promise.all([
    gatewayFetch<LeaveBalance[]>("/api/v1/leave/balances/me"),
    gatewayFetch<LeaveType[]>("/api/v1/leave/types?pageSize=100"),
    gatewayFetch<LeaveRequest[]>("/api/v1/leave/requests?pageSize=100"),
  ]);

  const balances = balancesResult.data ?? [];
  const types = typesResult.data ?? [];
  const requests = requestsResult.data ?? [];
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "Unknown";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>My leave balances</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Leave type</TableHeaderCell>
                <TableHeaderCell>Entitled</TableHeaderCell>
                <TableHeaderCell>Used</TableHeaderCell>
                <TableHeaderCell>Carried forward</TableHeaderCell>
                <TableHeaderCell>Available</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {balances.map((b) => (
                <TableRow key={`${b.leaveTypeId}-${b.year}`}>
                  <TableCell>{typeName(b.leaveTypeId)}</TableCell>
                  <TableCell>{b.entitled}</TableCell>
                  <TableCell>{b.used}</TableCell>
                  <TableCell>{b.carriedForward}</TableCell>
                  <TableCell>{(b.entitled + b.carriedForward - b.used).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {balances.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No leave balance yet — check back after the next accrual run.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apply for leave</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestLeaveForm leaveTypes={types} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Leave type</TableHeaderCell>
                <TableHeaderCell>Dates</TableHeaderCell>
                <TableHeaderCell>Days</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{typeName(r.leaveTypeId)}</TableCell>
                  <TableCell>
                    {r.startDate} to {r.endDate}
                  </TableCell>
                  <TableCell>{r.days}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" && (
                      <form action={cancelLeaveAction.bind(null, r.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Cancel
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No leave requests yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
