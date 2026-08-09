import type { ShiftTemplate } from "@hrm/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateShiftTemplateForm } from "./create-form";
import { deleteShiftTemplateAction } from "./actions";

export default async function ShiftTemplatesPage() {
  const result = await gatewayFetch<ShiftTemplate[]>("/api/v1/attendance/shifts?pageSize=100");
  const shifts = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New shift template</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateShiftTemplateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shift templates ({shifts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Hours</TableHeaderCell>
                <TableHeaderCell>Night shift</TableHeaderCell>
                <TableHeaderCell>Grace (min)</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>{shift.name}</TableCell>
                  <TableCell>
                    {shift.startTime}–{shift.endTime}
                  </TableCell>
                  <TableCell>
                    <Badge variant={shift.isNightShift ? "warning" : "default"}>{shift.isNightShift ? "Yes" : "No"}</Badge>
                  </TableCell>
                  <TableCell>{shift.graceMinutes}</TableCell>
                  <TableCell className="text-right">
                    <form action={deleteShiftTemplateAction.bind(null, shift.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {shifts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No shift templates yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
