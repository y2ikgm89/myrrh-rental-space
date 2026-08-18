/**
 * `.env.local` の空 ENCRYPTION_KEY を local setup が埋める。
 *
 * `.env.example` 由来の `ENCRYPTION_KEY=""` は `serverEnv` の
 * `emptyStringAsUndefined: true` で未設定扱いになる。SwitchBot / Stripe /
 * Resend の秘密情報を保存すると `getPrimaryEncryptionKey()` が throw する。
 */

import { describe, expect, test } from "bun:test";

import { fillMissingEncryptionKey } from "../../../scripts/setup-local";

const GENERATED = "ab".repeat(32);

describe("fillMissingEncryptionKey", () => {
  test('空の引用値 ENCRYPTION_KEY="" を 64-hex で埋める', () => {
    const result = fillMissingEncryptionKey(
      'ENCRYPTION_KEY=""\n',
      () => GENERATED,
    );

    expect(result.generated).toBe(true);
    expect(result.content).toBe(`ENCRYPTION_KEY="${GENERATED}"\n`);
    expect(GENERATED).toHaveLength(64);
    expect(GENERATED).toMatch(/^[0-9a-f]{64}$/u);
  });

  test("ENCRYPTION_KEY 行が無いときは末尾に追記する", () => {
    const input = 'DATABASE_URL="postgres://localhost"';
    const result = fillMissingEncryptionKey(input, () => GENERATED);

    expect(result.generated).toBe(true);
    expect(result.content).toBe(`${input}\nENCRYPTION_KEY="${GENERATED}"`);
  });

  test("既に非空の値があるときは content を変えず generated: false", () => {
    const input = 'ENCRYPTION_KEY="already-set"\nOTHER="x"\n';
    const result = fillMissingEncryptionKey(input, () => GENERATED);

    expect(result.generated).toBe(false);
    expect(result.content).toBe(input);
  });

  test("無関係な行とコメントは変えない", () => {
    const input = [
      "# local secrets",
      'DATABASE_URL="postgres://localhost"',
      'ENCRYPTION_KEY=""',
      'STRIPE_SECRET_KEY=""',
      "",
    ].join("\n");

    const result = fillMissingEncryptionKey(input, () => GENERATED);

    expect(result.generated).toBe(true);
    expect(result.content).toBe(
      [
        "# local secrets",
        'DATABASE_URL="postgres://localhost"',
        `ENCRYPTION_KEY="${GENERATED}"`,
        'STRIPE_SECRET_KEY=""',
        "",
      ].join("\n"),
    );
  });
});
