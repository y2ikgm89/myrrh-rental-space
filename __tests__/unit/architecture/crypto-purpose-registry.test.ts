/**
 * crypto.ts の HKDF purpose 文字列がリポジトリ全体で重複していないことを確認する回帰テスト。
 *
 * `SETTINGS_CRYPTO_PURPOSES`（Settings テーブル系）に加え、他ドメインの purpose
 * （予約キャンセル/完了トークン・Instagram・カレンダートークン・crypto.ts の
 * デフォルト値）も列挙し、全体で衝突がないことを確認する。
 * これらの他ドメインは今回の Settings リファクタ対象外のため単一ソース化していないが、
 * 衝突チェックの対象には含める。
 *
 * purpose が衝突しても decrypt() 自体は暗号文自身の purpose に従うため壊れないが
 * （[[project_crypto-token-purpose-cross-use]]）、同一の派生鍵を意図せず共有することになり、
 * 呼び出し側が purpose 一致を明示検証していない箇所では目的外 ciphertext の誤受理に
 * つながりうる。新しい purpose を追加する際は本テストが重複を機械的に検出する。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, test, expect } from "bun:test";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { purposeFor } from "@/shared/lib/calendar/calendar-token";

const OTHER_DOMAIN_PURPOSES = [
  "generic", // crypto.ts の DEFAULT_PURPOSE
  "reservation-cancel", // reservation-cancel-token.ts
  "reservation-complete", // reservation-complete-token.ts
  "reservation-status", // reservation-status-token.ts
  "event-registration-cancel", // event-registration-cancel-token.ts
  "event-registration-status", // event-registration-status-token.ts

  "reservation-claim", // reservation-claim-token.ts
  "event-registration-claim", // event-registration-claim-token.ts
  "event-waitlist-offer", // tokens/waitlist-offer-token.ts
  "instagram", // instagram/commands.ts
  "switchbot-guest-passcode", // smart-lock/issue-passcode.ts
  purposeFor("reservation"), // calendar-token.ts
  purposeFor("event"), // calendar-token.ts

  // Phase C 監査で判明: 以下3件は encrypt() 呼び出しで固有 purpose を持つが
  // このリストに列挙されておらず、衝突検出の死角になっていた
  "marketing-unsubscribe", // tokens/marketing-unsubscribe-token.ts
  "event-registration-payment", // tokens/event-registration-payment-token.ts
  "receipt-download", // receipt-download-token.ts
];

describe("crypto purpose registry", () => {
  test("SETTINGS_CRYPTO_PURPOSES は期待通り12種類ちょうど", () => {
    expect(Object.keys(SETTINGS_CRYPTO_PURPOSES)).toHaveLength(12);
  });

  test("SETTINGS_CRYPTO_PURPOSES 単体で重複がない", () => {
    const values = Object.values(SETTINGS_CRYPTO_PURPOSES);
    expect(new Set(values).size).toBe(values.length);
  });

  test("他ドメインの purpose を含めた全体でも重複がない", () => {
    const all = [
      ...Object.values(SETTINGS_CRYPTO_PURPOSES),
      ...OTHER_DOMAIN_PURPOSES,
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  /**
   * 鍵ローテーションの runbook は「何を再暗号化すれば終わりか」を読む場所で、
   * 実測時は 14 列あるうち 5 つしか挙げていなかった（しかも実在しない model 名で）。
   * 落とした列は、旧 kid を secondary list から外した瞬間に読めなくなる。
   *
   * runbook は列名を並べるのではなく registry を SSoT として指すが、件数だけは
   * 本文に出る。purpose を増やしたら runbook を読み直す、をここで強制する。
   */
  test("鍵ローテーション runbook の件数が registry と一致する", () => {
    const runbook = readFileSync(
      join(process.cwd(), "docs", "runbooks", "encryption-key-rotation.md"),
      "utf8",
    );
    const count = Object.keys(SETTINGS_CRYPTO_PURPOSES).length;
    expect(runbook).toContain(
      `the ${count} integration secrets registered in\n  \`src/shared/lib/crypto-purposes.ts\``,
    );
    expect(runbook).toContain(`The ${count} settings columns in`);
  });

  test("calendar-token.ts の動的 purpose が Settings 系と衝突しない", () => {
    const settingsValues = new Set<string>(
      Object.values(SETTINGS_CRYPTO_PURPOSES),
    );
    expect(settingsValues.has(purposeFor("reservation"))).toBe(false);
    expect(settingsValues.has(purposeFor("event"))).toBe(false);
  });
});
