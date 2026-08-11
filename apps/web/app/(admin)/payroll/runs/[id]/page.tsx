import { notFound } from "next/navigation";
import type { Employee, PayrollRun, Payslip } from "@hrm/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { ExecuteRunButton } from "./execute-button";

const STATUS_VARIANT = { draft: "default", processing: "warning", completed: "success", failed: "destructive" } as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function PayrollRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [runResult, payslipsResult, employeesResult] = await Promise.all([
    gatewayFetch<PayrollRun>(`/api/v1/payroll/runs/${id}`),
    gatewayFetch<Payslip[]>(`/api/v1/payroll/runs/${id}/payslips`),
    gatewayFetch<Employee[]>("/api/v1/employees?pageSize=200"),
  ]);

  if (runResult.status === 404) notFound();
  const run = runResult.data;
  if (!run) notFound();

  const payslips = payslipsResult.data ?? [];
  const employees = employeesResult.data ?? [];
  const employeeName = (empId: string) => {
    const employee = employees.find((e) => e.id === empId);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {MONTH_NAMES[run.periodMonth - 1]} {run.periodYear}
          </h1>
          <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
        </div>
        <ExecuteRunButton runId={run.id} disabled={run.status === "processing" || run.status === "completed"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payslips ({payslips.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Employee</TableHeaderCell>
                <TableHeaderCell>Gross earnings</TableHeaderCell>
                <TableHeaderCell>Total deductions</TableHeaderCell>
                <TableHeaderCell>Net pay</TableHeaderCell>
                <TableHeaderCell>LOP days</TableHeaderCell>
                <TableHeaderCell>PDF</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payslips.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{employeeName(p.employeeId)}</TableCell>
                  <TableCell>{p.grossEarnings.toFixed(2)}</TableCell>
                  <TableCell>{p.totalDeductions.toFixed(2)}</TableCell>
                  <TableCell className="font-medium">{p.netPay.toFixed(2)}</TableCell>
                  <TableCell>{p.breakdown.lopDays}</TableCell>
                  <TableCell>{p.r2ObjectKey ? "Generated" : "—"}</TableCell>
                </TableRow>
              ))}
              {payslips.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    {run.status === "draft" ? "Not executed yet." : "No payslips were generated for this run."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
