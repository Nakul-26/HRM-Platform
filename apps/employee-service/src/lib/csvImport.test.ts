import { describe, expect, it } from "vitest";
import { parseEmployeeCsv } from "./csvImport";

const HEADER =
  "employee_code,first_name,last_name,personal_email,work_email,phone,department_name,designation_title,branch_name,manager_employee_code,employment_type,date_of_joining";

describe("parseEmployeeCsv", () => {
  it("parses valid rows", () => {
    const csv = [
      HEADER,
      "E001,Ada,Lovelace,,ada@acme.test,,Engineering,Staff Engineer,HQ,,full_time,2024-01-15",
    ].join("\n");

    const { rows, errors } = parseEmployeeCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ employee_code: "E001", first_name: "Ada", employment_type: "full_time" });
  });

  it("reports a row-level error for an invalid date format instead of throwing", () => {
    const csv = [HEADER, "E001,Ada,Lovelace,,,,,,,,full_time,15-01-2024"].join("\n");

    const { rows, errors } = parseEmployeeCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.row).toBe(1);
    expect(errors[0]?.errors.join()).toMatch(/date_of_joining/);
  });

  it("reports a row-level error for a missing required field", () => {
    const csv = [HEADER, ",Ada,Lovelace,,,,,,,,full_time,2024-01-15"].join("\n");

    const { errors } = parseEmployeeCsv(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.errors.join()).toMatch(/employee_code/);
  });

  it("reports a row-level error for an invalid employment_type", () => {
    const csv = [HEADER, "E001,Ada,Lovelace,,,,,,,,freelance,2024-01-15"].join("\n");

    const { errors } = parseEmployeeCsv(csv);
    expect(errors).toHaveLength(1);
  });

  it("rejects a duplicate employee_code within the same file", () => {
    const csv = [
      HEADER,
      "E001,Ada,Lovelace,,,,,,,,full_time,2024-01-15",
      "E001,Grace,Hopper,,,,,,,,full_time,2024-02-01",
    ].join("\n");

    const { rows, errors } = parseEmployeeCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.errors.join()).toMatch(/Duplicate employee_code/);
  });

  it("resolves manager_employee_code and org-structure names as plain strings, not yet validated against the DB", () => {
    const csv = [
      HEADER,
      "E002,Grace,Hopper,,,,Engineering,Engineer,HQ,E001,full_time,2024-03-01",
    ].join("\n");

    const { rows, errors } = parseEmployeeCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]?.manager_employee_code).toBe("E001");
    expect(rows[0]?.department_name).toBe("Engineering");
  });

  it("returns a parse error instead of throwing on malformed CSV", () => {
    const { rows, errors } = parseEmployeeCsv('"unterminated quote,Ada,Lovelace');
    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});
