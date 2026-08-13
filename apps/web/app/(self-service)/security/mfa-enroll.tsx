"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { toDataURL } from "qrcode";
import { Alert, Button, Input, Label } from "@hrm/ui";
import { confirmEnrollAction, startEnrollAction, type ConfirmState, type EnrollStartState } from "./actions";

const startInitialState: EnrollStartState = {};
const confirmInitialState: ConfirmState = {};

export function MfaEnroll() {
  const [startState, startAction, startPending] = useActionState(startEnrollAction, startInitialState);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmEnrollAction, confirmInitialState);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!startState.otpauthUri) return;
    toDataURL(startState.otpauthUri)
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [startState.otpauthUri]);

  if (confirmState.confirmed) {
    return <Alert variant="success">MFA is now enabled on your account.</Alert>;
  }

  if (!startState.secret) {
    return (
      <form action={startAction} className="flex flex-col gap-4">
        {startState.error && <Alert variant="error">{startState.error}</Alert>}
        <p className="text-sm text-slate-600">
          Add an extra layer of security to your account using an authenticator app (Google Authenticator, Authy, 1Password, etc).
        </p>
        <div>
          <Button type="submit" disabled={startPending}>
            {startPending ? "Starting..." : "Set up MFA"}
          </Button>
        </div>
      </form>
    );
  }

  return (
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

      <form action={confirmAction} className="flex flex-col gap-3">
        {confirmState.error && <Alert variant="error">{confirmState.error}</Alert>}
        <div>
          <Label htmlFor="code">Enter the 6-digit code to confirm</Label>
          <Input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus />
        </div>
        <div>
          <Button type="submit" disabled={confirmPending}>
            {confirmPending ? "Confirming..." : "Confirm and enable MFA"}
          </Button>
        </div>
      </form>
    </div>
  );
}
