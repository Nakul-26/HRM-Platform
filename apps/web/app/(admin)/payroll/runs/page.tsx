import Link from "next/link";
import type { PayrollRun } from "@hrm/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreatePayrollRunForm } from "./create-form";

const STATUS_VARIANT = { draft: "default", processing: "warning", completed: "success", failed: "destructive" } as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function PayrollRunsPage() {
  const result = await gatewayFetch<PayrollRun[]>("/api/v1/payroll/runs?pageSize=100&sort=-period_year");
  const runs = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New payroll run</CardTitle>
        </CardHeader>
        <CardContent>
          <CreatePayrollRunForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payroll runs ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Period</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Processed at</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    {MONTH_NAMES[run.periodMonth - 1]} {run.periodYear}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                  </TableCell>
                  <TableCell>{run.processedAt ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/payroll/runs/${run.id}`} className="text-sm font-medium text-slate-900 underline">
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>No payroll runs yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
