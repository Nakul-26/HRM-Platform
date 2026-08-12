import Link from "next/link";
import type { Interview } from "@hrm/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";

const STATUS_VARIANT = { scheduled: "warning", completed: "success", cancelled: "default" } as const;

export default async function MyInterviewsPage() {
  const result = await gatewayFetch<Interview[]>("/api/v1/recruitment/interviews/me");
  const interviews = result.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>My interviews</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Scheduled at</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Rating</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {interviews.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{new Date(i.scheduledAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[i.status]}>{i.status}</Badge>
                </TableCell>
                <TableCell>{i.rating ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/interviews/${i.id}`} className="text-sm font-medium text-slate-900 underline">
                    {i.status === "scheduled" ? "Record feedback" : "View"}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {interviews.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>You have no interviews assigned.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
