import type { Department, JobOpening } from "@hrm/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateJobOpeningForm } from "./create-form";

const STATUS_VARIANT = { open: "success", on_hold: "warning", closed: "default" } as const;

export default async function JobOpeningsPage() {
  const [openingsResult, departmentsResult] = await Promise.all([
    gatewayFetch<JobOpening[]>("/api/v1/recruitment/job-openings?pageSize=100"),
    gatewayFetch<Department[]>("/api/v1/departments?pageSize=100"),
  ]);

  const openings = openingsResult.data ?? [];
  const departments = departmentsResult.data ?? [];
  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New job opening</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateJobOpeningForm departments={departments} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job openings ({openings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Department</TableHeaderCell>
                <TableHeaderCell>Employment type</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {openings.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.title}</TableCell>
                  <TableCell>{departmentName(o.departmentId)}</TableCell>
                  <TableCell>{o.employmentType}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[o.status]}>{o.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {openings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>No job openings yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
