import type { Employee } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";

type DirectoryEntry = Pick<Employee, "id" | "firstName" | "lastName" | "workEmail" | "phone" | "status">;

export default async function DirectoryPage() {
  const result = await gatewayFetch<DirectoryEntry[]>("/api/v1/employees/directory?pageSize=100");
  const entries = result.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Org directory ({entries.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Work email</TableHeaderCell>
              <TableHeaderCell>Phone</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  {entry.firstName} {entry.lastName}
                </TableCell>
                <TableCell>{entry.workEmail ?? "—"}</TableCell>
                <TableCell>{entry.phone ?? "—"}</TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>No coworkers to show yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
