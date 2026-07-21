/**
 * Round-4 audit fix / atomic-claim WHERE guard for status transitions.
 *
 * Reservation の updateReservationStatusCommand / updateAdminReservationCommand は
 * updateMany + status guard で pre-image を claim してから遷移する。同じ pattern
 * を event.cancelEventCommand と inquiries.updateInquiryStatus にも適用した。
 *
 * この drift-gate は「status を書き換える command が naive な prisma.<x>.update
 * / tx.<x>.update({where: {id}}) を使っていない」ことを regex で静的強制する。
 *
 * # 禁止パターン
 *
 *   prisma.event.update({ where: { id, deletedAt: null }, data: { status: ... } })
 *   tx.inquiry.update({ where: { id }, data: { status: ... } })
 *
 * # 許可パターン
 *
 *   prisma.event.updateMany({ where: { id, deletedAt: null, status: {...} }, data: ... })
 *   tx.inquiry.updateMany({ where: { id, deletedAt: null, status: preImage }, data: ... })
 *
 * updateMany + status guard で pre-image を含める WHERE 述語だけを許容する。
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");

type Target = {
  file: string;
  functions: readonly string[];
};

const TARGETS: readonly Target[] = [
  {
    file: "src/shared/domain/events/commands.ts",
    functions: ["cancelEventCommand"],
  },
  {
    file: "src/shared/domain/inquiries/commands.ts",
    functions: ["updateInquiryStatus"],
  },
];

/**
 * 関数 body の抽出: source 全体で `export async function <name>(` を検出し、
 * その次の `export async function` / `export function` の直前までを body
 * 範囲として返す。brace counting は string/template リテラルや型注釈内の
 * `{}` に脆いため、こちらの粗い区切りを使う (drift-gate の false positive
 * を減らすため、境界が確実にファイル関数境界に一致するアプローチ)。
 */
function extractFunctionBody(source: string, name: string): string | null {
  const decl = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(`);
  const m = decl.exec(source);
  if (!m) return null;
  const start = m.index;
  // Next top-level function declaration is the terminator.
  const rest = source.slice(start + m[0].length);
  const nextDecl = /\n(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/.exec(
    rest,
  );
  const end =
    nextDecl !== null ? start + m[0].length + nextDecl.index : source.length;
  return source.slice(start, end);
}

describe("status transition commands use atomic-claim updateMany + status guard", () => {
  for (const t of TARGETS) {
    const abs = resolve(REPO_ROOT, t.file);
    const source = readFileSync(abs, "utf8");
    for (const fnName of t.functions) {
      const body = extractFunctionBody(source, fnName);

      test(`${t.file} :: ${fnName} declaration exists`, () => {
        expect(body).not.toBeNull();
      });

      test(`${t.file} :: ${fnName} uses updateMany (not naive .update on the row)`, () => {
        // "prisma.<model>.update(" or "tx.<model>.update(" as a mutating write
        // is forbidden. Only updateMany (which supports the status pre-image
        // guard) is allowed here.
        //
        // Line-comments referencing the OLD pattern (`// 旧実装は tx.inquiry.update`)
        // are stripped first so the drift-gate does not fail on documentation
        // of what was fixed.
        const bodyNoComments = body!
          .split(/\r?\n/)
          .map((line) => {
            const idx = line.indexOf("//");
            return idx >= 0 ? line.slice(0, idx) : line;
          })
          .join("\n");
        const naive = /(prisma|tx)\.\w+\.update\s*\(/;
        const bodyWithoutUpdateMany = bodyNoComments.replace(
          /(prisma|tx)\.\w+\.updateMany\s*\(/g,
          "SANCTIONED_UPDATEMANY(",
        );
        expect(naive.test(bodyWithoutUpdateMany)).toBe(false);
      });

      test(`${t.file} :: ${fnName} status column appears in WHERE claim`, () => {
        // The updateMany WHERE must include a status predicate somewhere in
        // the body. This is a soft check but catches accidental "updateMany
        // without status guard" regressions.
        expect(/status\s*:/.test(body!)).toBe(true);
      });
    }
  }
});
