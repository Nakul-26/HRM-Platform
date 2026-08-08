"use client";

import { useActionState } from "react";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@hrm/ui";
import { signupAction, type SignupState } from "./actions";

const initialState: SignupState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && <Alert variant="error">{state.error}</Alert>}
          <div>
            <Label htmlFor="name">Organization name</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="slug">Organization URL</Label>
            <div className="flex items-center gap-2">
              <Input id="slug" name="slug" required pattern="[a-z0-9-]+" placeholder="acme" />
              <span className="whitespace-nowrap text-sm text-slate-500">.{rootDomain}</span>
            </div>
          </div>
          <div>
            <Label htmlFor="adminName">Your name</Label>
            <Input id="adminName" name="adminName" required />
          </div>
          <div>
            <Label htmlFor="adminEmail">Your email</Label>
            <Input id="adminEmail" name="adminEmail" type="email" required />
          </div>
          <div>
            <Label htmlFor="adminPassword">Password</Label>
            <Input id="adminPassword" name="adminPassword" type="password" minLength={8} required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating..." : "Create organization"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <a className="font-medium text-slate-900 underline" href="/login">
            Log in
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
