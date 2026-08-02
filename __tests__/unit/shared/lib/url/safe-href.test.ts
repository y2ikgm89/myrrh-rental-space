import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { getZodConstraint } from "@conform-to/zod/v4";
import {
  externalPublicHrefSchema,
  internalNavHrefSchema,
  isExternalPublicHref,
  isHttpOrInternalPublicHref,
  isInternalNavHref,
  isSafePublicHref,
  optionalHttpOrInternalHrefSchema,
  optionalSafePublicHrefSchema,
  toSafePublicHref,
} from "@/shared/lib/url/safe-href";

describe("isSafePublicHref", () => {
  test("allows internal app routes", () => {
    expect(isSafePublicHref("/")).toBe(true);
    expect(isSafePublicHref("/about")).toBe(true);
    expect(isSafePublicHref("/blog/post-1")).toBe(true);
  });

  test("rejects protocol-relative and dangerous schemes", () => {
    expect(isSafePublicHref("//evil.example")).toBe(false);
    expect(isSafePublicHref("/\\evil.example")).toBe(false);
    expect(isSafePublicHref("/%5Cevil.example")).toBe(false);
    expect(isSafePublicHref("javascript:alert(1)")).toBe(false);
    expect(isSafePublicHref("data:text/html,hi")).toBe(false);
    expect(isSafePublicHref("vbscript:x")).toBe(false);
  });

  test("allows http(s)/mailto/tel", () => {
    expect(isSafePublicHref("https://example.com")).toBe(true);
    expect(isSafePublicHref("http://example.com")).toBe(true);
    expect(isSafePublicHref("mailto:a@example.com")).toBe(true);
    expect(isSafePublicHref("tel:+819012345678")).toBe(true);
  });

  test("rejects leading/trailing whitespace", () => {
    expect(isSafePublicHref(" /about")).toBe(false);
    expect(isSafePublicHref("/about ")).toBe(false);
  });
});

describe("isInternalNavHref / isExternalPublicHref", () => {
  test("internal requires app route", () => {
    expect(isInternalNavHref("/spaces")).toBe(true);
    expect(isInternalNavHref("https://example.com")).toBe(false);
  });

  test("external rejects relative paths", () => {
    expect(isExternalPublicHref("https://example.com")).toBe(true);
    expect(isExternalPublicHref("/spaces")).toBe(false);
    expect(isExternalPublicHref("javascript:alert(1)")).toBe(false);
  });

  test("rejects leading/trailing whitespace", () => {
    // `new URL(" https://x")` は WHATWG 仕様どおり空白を捨てて解釈するので、
    // scheme だけ見る実装だとここが true になってしまう。
    expect(isExternalPublicHref(" https://example.com")).toBe(false);
    expect(isExternalPublicHref("https://example.com ")).toBe(false);
    expect(isHttpOrInternalPublicHref(" https://example.com")).toBe(false);
    expect(isHttpOrInternalPublicHref(" /about")).toBe(false);
  });
});

/**
 * 保存側の述語が通した href は、描画側の `toSafePublicHref` も通さなければならない。
 *
 * 破れると**管理者にはエラーが出ないまま、公開ページのリンクだけが href 無しで
 * 描画される**。実際 `isExternalPublicHref` が前後の空白を許していたため、
 * ナビゲーションに `" https://example.com"` を貼り付けると保存は成功し、
 * 公開側ではリンクが消えていた。
 *
 * **候補ごとに期待値を持たせる。** 以前は
 * `if (保存側が true) expect(描画も通る)` と書いていたため、拒否される候補では
 * 本体が実行されず 15 件中 9 件が空振りしていた。その形だと「全部拒否」に
 * 変わっても全件 pass する。
 */
describe("保存と描画の判定が一致する", () => {
  // 見えない文字はソースに直接書かない。エスケープ表記も端末やレビュー画面で
  // 実文字と見分けがつかないので、コードポイントを数値で書く。
  const TAB = String.fromCharCode(0x09);
  const C0 = String.fromCharCode(0x01);
  const CASES: ReadonlyArray<readonly [string, boolean]> = [
    ["https://example.com", true],
    ["http://example.com", true],
    ["mailto:a@example.com", true],
    ["tel:+819012345678", true],
    ["/about", true],
    ["/", true],
    [" https://example.com", false],
    ["https://example.com ", false],
    [`${TAB}https://example.com`, false],
    // `new URL()` は C0 制御文字も捨てて解釈するので、保存側もそこへ揃える。
    // 揃えないと制御文字ごと保存され、href にそのまま出る。
    [`${C0}https://example.com`, false],
    [`https://example.com${C0}`, false],
    [" /about", false],
    ["/about ", false],
    ["//evil.example", false],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["", false],
  ];

  for (const [value, accepted] of CASES) {
    test(`${JSON.stringify(value)} -> ${accepted ? "受理" : "拒否"}`, () => {
      const savable = isExternalPublicHref(value) || isInternalNavHref(value);
      expect(savable).toBe(accepted);
      // 保存を通るなら描画もそのまま通る。通らないなら描画も null。
      expect(toSafePublicHref(value)).toBe(accepted ? value : null);
    });
  }
});

describe("schemas", () => {
  test("internalNavHrefSchema", () => {
    expect(internalNavHrefSchema.safeParse("/ok").success).toBe(true);
    expect(internalNavHrefSchema.safeParse("https://x.com").success).toBe(
      false,
    );
  });

  test("externalPublicHrefSchema", () => {
    expect(externalPublicHrefSchema.safeParse("https://x.com").success).toBe(
      true,
    );
    expect(externalPublicHrefSchema.safeParse("/ok").success).toBe(false);
    expect(
      externalPublicHrefSchema.safeParse("javascript:alert(1)").success,
    ).toBe(false);
  });

  test("貼り付けに紛れた前後の空白は正規化して受け入れる", () => {
    // 述語は空白付きを拒否するので、schema が先に落とさないと通らない。
    // 空白は入力の不備であって拒否の理由ではないため、ここで正規化する。
    const external = externalPublicHrefSchema.safeParse(" https://x.com ");
    expect(external.success).toBe(true);
    expect(external.success && external.data).toBe("https://x.com");

    const internal = internalNavHrefSchema.safeParse("  /ok  ");
    expect(internal.success).toBe(true);
    expect(internal.success && internal.data).toBe("/ok");

    // 空白だけの入力は `.min(1)` に落ちる（`.trim()` が先に効くため）
    expect(externalPublicHrefSchema.safeParse("   ").success).toBe(false);
    expect(internalNavHrefSchema.safeParse("   ").success).toBe(false);
  });

  // 未入力は空文字ひとつで表す。`null` は**受け付けない**（破壊的変更）。
  // 保存経路は `data.linkUrl || undefined` で `null` を書かず、保存済み JSON にも
  // `linkUrl: null` は無い。DB 列の NULL 化は保存側の責務。
  test("optionalSafePublicHrefSchema は未入力と安全な URL を受け、null は拒否する", () => {
    expect(optionalSafePublicHrefSchema.safeParse(undefined).success).toBe(
      true,
    );
    expect(optionalSafePublicHrefSchema.safeParse("").success).toBe(true);
    expect(optionalSafePublicHrefSchema.safeParse("   ")).toMatchObject({
      success: true,
      data: "",
    });
    expect(optionalSafePublicHrefSchema.safeParse(null).success).toBe(false);
    expect(optionalSafePublicHrefSchema.safeParse("/contact").success).toBe(
      true,
    );
    expect(
      optionalSafePublicHrefSchema.safeParse("javascript:alert(1)").success,
    ).toBe(false);
  });

  // 「任意なのに required」を出す形に戻らないことを固定する。conform はこの制約を
  // そのまま input に載せるので、union 形だと linkUrl だけ必須表示になっていた。
  test("任意 href は conform に required を出さず maxLength を保つ", () => {
    for (const schema of [
      optionalHttpOrInternalHrefSchema,
      optionalSafePublicHrefSchema,
      optionalHttpOrInternalHrefSchema,
    ]) {
      expect(getZodConstraint(z.object({ u: schema }))["u"]).toEqual({
        required: false,
        maxLength: 500,
      });
    }
  });
});

describe("toSafePublicHref", () => {
  test("returns null for unsafe values", () => {
    expect(toSafePublicHref("javascript:alert(1)")).toBeNull();
    expect(toSafePublicHref(null)).toBeNull();
    expect(toSafePublicHref("/ok")).toBe("/ok");
  });
});
