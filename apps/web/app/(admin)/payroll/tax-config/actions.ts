"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface TaxConfigActionState {
  error?: string;
}

const NUMBER_FIELDS = [
  "pfEmployeeRate",
  "pfEmployerRate",
  "esiEmployeeRate",
  "esiEmployerRate",
  "esiWageThreshold",
  "standardDeduction",
  "cessRate",
] as const;

export async function updateTaxConfigAction(_prev: TaxConfigActionState, formData: FormData): Promise<TaxConfigActionState> {
  const body: Record<string, unknown> = {};

  for (const field of NUMBER_FIELDS) {
    const raw = String(formData.get(field) ?? "").trim();
    if (raw === "") continue;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return { error: `${field} must be a number.` };
    body[field] = value;
  }

  const pfWageCeilingRaw = String(formData.get("pfWageCeiling") ?? "").trim();
  body.pfWageCeiling = pfWageCeilingRaw === "" ? null : Number.parseFloat(pfWageCeilingRaw);

  const taxSlabsRaw = String(formData.get("taxSlabs") ?? "").trim();
  if (taxSlabsRaw) {
    try {
      body.taxSlabs = JSON.parse(taxSlabsRaw);
    } catch {
      return { error: "Tax slabs must be valid JSON." };
    }
  }

  const result = await gatewayFetch("/api/v1/payroll/tax-config", { method: "PATCH", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not update tax configuration." };

  revalidatePath("/payroll/tax-config");
  return {};
}
