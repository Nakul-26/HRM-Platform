import type { Designation, Promotion, Review, ReviewableEmployee, ReviewCycle } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreatePromotionForm } from "./create-form";

export default async function PromotionsPage() {
  const [promotionsResult, reviewsResult, cyclesResult, employeesResult, designationsResult] = await Promise.all([
    gatewayFetch<Promotion[]>("/api/v1/performance/promotions?pageSize=200"),
    gatewayFetch<Review[]>("/api/v1/performance/reviews?pageSize=200"),
    gatewayFetch<ReviewCycle[]>("/api/v1/performance/review-cycles?pageSize=100"),
    gatewayFetch<ReviewableEmployee[]>("/api/v1/performance/reviewable-employees"),
    gatewayFetch<Designation[]>("/api/v1/designations?pageSize=100"),
  ]);

  const promotions = promotionsResult.data ?? [];
  const reviews = reviewsResult.data ?? [];
  const cycles = cyclesResult.data ?? [];
  const employees = employeesResult.data ?? [];
  const designations = designationsResult.data ?? [];

  const employeeName = (id: string) => {
    const employee = employees.find((e) => e.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };
  const designationTitle = (id: string | null) => designations.find((d) => d.id === id)?.title ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New promotion</CardTitle>
        </CardHeader>
        <CardContent>
          <CreatePromotionForm employees={employees} reviews={reviews} cycles={cycles} designations={designations} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Promotions ({promotions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Employee</TableHeaderCell>
                <TableHeaderCell>Previous designation</TableHeaderCell>
                <TableHeaderCell>New designation</TableHeaderCell>
                <TableHeaderCell>Effective date</TableHeaderCell>
                <TableHeaderCell>Notes</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {promotions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{employeeName(p.employeeId)}</TableCell>
                  <TableCell>{designationTitle(p.previousDesignationId)}</TableCell>
                  <TableCell>{designationTitle(p.newDesignationId)}</TableCell>
                  <TableCell>{p.effectiveDate}</TableCell>
                  <TableCell>{p.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
              {promotions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No promotions recorded yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
