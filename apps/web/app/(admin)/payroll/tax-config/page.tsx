import type { PayrollTaxConfig } from "@hrm/types";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { EditTaxConfigForm } from "./edit-form";

export default async function PayrollTaxConfigPage() {
  const result = await gatewayFetch<PayrollTaxConfig>("/api/v1/payroll/tax-config");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payroll tax configuration</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="info">
          Real formula shapes with configurable rates (India-style PF/ESI/TDS) — not certified as
          current-year-accurate statutory compliance. Review these rates with someone who has
          current statutory knowledge before relying on a real payroll run.
        </Alert>
        {result.data ? (
          <EditTaxConfigForm config={result.data} />
        ) : (
          <Alert variant="error">Could not load payroll tax configuration.</Alert>
        )}
      </CardContent>
    </Card>
  );
}
