import type { Designation } from "@hrm/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateDesignationForm } from "./create-form";
import { deleteDesignationAction } from "./actions";

export default async function DesignationsPage() {
  const result = await gatewayFetch<Designation[]>("/api/v1/designations?pageSize=100");
  const designations = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New designation</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateDesignationForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Designations ({designations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Grade</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {designations.map((designation) => (
                <TableRow key={designation.id}>
                  <TableCell>{designation.title}</TableCell>
                  <TableCell>{designation.grade ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <form action={deleteDesignationAction.bind(null, designation.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {designations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>No designations yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
