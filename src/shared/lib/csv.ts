/**
 * CSV 生成ユーティリティ
 *
 * Excel 互換の BOM 付き UTF-8 CSV を生成
 */

type CsvColumn<T> = {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
};

export function generateCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const BOM = "\uFEFF";
  const header = columns.map((c) => escapeCsvField(c.header)).join(",");
  const body = rows.map((row) =>
    columns
      .map((col) => escapeCsvField(String(col.accessor(row) ?? "")))
      .join(","),
  );
  return BOM + [header, ...body].join("\r\n");
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type { CsvColumn };
