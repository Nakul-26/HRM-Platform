import type { Branch } from "@hrm/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateBranchForm } from "./create-form";
import { deleteBranchAction } from "./actions";

export default async function BranchesPage() {
  const result = await gatewayFetch<Branch[]>("/api/v1/branches?pageSize=100");
  const branches = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New branch</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateBranchForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branches ({branches.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Timezone</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell>{branch.name}</TableCell>
                  <TableCell>{branch.timezone}</TableCell>
                  <TableCell className="text-right">
                    <form action={deleteBranchAction.bind(null, branch.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {branches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>No branches yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
