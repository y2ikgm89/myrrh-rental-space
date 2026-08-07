/**
 * interactive `$transaction(async (tx) => …)` は pg 単一コネクション。
 * callback 内で `Promise.all` / `Promise.allSettled` すると
 * "client is already executing a query" を誘発するため禁止。
 *
 * 配列形式 `$transaction([...])` は ESLint（eslint.config.mjs）が拒否。
 * 本 gate はその interactive callback 側を補完する。
 *
 * @see .claude/rules/db-domain.md §トランザクション
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SCAN_ROOTS = [
  join(ROOT, "src", "shared", "domain"),
  join(ROOT, "src", "shared", "db"),
] as const;

type Violation = {
  readonly file: string;
  readonly line: number;
  readonly kind: "all" | "allSettled";
};

function normalizePath(file: string): string {
  return relative(ROOT, file).replaceAll("\\", "/");
}

/** コメントを空白で潰してインデックスを保持（行番号算出用） */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//gu, (m) => " ".repeat(m.length))
    .replace(/(^|[^:])\/\/.*$/gmu, (m, prefix: string) => {
      return prefix + " ".repeat(m.length - prefix.length);
    });
}

function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  let escape = false;

  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr !== null) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function isInteractiveCallbackArg(head: string): boolean {
  return (
    /^async\b/u.test(head) ||
    /^\([^)]*\)\s*=>/u.test(head) ||
    /^[A-Za-z_$][\w$]*\s*=>/u.test(head)
  );
}

function findInteractiveTxCallbackBody(
  src: string,
  callOpenParenIdx: number,
): { start: number; end: number } | null {
  let i = callOpenParenIdx + 1;
  while (/\s/u.test(src[i] ?? "")) i++;

  // 配列形式は ESLint 管轄。本 gate は interactive callback のみ。
  if (src[i] === "[") return null;

  const head = src.slice(i);
  if (!isInteractiveCallbackArg(head)) return null;

  const braceRel = head.search(/=>\s*\{|\)\s*\{|function[^{]*\{/u);
  if (braceRel < 0) return null;

  let braceIdx = i + braceRel;
  while (src[braceIdx] !== "{") braceIdx++;

  const endBrace = findMatchingBrace(src, braceIdx);
  if (endBrace < 0) return null;

  return { start: braceIdx, end: endBrace };
}

function findPromiseAllInInteractiveTransactions(raw: string): Violation[] {
  const src = blankComments(raw);
  const violations: Violation[] = [];
  const txRe = /\$transaction\s*\(/gu;
  let match: RegExpExecArray | null;

  while ((match = txRe.exec(src)) !== null) {
    const callOpen = match.index + match[0].length - 1;
    const bodyRange = findInteractiveTxCallbackBody(src, callOpen);
    if (bodyRange === null) continue;

    const body = src.slice(bodyRange.start, bodyRange.end + 1);
    const promiseRe = /Promise\.(?<kind>all|allSettled)\s*\(/gu;
    let promiseMatch: RegExpExecArray | null;

    while ((promiseMatch = promiseRe.exec(body)) !== null) {
      const abs = bodyRange.start + promiseMatch.index;
      const line = raw.slice(0, abs).split(/\n/u).length;
      const kind = promiseMatch.groups?.["kind"];
      if (kind !== "all" && kind !== "allSettled") continue;
      violations.push({
        file: "",
        line,
        kind,
      });
    }
  }

  return violations;
}

function collectViolations(): Violation[] {
  const files = SCAN_ROOTS.flatMap((dir) => collectSourceFiles(dir));
  const violations: Violation[] = [];

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    for (const hit of findPromiseAllInInteractiveTransactions(raw)) {
      violations.push({
        ...hit,
        file: normalizePath(file),
      });
    }
  }

  return violations;
}

describe("prisma interactive $transaction: no Promise.all", () => {
  test("検出できる形・できない形（fixture）", () => {
    // interactive tx の callback 内は違反。
    expect(
      findPromiseAllInInteractiveTransactions(
        "await prisma.$transaction(async (tx) => { await Promise.all([a(tx), b(tx)]); });",
      ),
    ).toHaveLength(1);
    expect(
      findPromiseAllInInteractiveTransactions(
        "await prisma.$transaction(async (tx) => { await Promise.allSettled([a(tx)]); });",
      ),
    ).toHaveLength(1);

    // tx の**外**の Promise.all は違反ではない（並行してよい）。
    expect(
      findPromiseAllInInteractiveTransactions(
        "await Promise.all([a(), b()]); await prisma.$transaction(async (tx) => { await a(tx); });",
      ),
    ).toEqual([]);

    // 逐次 await は違反ではない。
    expect(
      findPromiseAllInInteractiveTransactions(
        "await prisma.$transaction(async (tx) => { await a(tx); await b(tx); });",
      ),
    ).toEqual([]);

    // コメント内の言及は数えない。
    expect(
      findPromiseAllInInteractiveTransactions(
        "await prisma.$transaction(async (tx) => { /* Promise.all([a]) は禁止 */ await a(tx); });",
      ),
    ).toEqual([]);
  });

  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(
      SCAN_ROOTS.flatMap((dir) => collectSourceFiles(dir)).length,
    ).toBeGreaterThan(50);
  });

  test("src/shared/domain|db の interactive tx callback 内に Promise.all/allSettled がない", () => {
    const violations = collectViolations();

    expect(violations).toEqual([]);
  });
});
