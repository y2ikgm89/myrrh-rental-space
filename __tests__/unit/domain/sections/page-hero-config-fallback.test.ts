/**
 * `getPageHeroConfig` は他の section と同じく、読めない config を既定値に落とす。
 *
 * page-hero だけは discriminated union なので `safeParse({})` が成立しない
 * （Zod 4 では discriminator が default 適用より前に照合されるため、構造上不可避）。
 * それを踏まえずに空オブジェクトを fallback にしていたため、`section-renderer` が
 * **公開ページの描画中に throw** していた。他の section はすべて既定値へ degrade する。
 *
 * 旧 variant を含めるのは、`media` variant が 2026-05-24 に `video` からリネーム
 * されており、その値を持つ行がデータ移行なしで残りうるため。
 */

import { describe, expect, test } from "bun:test";
import {
  getPageHeroConfig,
  getHeroConfig,
} from "@/shared/lib/validations/section-defaults";

describe("getPageHeroConfig", () => {
  test("正しい variant はそのまま通す（これが false なら probe 自体が誤り）", () => {
    expect(getPageHeroConfig({ variant: "minimal" })).toMatchObject({
      variant: "minimal",
    });
  });

  for (const [label, config] of [
    ["空 config", {}],
    ["variant 欠落", { title: [] }],
    ["旧 variant", { variant: "video" }],
    ["未知の variant", { variant: "legacy-v1" }],
    ["config が null", null],
  ] as Array<[string, unknown]>) {
    test(`${label}でも throw せず既定値へ落ちる`, () => {
      expect(() => getPageHeroConfig(config)).not.toThrow();
      expect(getPageHeroConfig(config)).toHaveProperty("variant");
    });
  }

  test("他の section と同じ振る舞いになっている", () => {
    expect(() => getHeroConfig({})).not.toThrow();
    expect(() => getPageHeroConfig({})).not.toThrow();
  });
});
