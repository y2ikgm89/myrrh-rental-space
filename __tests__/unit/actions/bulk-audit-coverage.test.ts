/**
 * bulk 系 admin Server Action は per-entity の AuditLog を必ず発火する。
 *
 * 検出したい regression:
 *  - single-op sibling が createAuditLogRecord を per-id で出しているのに
 *    bulk 経路だけ集約 audit で済ませてしまう pattern drift
 *  - SSoT helper (emitBulkAuditRecords / applyCancellationSideEffects /
 *    applyBulkCancellationSideEffects) を経由せず、素の updateMany のみで
 *    副作用と audit を skip する回帰
 *
 * 動的な action 実行ではなく静的 source scan で強制する: 各 bulk action の
 * 関数 body 内に、per-id audit を発火する SSoT 呼出しのいずれかが現れるかを
 * regex で検査する (function scope に閉じているので、同一ファイル内の別
 * export が呼んでいる場合は検出しない = 誤陽性を減らす。false positive の
 * リスクは helper 名を変えたときに fail するのみで、修正は helper 呼出しの
 * 追加で解決できる)。
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { definite } from "../../support/definite";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");

/** SSoT helper のいずれかが body 中に現れれば per-id audit と見なす。 */
const PER_ID_AUDIT_MARKERS = [
  "emitBulkAuditRecords(",
  "applyCancellationSideEffects(",
  "applyBulkCancellationSideEffects(",
] as const;

type BulkAction = {
  file: string;
  exports: readonly string[];
};

const REQUIRED: BulkAction[] = [
  {
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/bulk.ts",
    exports: ["bulkConfirmReservations", "bulkCancelReservations"],
  },
  {
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts",
    exports: [
      "bulkToggleActiveCustomers",
      "bulkAnonymizeCustomers",
      "bulkSetStatusCustomers",
    ],
  },
  {
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/space/bulk.ts",
    exports: ["bulkTogglePublishedSpaces", "bulkDeleteSpaces"],
  },
  {
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/post/bulk.ts",
    exports: ["bulkTogglePostPublished", "bulkDeletePosts"],
  },
  {
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/news/bulk.ts",
    exports: ["bulkTogglePublishedNews", "bulkDeleteNews"],
  },
  {
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk.ts",
    exports: [
      "bulkPublishEvents",
      "bulkSoftDeleteEvents",
      "bulkSetStatusEvents",
    ],
  },
  {
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry/bulk.ts",
    exports: ["bulkDeleteInquiries", "bulkSetStatusInquiries"],
  },
];

function extractFunctionBody(source: string, name: string): string | null {
  const declRegex = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(`);
  const declMatch = declRegex.exec(source);
  if (!declMatch) return null;

  // Find the opening brace of the function body, then scan for the matching close.
  let i = declMatch.index + declMatch[0].length;
  // Skip parameter list — track parens.
  let paren = 1;
  while (i < source.length && paren > 0) {
    const ch = source[i];
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    i++;
  }
  // Optional return annotation before the body. Advance until first `{`.
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

describe("bulk admin actions emit per-id AuditLog", () => {
  for (const target of REQUIRED) {
    for (const name of target.exports) {
      test(`${target.file} :: ${name}`, () => {
        const abs = resolve(REPO_ROOT, target.file);
        expect(existsSync(abs)).toBe(true);
        const source = readFileSync(abs, "utf8");
        const body = extractFunctionBody(source, name);
        expect(body).not.toBeNull();
        const hasMarker = PER_ID_AUDIT_MARKERS.some((marker) =>
          definite(body, "action の本文").includes(marker),
        );
        expect(hasMarker).toBe(true);
      });
    }
  }
});
