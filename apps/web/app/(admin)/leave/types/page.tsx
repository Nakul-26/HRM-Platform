import type { LeaveType } from "@hrm/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateLeaveTypeForm } from "./create-form";
import { deleteLeaveTypeAction } from "./actions";

export default async function LeaveTypesPage() {
  const result = await gatewayFetch<LeaveType[]>("/api/v1/leave/types?pageSize=100");
  const leaveTypes = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New leave type</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateLeaveTypeForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leave types ({leaveTypes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Paid</TableHeaderCell>
                <TableHeaderCell>Accrual</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {leaveTypes.map((type) => (
                <TableRow key={type.id}>
                  <TableCell>{type.name}</TableCell>
                  <TableCell>
                    <Badge variant={type.isPaid ? "success" : "default"}>{type.isPaid ? "Paid" : "Unpaid"}</Badge>
                  </TableCell>
                  <TableCell>
                    {type.accrualRule ? `${type.accrualRule.days} day(s) / ${type.accrualRule.per}` : "None"}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={deleteLeaveTypeAction.bind(null, type.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {leaveTypes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>No leave types yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
