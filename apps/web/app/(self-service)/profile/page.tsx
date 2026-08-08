import type { Employee, EmployeeDocument } from "@hrm/types";
import { Card, CardContent, CardHeader, CardTitle } from "@hrm/ui";
import { gatewayFetch } from "@/lib/gateway";
import { EditProfileForm } from "./edit-form";
import { DocumentUpload } from "./document-upload";
import { DocumentList } from "./document-list";

export default async function ProfilePage() {
  const employeeResult = await gatewayFetch<Employee>("/api/v1/employees/me");
  const employee = employeeResult.data;

  if (!employee) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-500">
          No employee record is linked to your account yet — ask your HR admin to link one.
        </CardContent>
      </Card>
    );
  }

  const documentsResult = await gatewayFetch<EmployeeDocument[]>(`/api/v1/employees/${employee.id}/documents`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {employee.firstName} {employee.lastName}
        </h1>
        <p className="text-sm text-slate-500">{employee.employeeCode}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My details</CardTitle>
        </CardHeader>
        <CardContent>
          <EditProfileForm employee={employee} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DocumentUpload employeeId={employee.id} />
          <DocumentList documents={documentsResult.data ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
