import { Card, CardContent, CardHeader, CardTitle, Input, Label, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { ExportCsvButton } from "@/components/export-csv-button";
import { exportAuditLogAction } from "./actions";

interface AuditLogRow {
  id: string;
  occurredAt: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.action) query.set("action", params.action);
  if (params.resourceType) query.set("resourceType", params.resourceType);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  query.set("pageSize", "100");
  const queryString = `?${query.toString()}`;

  const result = await gatewayFetch<AuditLogRow[]>(`/api/v1/reporting/audit-log${queryString}`);
  const rows = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Filter audit log</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-5 items-end gap-4" method="get">
            <div>
              <Label htmlFor="action">Action</Label>
              <Input id="action" name="action" defaultValue={params.action ?? ""} placeholder="e.g. employee.updated" />
            </div>
            <div>
              <Label htmlFor="resourceType">Resource type</Label>
              <Input id="resourceType" name="resourceType" defaultValue={params.resourceType ?? ""} placeholder="e.g. employee" />
            </div>
            <div>
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} />
            </div>
            <div>
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} />
            </div>
            <button type="submit" className="h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
              Filter
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Audit log ({rows.length})</CardTitle>
          <ExportCsvButton action={exportAuditLogAction.bind(null, queryString)} filename="audit-log.csv" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Occurred at</TableHeaderCell>
                <TableHeaderCell>Actor</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
                <TableHeaderCell>Resource type</TableHeaderCell>
                <TableHeaderCell>Resource ID</TableHeaderCell>
                <TableHeaderCell>IP</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{new Date(row.occurredAt).toLocaleString()}</TableCell>
                  <TableCell>{row.actorId ?? "—"}</TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>{row.resourceType}</TableCell>
                  <TableCell>{row.resourceId ?? "—"}</TableCell>
                  <TableCell>{row.ipAddress ?? "—"}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No audit log entries match this filter.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
