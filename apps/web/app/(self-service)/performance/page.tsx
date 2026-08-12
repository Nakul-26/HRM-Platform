import type { Goal, Promotion, Review, ReviewCycle } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { GoalCreateForm } from "./goal-create-form";
import { ProgressInput } from "./progress-input";

export default async function MyPerformancePage() {
  const [goalsResult, reviewsResult, promotionsResult, cyclesResult] = await Promise.all([
    gatewayFetch<Goal[]>("/api/v1/performance/goals/me"),
    gatewayFetch<Review[]>("/api/v1/performance/reviews/me"),
    gatewayFetch<Promotion[]>("/api/v1/performance/promotions?pageSize=100"),
    gatewayFetch<ReviewCycle[]>("/api/v1/performance/review-cycles?pageSize=100"),
  ]);

  const goals = goalsResult.data ?? [];
  const reviews = reviewsResult.data ?? [];
  const promotions = promotionsResult.data ?? [];
  const cycles = cyclesResult.data ?? [];
  const cycleName = (id: string | null) => cycles.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>My goals</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <GoalCreateForm cycles={cycles} />
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Cycle</TableHeaderCell>
                <TableHeaderCell>Weight</TableHeaderCell>
                <TableHeaderCell>Progress</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {goals.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>{g.title}</TableCell>
                  <TableCell>{cycleName(g.reviewCycleId)}</TableCell>
                  <TableCell>{g.weight ?? "—"}</TableCell>
                  <TableCell>
                    <ProgressInput goalId={g.id} initialProgress={g.progress} />
                  </TableCell>
                </TableRow>
              ))}
              {goals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>No goals yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Cycle</TableHeaderCell>
                <TableHeaderCell>Rating</TableHeaderCell>
                <TableHeaderCell>Comments</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reviews.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{cycleName(r.reviewCycleId)}</TableCell>
                  <TableCell>{r.rating ?? "—"}</TableCell>
                  <TableCell>{r.comments ?? "—"}</TableCell>
                </TableRow>
              ))}
              {reviews.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>No submitted reviews yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My promotions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Effective date</TableHeaderCell>
                <TableHeaderCell>Notes</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {promotions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.effectiveDate}</TableCell>
                  <TableCell>{p.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
              {promotions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2}>No promotions yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
