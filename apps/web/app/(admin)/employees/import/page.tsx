import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hrm/ui";
import { ImportForm } from "./form";

const CSV_HEADER =
  "employee_code,first_name,last_name,personal_email,work_email,phone,department_name,designation_title,branch_name,manager_employee_code,employment_type,date_of_joining";

export default function ImportEmployeesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk import employees</CardTitle>
        <CardDescription>
          Departments, designations, and branches referenced by name are created automatically if they don&apos;t
          already exist. The whole file is validated before anything is imported.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Expected columns</p>
          <code className="block overflow-x-auto rounded-md bg-slate-50 p-2 text-xs text-slate-700">{CSV_HEADER}</code>
        </div>
        <ImportForm />
      </CardContent>
    </Card>
  );
}
