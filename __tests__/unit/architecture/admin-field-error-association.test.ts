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
  test("inline Conform field errors expose the field error id and are wired to aria-describedby", () => {
    expect(existsSync(ADMIN_DASHBOARD_ROOT)).toBe(true);

    // Manually-bound fields outside this list may still lack aria-describedby
    // wiring from before this stricter check was introduced (tracked as separate
    // follow-up accessibility work), so the check below is scoped to the files
    // already brought into compliance. Do not add a file here unless every
    // manually-bound field in it is actually wired — wire new fields correctly
    // instead of adding them to this list to force a pass.
    const DESCRIBED_BY_CHECKED_FILES = new Set([
      join("locations", "_components", "LocationForm.tsx"),
      join("customers", "_components", "CustomerForm.tsx"),
      join("customers", "_components", "CustomerEditForm.tsx"),
      join("events", "_components", "EventPublishFields.tsx"),
      join("_shared", "components", "ListPageSeoForm.tsx"),
      join("pages", "[slug]", "_seo", "_components", "PageSeoForm.tsx"),
      join("coupons", "_components", "CouponForm.tsx"),
      join("reservations", "_components", "ReservationForm.tsx"),
      join("reservations", "_components", "ReservationEditForm.tsx"),
    ]);

    const violations: string[] = [];
    const describedByViolations: string[] = [];
    const fieldErrorPattern =
      /fields\.([A-Za-z0-9_]+)\.errors\s*&&\s*\(\s*<p(?<attrs>[\s\S]*?)>/gu;
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
      const relativePath = relative(ADMIN_DASHBOARD_ROOT, filePath);
      const source = readFileSync(filePath, "utf8");
      const ariaDescribedByValues = [
        ...source.matchAll(ariaDescribedByPattern),
      ].map((match) => match[1]);
      const conformBoundFields = new Set(
        [...source.matchAll(conformBoundFieldPattern)].map((match) => match[1]),
      );

      for (const match of source.matchAll(fieldErrorPattern)) {
        const fieldName = match[1];
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

        if (!isReferenced && DESCRIBED_BY_CHECKED_FILES.has(relativePath)) {
          describedByViolations.push(
            `${relative(ROOT, filePath)}:${lineNumberFor(source, match.index)}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
    expect(describedByViolations).toEqual([]);
  });
});
