"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label } from "@hrm/ui";
import { deleteSsoConnectionAction, saveSsoConnectionAction, type SsoConnectionActionState } from "./actions";

const initialState: SsoConnectionActionState = {};

export function SsoConnectionForm({
  configured,
  issuer,
  clientId,
  enabled,
}: {
  configured: boolean;
  issuer?: string | undefined;
  clientId?: string | undefined;
  enabled?: boolean | undefined;
}) {
  const [state, formAction, pending] = useActionState(saveSsoConnectionAction, initialState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error && <Alert variant="error">{state.error}</Alert>}
        <div>
          <Label htmlFor="issuer">Issuer URL</Label>
          <Input id="issuer" name="issuer" type="url" placeholder="https://your-idp.example.com" defaultValue={issuer} required />
          <p className="mt-1 text-xs text-slate-500">
            We fetch <code>{"{issuer}/.well-known/openid-configuration"}</code> to discover the authorization, token, and
            JWKS endpoints — no need to enter those separately.
          </p>
        </div>
        <div>
          <Label htmlFor="clientId">Client ID</Label>
          <Input id="clientId" name="clientId" defaultValue={clientId} required />
        </div>
        <div>
          <Label htmlFor="clientSecret">Client secret</Label>
          <Input id="clientSecret" name="clientSecret" type="password" required />
          <p className="mt-1 text-xs text-slate-500">
            {configured
              ? "Never shown once saved — re-enter it any time you update this connection."
              : "Stored encrypted at rest."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input id="enabled" name="enabled" type="checkbox" defaultChecked={enabled ?? true} className="h-4 w-4" />
          <Label htmlFor="enabled">Enabled</Label>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : configured ? "Update connection" : "Save connection"}
          </Button>
        </div>
      </form>

      {configured && (
        <form action={deleteSsoConnectionAction}>
          <Button type="submit" variant="ghost" size="sm">
            Remove SSO connection
          </Button>
        </form>
      )}
    </div>
  );
}
