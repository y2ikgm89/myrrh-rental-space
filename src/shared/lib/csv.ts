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

/**
 * CSV フィールドをエスケープ（RFC 4180 + 数式インジェクション対策）
 *
 * Excel/LibreOffice で開いた際に `=`, `+`, `-`, `@`, `\t`, `\r` で始まるセルが
 * 数式として実行されるのを防ぐ（OWASP CSV Injection 対策）。
 * 先頭にシングルクォートを挿入し、全体をダブルクォートで囲む。
 */
function escapeCsvField(value: string): string {
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value);
  const escaped = needsFormulaGuard ? `'${value}` : value;

  if (
    needsFormulaGuard ||
    escaped.includes(",") ||
    escaped.includes('"') ||
    escaped.includes("\n")
  ) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

export type { CsvColumn };
