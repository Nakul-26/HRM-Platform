import Link from "next/link";
import type { Candidate, JobOpening } from "@hrm/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { CreateCandidateForm } from "./create-form";

const STAGE_VARIANT = {
  applied: "default",
  screening: "default",
  interview: "warning",
  offer: "warning",
  hired: "success",
  rejected: "destructive",
} as const;

export default async function CandidatesPage() {
  const [candidatesResult, openingsResult] = await Promise.all([
    gatewayFetch<Candidate[]>("/api/v1/recruitment/candidates?pageSize=200"),
    gatewayFetch<JobOpening[]>("/api/v1/recruitment/job-openings?pageSize=100"),
  ]);

  const candidates = candidatesResult.data ?? [];
  const openings = openingsResult.data ?? [];
  const openingTitle = (id: string) => openings.find((o) => o.id === id)?.title ?? "Unknown";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New candidate</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateCandidateForm jobOpenings={openings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidates ({candidates.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Job opening</TableHeaderCell>
                <TableHeaderCell>Stage</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {candidates.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.fullName}</TableCell>
                  <TableCell>{openingTitle(c.jobOpeningId)}</TableCell>
                  <TableCell>
                    <Badge variant={STAGE_VARIANT[c.pipelineStage]}>{c.pipelineStage}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/recruitment/candidates/${c.id}`} className="text-sm font-medium text-slate-900 underline">
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {candidates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>No candidates yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
