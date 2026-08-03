/**
 * `emailFieldSchema` の長さ上限と、conform 制約が残ることの検証。
 *
 * **守る不変条件**:
 *   1. メールアドレスは 254 文字（RFC 5321 の forward-path 256 バイトから山括弧 2 つ）
 *      を超えられない
 *   2. その上限が conform の `getZodConstraint` に `maxLength` として出る
 *
 * 上限が無いと、DB 側の最狭列（`event_registrations.email` /
 * `terms_agreements.guestEmail` の VarChar(255)）に対して長いアドレスが P2000 になる。
 * 領収書の `subject` / `recipientName` で実際に起きたのと同じ形で、例外は DomainError に
 * ならないので webhook が 500 を返し続ける。
 *
 * 2 が要るのは、この helper の docblock が説明している落とし穴のため。`.refine()` を
 * `.pipe(z.email())` に書き換えると ZodString のチェーンが閉じ、値の検証は効いたまま
 * conform が `maxLength` を拾えなくなって入力欄から `maxlength` 属性が消える
 * （実測で確認。`.max()` と `.refine()` の前後は制約出力に影響しない）。
 * 「動いているが制約が UI に出ない」状態は目視では気づけないので、ここで固定する。
 */

import { describe, expect, test } from "bun:test";
import { getZodConstraint } from "@conform-to/zod/v4";
import { z } from "zod";

import { emailFieldSchema } from "@/shared/lib/validations/customer-shared-fields";

/** RFC 5321: forward-path は 256 バイト、山括弧 2 つを除いて 254。 */
const EMAIL_MAX = 254;

function emailOfLength(total: number): string {
  const suffix = "@example.com";
  return "a".repeat(total - suffix.length) + suffix;
}

describe("emailFieldSchema の長さ上限", () => {
  test("254 文字ちょうどは通る", () => {
    const value = emailOfLength(EMAIL_MAX);
    expect(value.length).toBe(EMAIL_MAX);
    expect(emailFieldSchema.safeParse(value).success).toBe(true);
  });

  test("255 文字は拒否される（DB の最狭列 VarChar(255) に収まる）", () => {
    const value = emailOfLength(EMAIL_MAX + 1);
    expect(value.length).toBe(EMAIL_MAX + 1);

    const result = emailFieldSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(
      result.success === false ? result.error.issues[0]?.message : "",
    ).toBe("メールアドレスは254文字以内で入力してください");
  });

  test("前後の空白は trim されてから長さを見る", () => {
    // `.trim()` が `.max()` より前にあることの確認。実測で、逆順にすると
    // 空白込みで数えてこのテストが落ちる。
    const value = `  ${emailOfLength(EMAIL_MAX)}  `;
    expect(emailFieldSchema.safeParse(value).success).toBe(true);
  });

  test("conform の制約に maxLength が出る", () => {
    // 実測で、`.refine()` を `.pipe(z.email())` に置き換えるとここが undefined になる。
    const constraint = getZodConstraint(z.object({ email: emailFieldSchema }));
    expect(constraint["email"]?.maxLength).toBe(EMAIL_MAX);
  });
});
