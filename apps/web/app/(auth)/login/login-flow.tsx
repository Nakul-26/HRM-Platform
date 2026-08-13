"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { toDataURL } from "qrcode";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@hrm/ui";
import {
  loginAction,
  mfaSetupConfirmAction,
  mfaSetupStartAction,
  mfaVerifyAction,
  type LoginState,
  type MfaSetupConfirmState,
  type MfaSetupStartState,
  type MfaVerifyState,
} from "./actions";

const loginInitial: LoginState = {};
const mfaVerifyInitial: MfaVerifyState = {};
const setupStartInitial: MfaSetupStartState = {};
const setupConfirmInitial: MfaSetupConfirmState = {};

export function LoginFlow({ ssoEnabled, ssoLoginUrl }: { ssoEnabled: boolean; ssoLoginUrl: string }) {
  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, loginInitial);

  if (loginState.mfaRequired && loginState.mfaToken) {
    return <MfaChallenge mfaToken={loginState.mfaToken} />;
  }
  if (loginState.mfaSetupRequired && loginState.mfaToken) {
    return <MfaForcedSetup mfaToken={loginState.mfaToken} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={loginFormAction} className="flex flex-col gap-4">
          {loginState.error && <Alert variant="error">{loginState.error}</Alert>}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoFocus />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" disabled={loginPending}>
            {loginPending ? "Logging in..." : "Log in"}
          </Button>
        </form>
        {ssoEnabled && (
          <p className="mt-4 text-center text-sm text-slate-500">
            <a className="font-medium text-slate-900 underline" href={ssoLoginUrl}>
              Log in with single sign-on
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MfaChallenge({ mfaToken }: { mfaToken: string }) {
  const [state, formAction, pending] = useActionState(mfaVerifyAction, mfaVerifyInitial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter your authentication code</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && <Alert variant="error">{state.error}</Alert>}
          <input type="hidden" name="mfaToken" value={mfaToken} />
          <div>
            <Label htmlFor="code">Code</Label>
            <Input id="code" name="code" inputMode="numeric" maxLength={10} required autoFocus />
            <p className="mt-1 text-xs text-slate-500">From your authenticator app, or a backup code.</p>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Verifying..." : "Verify"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MfaForcedSetup({ mfaToken }: { mfaToken: string }) {
  const [startState, startFormAction, startPending] = useActionState(mfaSetupStartAction, setupStartInitial);
  const [confirmState, confirmFormAction, confirmPending] = useActionState(mfaSetupConfirmAction, setupConfirmInitial);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!startState.otpauthUri) return;
    toDataURL(startState.otpauthUri)
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [startState.otpauthUri]);

  if (!startState.secret) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set up multi-factor authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={startFormAction} className="flex flex-col gap-4">
            {startState.error && <Alert variant="error">{startState.error}</Alert>}
            <input type="hidden" name="mfaToken" value={mfaToken} />
            <p className="text-sm text-slate-600">Your organization requires MFA for your role. Let&apos;s set it up now.</p>
            <Button type="submit" disabled={startPending}>
              {startPending ? "Starting..." : "Start setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan and confirm</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm text-slate-600">Scan this QR code with your authenticator app:</p>
            {qrDataUrl && <img src={qrDataUrl} alt="MFA enrollment QR code" width={200} height={200} />}
            <p className="mt-2 text-xs text-slate-500">
              Or enter this key manually: <code className="font-mono">{startState.secret}</code>
            </p>
          </div>

          {startState.backupCodes && (
            <Alert variant="info">
              <p className="mb-1 font-medium">Save these backup codes now — each can be used once if you lose your device:</p>
              <div className="grid grid-cols-2 gap-1 font-mono text-sm">
                {startState.backupCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
            </Alert>
          )}

          <form action={confirmFormAction} className="flex flex-col gap-3">
            {confirmState.error && <Alert variant="error">{confirmState.error}</Alert>}
            <input type="hidden" name="mfaToken" value={mfaToken} />
            <div>
              <Label htmlFor="setup-code">Enter the 6-digit code to confirm</Label>
              <Input id="setup-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus />
            </div>
            <Button type="submit" disabled={confirmPending}>
              {confirmPending ? "Confirming..." : "Confirm and log in"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
