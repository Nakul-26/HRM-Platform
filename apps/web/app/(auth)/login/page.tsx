import { gatewayOrigin, ssoStatus } from "@/lib/gateway";
import { getTenantSlug } from "@/lib/tenant";
import { LoginFlow } from "./login-flow";

export default async function LoginPage() {
  const slug = await getTenantSlug();
  const status = slug ? await ssoStatus(slug) : { data: { enabled: false } };
  const ssoEnabled = status.data?.enabled ?? false;
  const ssoLoginUrl = `${gatewayOrigin(slug)}/api/v1/auth/sso/login`;

  return <LoginFlow ssoEnabled={ssoEnabled} ssoLoginUrl={ssoLoginUrl} />;
}
