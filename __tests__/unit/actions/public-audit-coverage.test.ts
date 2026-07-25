/**
 * D7: 公開 CREATE / マイページ顧客返信は最小 AuditLog を発火する。
 *
 * 検出したい regression:
 *  - 公開予約・イベント申込・waitlist 確定・お問い合わせ・レビューの成功経路から
 *    createAuditLogRecord が消える
 *  - mypage 顧客返信から audit が消える
 *  - Customer を User FK と誤って userId: session.user.id を直書きする
 *    （D7 は userId 省略 = null、customerId / channel を metadata へ）
 *
 * 動的 action 実行ではなく静的 source scan で強制する（bulk-audit-coverage と同型）。
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");

type PublicAuditTarget = {
  file: string;
  exportName: string;
  resource: string;
  action: "CREATE" | "UPDATE";
  channel: string;
};

const REQUIRED: PublicAuditTarget[] = [
  {
    file: "src/app/(public)/_shared/actions/reservation.ts",
    exportName: "submitReservation",
    resource: "reservation",
    action: "CREATE",
    channel: "public",
  },
  {
    file: "src/app/(public)/_shared/actions/event-registration.ts",
    exportName: "registerForEvent",
    resource: "event-registration",
    action: "CREATE",
    channel: "public",
  },
  {
    file: "src/app/(public)/events/waitlist/confirm/_actions/confirm.ts",
    exportName: "confirmWaitlistOfferAction",
    resource: "event-registration",
    action: "UPDATE",
    channel: "public",
  },
  {
    file: "src/app/(public)/_shared/actions/inquiry.ts",
    exportName: "submitInquiry",
    resource: "inquiry",
    action: "CREATE",
    channel: "public",
  },
  {
    file: "src/app/(public)/_shared/actions/review.ts",
    exportName: "submitReview",
    resource: "review",
    action: "CREATE",
    channel: "public",
  },
  {
    file: "src/app/(public)/mypage/_shared/actions/inquiry.ts",
    exportName: "replyToInquiryAction",
    resource: "inquiry",
    action: "UPDATE",
    channel: "customer-mypage",
  },
];

function extractFunctionBody(source: string, name: string): string | null {
  const declRegex = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(`);
  const declMatch = declRegex.exec(source);
  if (!declMatch) return null;

  let i = declMatch.index + declMatch[0].length;
  let paren = 1;
  while (i < source.length && paren > 0) {
    const ch = source[i];
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    i++;
  }
  while (i < source.length && source[i] !== "{") i++;
  if (source[i] !== "{") return null;
  let brace = 1;
  const bodyStart = i + 1;
  i++;
  while (i < source.length && brace > 0) {
    const ch = source[i];
    if (ch === "{") brace++;
    else if (ch === "}") brace--;
    i++;
  }
  if (brace !== 0) return null;
  return source.slice(bodyStart, i - 1);
}

describe("public CREATE / mypage reply emit minimal AuditLog (D7)", () => {
  for (const target of REQUIRED) {
    test(`${target.file} :: ${target.exportName}`, () => {
      const abs = resolve(REPO_ROOT, target.file);
      expect(existsSync(abs)).toBe(true);
      const source = readFileSync(abs, "utf8");
      const body = extractFunctionBody(source, target.exportName);
      expect(body).not.toBeNull();
      if (body === null) return;

      expect(body).toContain("createAuditLogRecord(");
      expect(body).toContain(`AuditAction.${target.action}`);
      expect(body).toContain(`resource: "${target.resource}"`);
      expect(body).toContain(`channel: "${target.channel}"`);
      // D7: Customer 経路は userId を付けない（null = システム/未認証扱い）。
      expect(body).not.toMatch(/userId:\s*session\.user\.id/);
      expect(body).not.toMatch(/userId:\s*user\.id/);
    });
  }
});
