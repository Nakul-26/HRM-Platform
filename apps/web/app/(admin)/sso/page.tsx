import { DEFAULT_ROLES } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { SsoConnectionForm } from "./sso-connection-form";
import { MfaPolicyForm } from "./mfa-policy-form";

interface SsoConnectionData {
  configured: boolean;
  issuer?: string;
  clientId?: string;
  enabled?: boolean;
}

export default async function SsoSettingsPage() {
  const [ssoResult, mfaPolicyResult] = await Promise.all([
    gatewayFetch<SsoConnectionData>("/api/v1/settings/sso"),
    gatewayFetch<{ requiredRoles: string[] }>("/api/v1/settings/mfa-policy"),
  ]);

  const sso = ssoResult.data ?? { configured: false };
  const requiredRoles = mfaPolicyResult.data?.requiredRoles ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Single sign-on (OIDC)</CardTitle>
        </CardHeader>
        <CardContent>
          <SsoConnectionForm configured={sso.configured} issuer={sso.issuer} clientId={sso.clientId} enabled={sso.enabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Multi-factor authentication policy</CardTitle>
        </CardHeader>
        <CardContent>
          <MfaPolicyForm allRoles={DEFAULT_ROLES} requiredRoles={requiredRoles} />
        </CardContent>
      </Card>
    </div>
  );
}
