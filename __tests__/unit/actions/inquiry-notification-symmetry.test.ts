/**
 * Single-op と bulk の inquiry status change action が、同じ
 * RESOLVED / CLOSED 遷移で顧客への通知 (sendInquiryStatusNotificationToAll)
 * を発火することを静的強制する drift-gate。
 *
 * # 背景
 *
 * Round-4 audit Finding #1 / high: 旧実装は行内 status dropdown 経由の
 * updateInquiryStatus (single) では通知が飛ばず、一括ステータス変更経路の
 * bulkSetStatusInquiries だけが顧客に「対応完了」メールを送っていた。同じ
 * 顧客インパクトの action が同じ通知経路を通ることを機械強制する。
 *
 * # gate
 *
 * 単発 (inquiry.ts の updateInquiryStatus) と bulk (inquiry/bulk.ts の
 * bulkSetStatusInquiries) の関数 body 双方に:
 *   - `sendInquiryStatusNotificationToAll(` の call が現れる
 *   - `InquiryStatus.RESOLVED` と `InquiryStatus.CLOSED` の両方が言及される
 * ことを regex で確認する。
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { definite } from "../../support/definite";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");

type Target = {
  file: string;
  fn: string;
};

const TARGETS: readonly Target[] = [
  {
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts",
    fn: "updateInquiryStatus",
  },
  {
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry/bulk.ts",
    fn: "bulkSetStatusInquiries",
  },
];

function extractFunctionScope(source: string, name: string): string | null {
  // 関数 declaration から次の top-level 関数の直前までを scope とする
  // (brace counting は型注釈 / template literal に脆いため使わない)
  const decl = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(`);
  const m = decl.exec(source);
  if (!m) return null;
  const start = m.index;
  const rest = source.slice(start + m[0].length);
  const nextDecl = /\n(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/.exec(
    rest,
  );
  const end =
    nextDecl !== null ? start + m[0].length + nextDecl.index : source.length;
  return source.slice(start, end);
}

describe("inquiry status change actions notify customer symmetrically (single vs bulk)", () => {
  for (const t of TARGETS) {
    const abs = resolve(REPO_ROOT, t.file);
    test(`${t.file} exists`, () => {
      expect(existsSync(abs)).toBe(true);
    });

    const source = readFileSync(abs, "utf8");
    const body = extractFunctionScope(source, t.fn);

    test(`${t.file} :: ${t.fn} declaration exists`, () => {
      expect(body).not.toBeNull();
    });

    test(`${t.file} :: ${t.fn} fires sendInquiryStatusNotificationToAll`, () => {
      expect(body).not.toBeNull();
      expect(
        definite(body, "action の本文").includes(
          "sendInquiryStatusNotificationToAll(",
        ),
      ).toBe(true);
    });

    test(`${t.file} :: ${t.fn} gates the notification on RESOLVED or CLOSED`, () => {
      expect(body).not.toBeNull();
      expect(
        /InquiryStatus\.RESOLVED/.test(definite(body, "action の本文")),
      ).toBe(true);
      expect(
        /InquiryStatus\.CLOSED/.test(definite(body, "action の本文")),
      ).toBe(true);
    });
  }
});
