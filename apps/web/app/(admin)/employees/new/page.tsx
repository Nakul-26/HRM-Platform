import type { Branch, Department, Designation } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { NewEmployeeForm } from "./form";

export default async function NewEmployeePage() {
  const [departments, branches, designations] = await Promise.all([
    gatewayFetch<Department[]>("/api/v1/departments?pageSize=100"),
    gatewayFetch<Branch[]>("/api/v1/branches?pageSize=100"),
    gatewayFetch<Designation[]>("/api/v1/designations?pageSize=100"),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>New employee</CardTitle>
      </CardHeader>
      <CardContent>
        <NewEmployeeForm
          departments={departments.data ?? []}
          branches={branches.data ?? []}
          designations={designations.data ?? []}
        />
      </CardContent>
    </Card>
  );
}
