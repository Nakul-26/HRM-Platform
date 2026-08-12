import { notFound } from "next/navigation";
import type { Interview } from "@hrm/types";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { FeedbackForm } from "./feedback-form";

const STATUS_VARIANT = { scheduled: "warning", completed: "success", cancelled: "default" } as const;

export default async function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await gatewayFetch<Interview>(`/api/v1/recruitment/interviews/${id}`);
  if (result.status === 404 || result.status === 403) notFound();
  const interview = result.data;
  if (!interview) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Interview on {new Date(interview.scheduledAt).toLocaleString()}</h1>
        <Badge variant={STATUS_VARIANT[interview.status]}>{interview.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{interview.status === "scheduled" ? "Record feedback" : "Feedback"}</CardTitle>
        </CardHeader>
        <CardContent>
          {interview.status === "scheduled" ? (
            <FeedbackForm interviewId={interview.id} />
          ) : (
            <div className="flex flex-col gap-2 text-sm text-slate-700">
              <p>Rating: {interview.rating ?? "—"}</p>
              <p>Feedback: {interview.feedback ?? "—"}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
