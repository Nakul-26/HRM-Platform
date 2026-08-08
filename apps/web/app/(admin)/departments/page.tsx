import type { Department } from "@hrm/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateDepartmentForm } from "./create-form";
import { deleteDepartmentAction } from "./actions";

export default async function DepartmentsPage() {
  const result = await gatewayFetch<Department[]>("/api/v1/departments?pageSize=100");
  const departments = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New department</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateDepartmentForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Departments ({departments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {departments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell>{dept.name}</TableCell>
                  <TableCell className="text-right">
                    <form action={deleteDepartmentAction.bind(null, dept.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {departments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2}>No departments yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
