"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label, Textarea } from "@hrm/ui";
import { submitFeedbackAction, type FeedbackActionState } from "./actions";

const initialState: FeedbackActionState = {};

export function FeedbackForm({ interviewId }: { interviewId: string }) {
  const [state, formAction, pending] = useActionState(submitFeedbackAction.bind(null, interviewId), initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div>
        <Label htmlFor="rating">Rating (1-5)</Label>
        <Input id="rating" name="rating" type="number" min="1" max="5" required />
      </div>
      <div>
        <Label htmlFor="feedback">Feedback</Label>
        <Textarea id="feedback" name="feedback" rows={4} required />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Submitting..." : "Submit feedback"}
      </Button>
    </form>
  );
}
