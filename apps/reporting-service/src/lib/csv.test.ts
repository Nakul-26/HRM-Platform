import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header row followed by data rows in column order", () => {
    const csv = toCsv(
      [{ id: "1", name: "Alice" }],
      [
        { key: "id", header: "ID" },
        { key: "name", header: "Name" },
      ],
    );
    expect(csv).toBe("ID,Name\n1,Alice\n");
  });

  it("quotes values containing commas", () => {
    const csv = toCsv([{ note: "a, b" }], [{ key: "note", header: "Note" }]);
    expect(csv).toBe('Note\n"a, b"\n');
  });

  it("returns just the header row for an empty input", () => {
    const csv = toCsv([], [{ key: "id", header: "ID" }]);
    expect(csv).toBe("ID\n");
  });
});
