import type { Review, ReviewableEmployee, ReviewCycle } from "@hrm/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateReviewForm } from "./create-form";
import { SubmitReviewButton } from "./submit-button";

export default async function ReviewsPage() {
  const [reviewsResult, cyclesResult, employeesResult] = await Promise.all([
    gatewayFetch<Review[]>("/api/v1/performance/reviews?pageSize=200"),
    gatewayFetch<ReviewCycle[]>("/api/v1/performance/review-cycles?pageSize=100"),
    gatewayFetch<ReviewableEmployee[]>("/api/v1/performance/reviewable-employees"),
  ]);

  const reviews = reviewsResult.data ?? [];
  const cycles = cyclesResult.data ?? [];
  const employees = employeesResult.data ?? [];

  const employeeName = (id: string) => {
    const employee = employees.find((e) => e.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };
  const cycleName = (id: string) => cycles.find((c) => c.id === id)?.name ?? "Unknown";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New review</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateReviewForm employees={employees} cycles={cycles} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reviews ({reviews.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Employee</TableHeaderCell>
                <TableHeaderCell>Cycle</TableHeaderCell>
                <TableHeaderCell>Rating</TableHeaderCell>
                <TableHeaderCell>Comments</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {reviews.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{employeeName(r.employeeId)}</TableCell>
                  <TableCell>{cycleName(r.reviewCycleId)}</TableCell>
                  <TableCell>{r.rating ?? "—"}</TableCell>
                  <TableCell>{r.comments ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "submitted" ? "success" : "warning"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.status === "draft" && <SubmitReviewButton reviewId={r.id} />}</TableCell>
                </TableRow>
              ))}
              {reviews.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No reviews yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
