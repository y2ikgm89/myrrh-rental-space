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

import { describe, test, expect } from "bun:test";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { purposeFor } from "@/shared/lib/calendar/calendar-token";

const OTHER_DOMAIN_PURPOSES = [
  "generic", // crypto.ts の DEFAULT_PURPOSE
  "reservation-cancel", // reservation-cancel-token.ts
  "reservation-complete", // reservation-complete-token.ts
  "instagram", // instagram/commands.ts
  purposeFor("reservation"), // calendar-token.ts
  purposeFor("event"), // calendar-token.ts
];

describe("crypto purpose registry", () => {
  test("SETTINGS_CRYPTO_PURPOSES は期待通り8種類ちょうど", () => {
    expect(Object.keys(SETTINGS_CRYPTO_PURPOSES)).toHaveLength(8);
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

  test("calendar-token.ts の動的 purpose が Settings 系と衝突しない", () => {
    const settingsValues = new Set<string>(
      Object.values(SETTINGS_CRYPTO_PURPOSES),
    );
    expect(settingsValues.has(purposeFor("reservation"))).toBe(false);
    expect(settingsValues.has(purposeFor("event"))).toBe(false);
  });
});
