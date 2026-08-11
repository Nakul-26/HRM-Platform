import type { PayComponentType } from "@hrm/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreatePayComponentTypeForm } from "./create-form";
import { deletePayComponentTypeAction } from "./actions";

export default async function PayComponentTypesPage() {
  const result = await gatewayFetch<PayComponentType[]>("/api/v1/payroll/component-types?pageSize=100");
  const componentTypes = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New pay component type</CardTitle>
        </CardHeader>
        <CardContent>
          <CreatePayComponentTypeForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pay component types ({componentTypes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Calculation</TableHeaderCell>
                <TableHeaderCell>Taxable</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {componentTypes.map((type) => (
                <TableRow key={type.id}>
                  <TableCell>{type.code}</TableCell>
                  <TableCell>{type.name}</TableCell>
                  <TableCell>
                    <Badge variant={type.category === "earning" ? "success" : "default"}>{type.category}</Badge>
                  </TableCell>
                  <TableCell>{type.calculationType === "percentage_of_basic" ? "% of basic" : "Fixed amount"}</TableCell>
                  <TableCell>{type.isTaxable ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right">
                    <form action={deletePayComponentTypeAction.bind(null, type.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {componentTypes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No pay component types yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
