import type { AttendanceCorrection, AttendanceRecord, ShiftTemplate } from "@hrm/types";
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
import { ClockWidget } from "./clock-widget";
import { CorrectionForm } from "./correction-form";
import { cancelCorrectionAction } from "./actions";

const STATUS_VARIANT: Record<AttendanceCorrection["status"], "success" | "warning" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "destructive",
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AttendancePage() {
  const [recordsResult, shiftResult, correctionsResult] = await Promise.all([
    gatewayFetch<AttendanceRecord[]>("/api/v1/attendance/records/me"),
    gatewayFetch<{ shiftTemplate: ShiftTemplate | null }>("/api/v1/attendance/shift-assignments/me"),
    gatewayFetch<AttendanceCorrection[]>("/api/v1/attendance/corrections?pageSize=100"),
  ]);

  const records = recordsResult.data ?? [];
  const shiftTemplate = shiftResult.data?.shiftTemplate ?? null;
  const corrections = correctionsResult.data ?? [];
  const today = todayDateString();
  const todayRecord = records.find((r) => r.workDate === today) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
        </CardHeader>
        <CardContent>
          <ClockWidget todayRecord={todayRecord} shiftTemplate={shiftTemplate} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent attendance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Clock in</TableHeaderCell>
                <TableHeaderCell>Clock out</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Late (min)</TableHeaderCell>
                <TableHeaderCell>Overtime (min)</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...records].reverse().map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.workDate}</TableCell>
                  <TableCell>{r.clockIn ? new Date(r.clockIn).toISOString().slice(11, 16) : "—"}</TableCell>
                  <TableCell>{r.clockOut ? new Date(r.clockOut).toISOString().slice(11, 16) : "—"}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>{r.lateMinutes}</TableCell>
                  <TableCell>{r.overtimeMinutes}</TableCell>
                </TableRow>
              ))}
              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No attendance records yet this month.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request a correction</CardTitle>
        </CardHeader>
        <CardContent>
          <CorrectionForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My correction requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Reason</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {corrections.map((corr) => (
                <TableRow key={corr.id}>
                  <TableCell>{corr.workDate}</TableCell>
                  <TableCell>{corr.reason ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[corr.status]}>{corr.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {corr.status === "pending" && (
                      <form action={cancelCorrectionAction.bind(null, corr.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Cancel
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {corrections.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>No correction requests yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
