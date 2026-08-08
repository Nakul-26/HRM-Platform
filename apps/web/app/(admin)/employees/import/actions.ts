"use server";

import { revalidatePath } from "next/cache";
import { importEmployeesCsv } from "@/lib/gateway";

export interface ImportState {
  error?: string;
  rowErrors?: { row: number; errors: string[] }[] | undefined;
  imported?: number;
}

export async function importEmployeesAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to import." };
  }

  const csvText = await file.text();
  const result = await importEmployeesCsv(csvText);

  if (!result.ok) {
    const details = result.error?.details as { errors?: { row: number; errors: string[] }[] } | undefined;
    return { error: result.error?.message ?? "Import failed.", rowErrors: details?.errors };
  }

  revalidatePath("/employees");
  return { imported: result.data?.imported ?? 0 };
}
