import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ADMIN_DASHBOARD_ROOT = join(
  ROOT,
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
);

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsxFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      out.push(path);
    }
  }

  return out;
}

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/u).length;
}

describe("admin field error association", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    // 収集が黙って 0 件になると offenders も必ず空になり、緑が「違反なし」を
    // 意味しなくなる。件数の下限をここで固定する
    // （local/gate-scan-must-not-be-silently-empty が強制）。
    expect(collectTsxFiles(ADMIN_DASHBOARD_ROOT).length).toBeGreaterThan(20);
  });

  test("inline Conform field errors expose the field error id and are wired to aria-describedby", () => {
    expect(existsSync(ADMIN_DASHBOARD_ROOT)).toBe(true);

    const violations: string[] = [];
    const describedByViolations: string[] = [];
    let fieldErrorCandidates = 0;
    let genericHelperCandidates = 0;
    const fieldErrorPattern =
      /fields\.([A-Za-z0-9_]+)\.errors\s*&&\s*\(\s*<p(?<attrs>[\s\S]*?)>/gu;
    // 一部のフィールドは `renderFieldError(field)` のような汎用 helper に抽出され、
    // `fields.X` ではなく単一パラメータ名 + 三項演算子で書かれる
    // （例: EventSeoFields.tsx / TicketsField.tsx。Phase C 監査で判明）。
    // 同じ変数名が条件式と id 属性の両方に使われているかを別途検証する。
    const genericFieldErrorHelperPattern =
      /\b(\w+)\.errors\s*&&\s*\1\.errors\.length\s*>\s*0\s*\?\s*\(\s*<p(?<attrs>[\s\S]*?)>/gu;
    // Some fields thread the association through a child component instead of
    // rendering the DOM attribute directly (e.g. a rich-text editor wrapper that
    // accepts an `ariaDescribedBy` prop and applies `aria-describedby` internally).
    const ariaDescribedByPattern =
      /(?:aria-describedby|ariaDescribedBy)=\{([\s\S]*?)\}/gu;
    // Conform's getInputProps/getTextareaProps/getSelectProps inject aria-describedby
    // automatically (ariaAttributes defaults to true), so a field bound via one of
    // these spreads is already wired even with no literal aria-describedby in source.
    const conformBoundFieldPattern =
      /\{\.\.\.get(?:Input|Textarea|Select)Props\(fields\.([A-Za-z0-9_]+)/gu;

    for (const filePath of collectTsxFiles(ADMIN_DASHBOARD_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      const ariaDescribedByValues = [
        ...source.matchAll(ariaDescribedByPattern),
      ].map((match) => match[1] ?? "");
      const conformBoundFields = new Set(
        [...source.matchAll(conformBoundFieldPattern)].map(
          (match) => match[1] ?? "",
        ),
      );

      for (const match of source.matchAll(fieldErrorPattern)) {
        fieldErrorCandidates += 1;
        const fieldName = match[1] ?? "";
        const attrs = match.groups?.["attrs"] ?? "";
        const hasErrorId = attrs.includes(`id={fields.${fieldName}.errorId}`);

        if (!hasErrorId) {
          violations.push(
            `${relative(ROOT, filePath)}:${lineNumberFor(source, match.index)}`,
          );
          continue;
        }

        const isReferenced =
          conformBoundFields.has(fieldName) ||
          ariaDescribedByValues.some((value) =>
            value.includes(`fields.${fieldName}.errorId`),
          );

        if (!isReferenced) {
          describedByViolations.push(
            `${relative(ROOT, filePath)}:${lineNumberFor(source, match.index)}`,
          );
        }
      }

      for (const match of source.matchAll(genericFieldErrorHelperPattern)) {
        genericHelperCandidates += 1;
        const paramName = match[1] ?? "";
        const attrs = match.groups?.["attrs"] ?? "";
        const hasErrorId = attrs.includes(`id={${paramName}.errorId}`);

        if (!hasErrorId) {
          violations.push(
            `${relative(ROOT, filePath)}:${lineNumberFor(source, match.index)}`,
          );
        }
      }
    }

    // 判定に届いた候補。matcher が空振りすると offenders も空のまま緑。
    // 実測 246。しきい値は数値リテラル。
    expect(fieldErrorCandidates).toBeGreaterThan(100);
    // 実測 1（EventSeoFields.tsx の renderFieldError）。
    // 正当な抽出・改名で消えると非欠陥で赤。0 より大きい、だけを物語にしない。
    expect(genericHelperCandidates).toBeGreaterThan(0);
    expect(violations).toEqual([]);
    expect(describedByViolations).toEqual([]);
  });
});
