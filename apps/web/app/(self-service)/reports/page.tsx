import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { requireAuth, hasPermission } from "@/lib/requireAuth";
import { gatewayFetch } from "@/lib/gateway";
import { ExportCsvButton } from "@/components/export-csv-button";
import { exportAttendanceSummaryAction, exportHeadcountAction, exportLeaveSummaryAction, exportPayrollSummaryAction } from "./actions";

interface HeadcountReport {
  totalActive: number;
  totalInactive: number;
  byDepartment: { key: string; count: number }[];
  byDesignation: { key: string; count: number }[];
  byBranch: { key: string; count: number }[];
  byEmploymentType: { key: string; count: number }[];
}

interface AttendanceSummaryRow {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  onLeaveDays: number;
  lateDays: number;
}

interface LeaveSummaryRow {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  leaveTypeName: string;
  entitled: string;
  used: string;
  carriedForward: string;
  takenInPeriod: string;
}

interface PayrollSummaryRow {
  payrollRunId: string;
  periodMonth: number;
  periodYear: number;
  status: string;
  headcountPaid: number;
  grossEarnings: string;
  totalDeductions: string;
  netPay: string;
}

export default async function ReportsPage() {
  const auth = await requireAuth();
  const canViewReports = hasPermission(auth, "reporting.view") || hasPermission(auth, "reporting.view_all");
  const canViewPayroll = hasPermission(auth, "reporting.view_all");

  if (!canViewReports) {
    return (
      <Card>
        <CardContent>You do not have permission to view reports.</CardContent>
      </Card>
    );
  }

  const [headcountResult, attendanceResult, leaveResult, payrollResult] = await Promise.all([
    gatewayFetch<HeadcountReport>("/api/v1/reporting/headcount"),
    gatewayFetch<AttendanceSummaryRow[]>("/api/v1/reporting/attendance-summary"),
    gatewayFetch<LeaveSummaryRow[]>("/api/v1/reporting/leave-summary"),
    canViewPayroll ? gatewayFetch<PayrollSummaryRow[]>("/api/v1/reporting/payroll-summary") : Promise.resolve(null),
  ]);

  const headcount = headcountResult.data;
  const attendanceRows = attendanceResult.data ?? [];
  const leaveRows = leaveResult.data ?? [];
  const payrollRows = payrollResult?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Headcount</CardTitle>
          <ExportCsvButton action={exportHeadcountAction} filename="headcount.csv" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {headcount && (
            <div className="flex gap-6 text-sm">
              <div>
                <span className="font-semibold">{headcount.totalActive}</span> active
              </div>
              <div>
                <span className="font-semibold">{headcount.totalInactive}</span> inactive
              </div>
            </div>
          )}
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Department</TableHeaderCell>
                <TableHeaderCell>Count</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(headcount?.byDepartment ?? []).map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.key}</TableCell>
                  <TableCell>{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Attendance summary (current month to date)</CardTitle>
          <ExportCsvButton action={exportAttendanceSummaryAction.bind(null, "")} filename="attendance-summary.csv" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Employee</TableHeaderCell>
                <TableHeaderCell>Present</TableHeaderCell>
                <TableHeaderCell>Absent</TableHeaderCell>
                <TableHeaderCell>Half day</TableHeaderCell>
                <TableHeaderCell>On leave</TableHeaderCell>
                <TableHeaderCell>Late</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attendanceRows.map((row) => (
                <TableRow key={row.employeeId}>
                  <TableCell>
                    {row.firstName} {row.lastName} ({row.employeeCode})
                  </TableCell>
                  <TableCell>{row.presentDays}</TableCell>
                  <TableCell>{row.absentDays}</TableCell>
                  <TableCell>{row.halfDays}</TableCell>
                  <TableCell>{row.onLeaveDays}</TableCell>
                  <TableCell>{row.lateDays}</TableCell>
                </TableRow>
              ))}
              {attendanceRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No attendance records in this period.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Leave summary (current year)</CardTitle>
          <ExportCsvButton action={exportLeaveSummaryAction.bind(null, "")} filename="leave-summary.csv" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Employee</TableHeaderCell>
                <TableHeaderCell>Leave type</TableHeaderCell>
                <TableHeaderCell>Entitled</TableHeaderCell>
                <TableHeaderCell>Used YTD</TableHeaderCell>
                <TableHeaderCell>Carried forward</TableHeaderCell>
                <TableHeaderCell>Taken in period</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leaveRows.map((row) => (
                <TableRow key={`${row.employeeId}-${row.leaveTypeName}`}>
                  <TableCell>
                    {row.firstName} {row.lastName} ({row.employeeCode})
                  </TableCell>
                  <TableCell>{row.leaveTypeName}</TableCell>
                  <TableCell>{row.entitled}</TableCell>
                  <TableCell>{row.used}</TableCell>
                  <TableCell>{row.carriedForward}</TableCell>
                  <TableCell>{row.takenInPeriod}</TableCell>
                </TableRow>
              ))}
              {leaveRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No leave balances found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canViewPayroll && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Payroll summary</CardTitle>
            <ExportCsvButton action={exportPayrollSummaryAction} filename="payroll-summary.csv" />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Period</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Headcount paid</TableHeaderCell>
                  <TableHeaderCell>Gross earnings</TableHeaderCell>
                  <TableHeaderCell>Total deductions</TableHeaderCell>
                  <TableHeaderCell>Net pay</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payrollRows.map((row) => (
                  <TableRow key={row.payrollRunId}>
                    <TableCell>
                      {row.periodMonth}/{row.periodYear}
                    </TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.headcountPaid}</TableCell>
                    <TableCell>{row.grossEarnings}</TableCell>
                    <TableCell>{row.totalDeductions}</TableCell>
                    <TableCell>{row.netPay}</TableCell>
                  </TableRow>
                ))}
                {payrollRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>No payroll runs found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
