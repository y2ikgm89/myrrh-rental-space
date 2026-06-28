import { describe, expect, test } from "bun:test";

import { generateCsv } from "@/shared/lib/csv";

describe("generateCsv", () => {
  test("generates correct CSV with BOM and headers", () => {
    const rows = [{ name: "テスト", value: 100 }];
    const columns = [
      { header: "名前", accessor: (r: (typeof rows)[number]) => r.name },
      { header: "値", accessor: (r: (typeof rows)[number]) => r.value },
    ];
    const csv = generateCsv(rows, columns);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("名前,値");
    expect(csv).toContain("テスト,100");
  });

  test("uses CRLF line endings", () => {
    const rows = [{ a: "1" }];
    const columns = [
      { header: "A", accessor: (r: (typeof rows)[number]) => r.a },
    ];
    const csv = generateCsv(rows, columns);
    expect(csv).toContain("\r\n");
    // Should NOT have bare \n without preceding \r
    const withoutCRLF = csv.replace(/\r\n/g, "");
    expect(withoutCRLF).not.toContain("\n");
  });

  test("escapes fields with commas", () => {
    const rows = [{ name: "A, B" }];
    const columns = [
      { header: "名前", accessor: (r: (typeof rows)[number]) => r.name },
    ];
    const csv = generateCsv(rows, columns);
    expect(csv).toContain('"A, B"');
  });

  test("escapes fields with double quotes", () => {
    const rows = [{ name: 'He said "hello"' }];
    const columns = [
      { header: "名前", accessor: (r: (typeof rows)[number]) => r.name },
    ];
    const csv = generateCsv(rows, columns);
    expect(csv).toContain('"He said ""hello"""');
  });

  test("escapes fields with newlines", () => {
    const rows = [{ name: "Line1\nLine2" }];
    const columns = [
      { header: "名前", accessor: (r: (typeof rows)[number]) => r.name },
    ];
    const csv = generateCsv(rows, columns);
    expect(csv).toContain('"Line1\nLine2"');
  });

  test("handles null and undefined accessor values", () => {
    type NullableRow = { name: string | null; value: number | undefined };
    const rows: NullableRow[] = [{ name: null, value: undefined }];
    const columns = [
      { header: "名前", accessor: (r: (typeof rows)[number]) => r.name },
      { header: "値", accessor: (r: (typeof rows)[number]) => r.value },
    ];
    const csv = generateCsv(rows, columns);
    // null/undefined become empty string via String(col.accessor(row) ?? "")
    const lines = csv.split("\r\n");
    const dataLine = lines[1];
    expect(dataLine).toBe(",");
  });

  test("handles empty rows array", () => {
    const columns = [
      {
        header: "名前",
        accessor: (_r: Record<string, never>): string => "",
      },
    ];
    const csv = generateCsv([], columns);
    // BOM + header only, no trailing CRLF since join produces single element
    expect(csv).toBe("\uFEFF名前");
  });

  test("handles multiple rows", () => {
    const rows = [
      { id: 1, name: "Alpha" },
      { id: 2, name: "Beta" },
      { id: 3, name: "Gamma" },
    ];
    const columns = [
      { header: "ID", accessor: (r: (typeof rows)[number]) => r.id },
      { header: "Name", accessor: (r: (typeof rows)[number]) => r.name },
    ];
    const csv = generateCsv(rows, columns);
    const lines = csv.replace("\uFEFF", "").split("\r\n");
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[0]).toBe("ID,Name");
    expect(lines[1]).toBe("1,Alpha");
  });
});
