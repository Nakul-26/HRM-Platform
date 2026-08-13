import { Card, CardContent, CardHeader, CardTitle } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { MfaEnroll } from "./mfa-enroll";
import { MfaDisable } from "./mfa-disable";

export default async function SecurityPage() {
  const result = await gatewayFetch<{ enabled: boolean }>("/api/v1/auth/mfa/status");
  const enabled = result.data?.enabled ?? false;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Multi-factor authentication</CardTitle>
        </CardHeader>
        <CardContent>{enabled ? <MfaDisable /> : <MfaEnroll />}</CardContent>
      </Card>
    </div>
  );
}
