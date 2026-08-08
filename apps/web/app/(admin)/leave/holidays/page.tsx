import type { Holiday } from "@hrm/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateHolidayForm } from "./create-form";
import { deleteHolidayAction } from "./actions";

export default async function HolidaysPage() {
  const result = await gatewayFetch<Holiday[]>("/api/v1/leave/holidays?pageSize=100");
  const holidays = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New holiday</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateHolidayForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Holiday calendar ({holidays.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {holidays.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell>{holiday.name}</TableCell>
                  <TableCell>{holiday.date}</TableCell>
                  <TableCell className="text-right">
                    <form action={deleteHolidayAction.bind(null, holiday.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {holidays.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>No holidays added yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
