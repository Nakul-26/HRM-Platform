import type { Payslip } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function MyPayrollPage() {
  const result = await gatewayFetch<Payslip[]>("/api/v1/payroll/payslips/me");
  const payslips = result.data ?? [];

  const withDownloadUrls = await Promise.all(
    payslips.map(async (p) => {
      if (!p.r2ObjectKey) return { ...p, downloadUrl: null };
      const download = await gatewayFetch<{ downloadUrl: string }>(`/api/v1/payroll/payslips/${p.id}/download-url`);
      return { ...p, downloadUrl: download.data?.downloadUrl ?? null };
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>My payslips</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Period</TableHeaderCell>
              <TableHeaderCell>Gross earnings</TableHeaderCell>
              <TableHeaderCell>Total deductions</TableHeaderCell>
              <TableHeaderCell>Net pay</TableHeaderCell>
              <TableHeaderCell>LOP days</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {withDownloadUrls.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {MONTH_NAMES[p.periodMonth - 1]} {p.periodYear}
                </TableCell>
                <TableCell>{p.grossEarnings.toFixed(2)}</TableCell>
                <TableCell>{p.totalDeductions.toFixed(2)}</TableCell>
                <TableCell className="font-medium">{p.netPay.toFixed(2)}</TableCell>
                <TableCell>{p.breakdown.lopDays}</TableCell>
                <TableCell className="text-right">
                  {p.downloadUrl ? (
                    <a href={p.downloadUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-900 underline">
                      Download PDF
                    </a>
                  ) : (
                    <span className="text-sm text-slate-400">Not ready</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {withDownloadUrls.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>No payslips yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
