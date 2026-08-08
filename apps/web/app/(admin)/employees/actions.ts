"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CreateEmployeeInput } from "@hrm/types";
import { gatewayFetch } from "@/lib/gateway";

export interface EmployeeFormState {
  error?: string;
}

function optional(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : undefined;
}

export async function createEmployeeAction(_prev: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const body: CreateEmployeeInput = {
    employeeCode: String(formData.get("employeeCode") ?? "").trim(),
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    employmentType: String(formData.get("employmentType") ?? "full_time") as CreateEmployeeInput["employmentType"],
    dateOfJoining: String(formData.get("dateOfJoining") ?? "").trim(),
    personalEmail: optional(formData, "personalEmail"),
    workEmail: optional(formData, "workEmail"),
    phone: optional(formData, "phone"),
    departmentId: optional(formData, "departmentId"),
    designationId: optional(formData, "designationId"),
    branchId: optional(formData, "branchId"),
    managerId: optional(formData, "managerId"),
  };

  const result = await gatewayFetch<{ id: string }>("/api/v1/employees", { method: "POST", body });
  if (!result.ok || !result.data) return { error: result.error?.message ?? "Could not create employee." };

  revalidatePath("/employees");
  redirect(`/employees/${result.data.id}`);
}

export async function updateEmployeeAction(id: string, _prev: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const body: Record<string, unknown> = {
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    personalEmail: optional(formData, "personalEmail"),
    workEmail: optional(formData, "workEmail"),
    phone: optional(formData, "phone"),
    departmentId: optional(formData, "departmentId"),
    designationId: optional(formData, "designationId"),
    branchId: optional(formData, "branchId"),
  };

  const result = await gatewayFetch(`/api/v1/employees/${id}`, { method: "PATCH", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not update employee." };

  revalidatePath(`/employees/${id}`);
  revalidatePath("/employees");
  return {};
}

export async function terminateEmployeeAction(id: string) {
  await gatewayFetch(`/api/v1/employees/${id}`, { method: "DELETE" });
  revalidatePath(`/employees/${id}`);
  revalidatePath("/employees");
}
