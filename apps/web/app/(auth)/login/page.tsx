"use client";

import { useActionState } from "react";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@hrm/ui";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && <Alert variant="error">{state.error}</Alert>}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoFocus />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Logging in..." : "Log in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
