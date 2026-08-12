import { describe, expect, it } from "vitest";
import { splitFullName } from "./hireEmployee";

describe("splitFullName", () => {
  it("splits a simple two-word name", () => {
    expect(splitFullName("Nina Payslip")).toEqual({ firstName: "Nina", lastName: "Payslip" });
  });

  it("keeps a multi-word last name intact", () => {
    expect(splitFullName("Maria De La Cruz")).toEqual({ firstName: "Maria", lastName: "De La Cruz" });
  });

  it("collapses extra internal whitespace and trims edges", () => {
    expect(splitFullName("  Bill   Weasley  ")).toEqual({ firstName: "Bill", lastName: "Weasley" });
  });

  it("falls back to an empty last name for a single-token name", () => {
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
});
