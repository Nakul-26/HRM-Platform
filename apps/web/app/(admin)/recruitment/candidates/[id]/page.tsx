import { notFound } from "next/navigation";
import type { Branch, Candidate, Department, Designation, Employee, Interview, JobOpening, Offer } from "@hrm/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { StageForm } from "./stage-form";
import { ResumeUpload } from "./resume-upload";
import { InterviewForm } from "./interview-form";
import { OfferForm } from "./offer-form";
import { OfferStatusButtons } from "./offer-status-buttons";
import { HireForm } from "./hire-form";

const OFFER_STATUS_VARIANT = { pending: "warning", accepted: "success", declined: "destructive", withdrawn: "default" } as const;
const INTERVIEW_STATUS_VARIANT = { scheduled: "warning", completed: "success", cancelled: "default" } as const;

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [candidateResult, interviewsResult, offersResult, employeesResult, departmentsResult, designationsResult, branchesResult] = await Promise.all([
    gatewayFetch<Candidate>(`/api/v1/recruitment/candidates/${id}`),
    gatewayFetch<Interview[]>(`/api/v1/recruitment/interviews?candidateId=${id}&pageSize=100`),
    gatewayFetch<Offer[]>(`/api/v1/recruitment/offers?candidateId=${id}`),
    gatewayFetch<Employee[]>("/api/v1/employees?pageSize=200"),
    gatewayFetch<Department[]>("/api/v1/departments?pageSize=100"),
    gatewayFetch<Designation[]>("/api/v1/designations?pageSize=100"),
    gatewayFetch<Branch[]>("/api/v1/branches?pageSize=100"),
  ]);

  if (candidateResult.status === 404) notFound();
  const candidate = candidateResult.data;
  if (!candidate) notFound();

  const jobOpeningResult = await gatewayFetch<JobOpening>(`/api/v1/recruitment/job-openings/${candidate.jobOpeningId}`);
  const jobOpening = jobOpeningResult.data;

  const interviews = interviewsResult.data ?? [];
  const offers = offersResult.data ?? [];
  const employees = employeesResult.data ?? [];
  const departments = departmentsResult.data ?? [];
  const designations = designationsResult.data ?? [];
  const branches = branchesResult.data ?? [];

  const employeeName = (empId: string | null) => {
    if (!empId) return "—";
    const employee = employees.find((e) => e.id === empId);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };

  const acceptedOffer = offers.find((o) => o.status === "accepted");
  const isHired = candidate.pipelineStage === "hired";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{candidate.fullName}</h1>
          <p className="text-sm text-slate-500">
            {candidate.email} · {jobOpening?.title ?? "Unknown role"}
          </p>
        </div>
        <Badge variant="default">{candidate.pipelineStage}</Badge>
      </div>

      {!isHired && (
        <Card>
          <CardHeader>
            <CardTitle>Pipeline stage</CardTitle>
          </CardHeader>
          <CardContent>
            <StageForm candidateId={candidate.id} currentStage={candidate.pipelineStage} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Resume</CardTitle>
        </CardHeader>
        <CardContent>
          <ResumeUpload candidateId={candidate.id} hasResume={Boolean(candidate.resumeR2Key)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interviews ({interviews.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!isHired && <InterviewForm candidateId={candidate.id} employees={employees} />}
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Interviewer</TableHeaderCell>
                <TableHeaderCell>Scheduled at</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Rating</TableHeaderCell>
                <TableHeaderCell>Feedback</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {interviews.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{employeeName(i.interviewerId)}</TableCell>
                  <TableCell>{new Date(i.scheduledAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={INTERVIEW_STATUS_VARIANT[i.status]}>{i.status}</Badge>
                  </TableCell>
                  <TableCell>{i.rating ?? "—"}</TableCell>
                  <TableCell>{i.feedback ?? "—"}</TableCell>
                </TableRow>
              ))}
              {interviews.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No interviews scheduled yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Offers ({offers.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!isHired && <OfferForm candidateId={candidate.id} designations={designations} />}
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Designation</TableHeaderCell>
                <TableHeaderCell>Offered CTC</TableHeaderCell>
                <TableHeaderCell>Joining date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {offers.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{designations.find((d) => d.id === o.designationId)?.title ?? "—"}</TableCell>
                  <TableCell>{o.offeredCtc.toFixed(2)}</TableCell>
                  <TableCell>{o.joiningDate}</TableCell>
                  <TableCell>
                    <Badge variant={OFFER_STATUS_VARIANT[o.status]}>{o.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <OfferStatusButtons candidateId={candidate.id} offerId={o.id} status={o.status} />
                  </TableCell>
                </TableRow>
              ))}
              {offers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No offers yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isHired && acceptedOffer && (
        <Card>
          <CardHeader>
            <CardTitle>Hire</CardTitle>
          </CardHeader>
          <CardContent>
            <HireForm
              candidateId={candidate.id}
              suggestedJoiningDate={acceptedOffer.joiningDate}
              departments={departments}
              designations={designations}
              branches={branches}
              employees={employees}
            />
          </CardContent>
        </Card>
      )}

      {isHired && candidate.hiredEmployeeId && (
        <Card>
          <CardContent>
            <p className="text-sm text-slate-600">
              This candidate was hired as employee{" "}
              <a href={`/employees/${candidate.hiredEmployeeId}`} className="underline">
                {employeeName(candidate.hiredEmployeeId)}
              </a>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
