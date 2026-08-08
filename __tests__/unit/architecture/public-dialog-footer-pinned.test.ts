import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PUBLIC_APP_ROOT = join(ROOT, "src", "app", "(public)");
const DIALOG_FILE = join(
  PUBLIC_APP_ROOT,
  "_shared",
  "components",
  "design-system",
  "dialog.tsx",
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

describe("public dialog footer stays pinned outside the scroll area", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    // 収集が黙って 0 件になると offenders も必ず空になり、緑が「違反なし」を
    // 意味しなくなる（local/gate-scan-must-not-be-silently-empty が強制）。
    expect(collectTsxFiles(PUBLIC_APP_ROOT).length).toBeGreaterThan(5);
  });

  test("DialogContent exposes a footer prop rendered after the scrollable children and before the close button", () => {
    const source = readFileSync(DIALOG_FILE, "utf8");

    const signatureMatch = source.match(
      /function DialogContent\(\{([\s\S]*?)\}:/u,
    );
    expect(signatureMatch).not.toBeNull();
    expect(signatureMatch?.[1] ?? "").toMatch(/\bfooter\b/u);

    const scrollDivIndex = source.indexOf("overflow-y-auto p-4 sm:p-6");
    expect(scrollDivIndex).toBeGreaterThan(-1);

    const footerRenderIndex = source.indexOf("{footer", scrollDivIndex);
    expect(footerRenderIndex).toBeGreaterThan(scrollDivIndex);

    const closeButtonIndex = source.indexOf(
      "DialogPrimitive.Close",
      footerRenderIndex,
    );
    expect(closeButtonIndex).toBeGreaterThan(footerRenderIndex);
  });

  test("no call site passes <DialogFooter> as a child of <DialogContent> (must use the footer prop instead)", () => {
    const violations: string[] = [];
    const contentPattern =
      /<DialogContent\b(?:[^>]|(?<==)>)*>(?<children>[\s\S]*?)<\/DialogContent>/gu;

    for (const filePath of collectTsxFiles(PUBLIC_APP_ROOT)) {
      if (filePath === DIALOG_FILE) continue;
      const source = readFileSync(filePath, "utf8");

      for (const match of source.matchAll(contentPattern)) {
        const children = match.groups?.["children"] ?? "";
        if (/<DialogFooter\b/u.test(children)) {
          violations.push(
            `${relative(ROOT, filePath)}:${lineNumberFor(source, match.index)}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
