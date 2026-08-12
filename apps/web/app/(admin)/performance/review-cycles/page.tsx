import type { ReviewCycle } from "@hrm/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateReviewCycleForm } from "./create-form";
import { CloseCycleButton } from "./close-button";

export default async function ReviewCyclesPage() {
  const result = await gatewayFetch<ReviewCycle[]>("/api/v1/performance/review-cycles?pageSize=100");
  const cycles = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New review cycle</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateReviewCycleForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review cycles ({cycles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Start</TableHeaderCell>
                <TableHeaderCell>End</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {cycles.map((cycle) => (
                <TableRow key={cycle.id}>
                  <TableCell>{cycle.name}</TableCell>
                  <TableCell>{cycle.startDate}</TableCell>
                  <TableCell>{cycle.endDate}</TableCell>
                  <TableCell>
                    <Badge variant={cycle.status === "open" ? "success" : "default"}>{cycle.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {cycle.status === "open" && <CloseCycleButton cycleId={cycle.id} />}
                  </TableCell>
                </TableRow>
              ))}
              {cycles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No review cycles yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
