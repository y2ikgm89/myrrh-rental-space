/**
 * EMAIL_TEMPLATE_REGISTRY の全エントリが fixture で例外なくレンダリングできることを確認する
 * (audit finding #14)
 *
 * @react-email/render の render() を使って各テンプレを実際に HTML 文字列まで変換する。
 * server-only / sendEmail は unit テストのため stub 化する。
 *
 * 検証観点:
 * - registry の各エントリについて renderPreview() が例外を投げない
 * - @react-email/render の render() が空でない HTML 文字列を返す
 * - 全 29 エントリを網羅していること
 */

import { describe, test, expect } from "bun:test";

// -----------------------------------------------------------------------
// server-only / sendEmail をモック (registry は server-only を import するため)
// -----------------------------------------------------------------------

import { mock } from "bun:test";

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: async () => ({ ok: true, messageId: "mock-id" }),
}));

// -----------------------------------------------------------------------
// registry / render を動的 import（mock.module より後）
// -----------------------------------------------------------------------

const { EMAIL_TEMPLATE_REGISTRY } =
  await import("@/shared/emails/_registry/index");
const { render } = await import("@react-email/render");

// -----------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------

describe("EMAIL_TEMPLATE_REGISTRY — 全エントリのレンダリング検証", () => {
  const entries = Object.entries(EMAIL_TEMPLATE_REGISTRY) as [
    string,
    { renderPreview: () => import("react").ReactElement },
  ][];

  test("registry に 29 エントリ以上あること（全テンプレを網羅）", () => {
    // 現時点で 29 エントリ定義済み。新規追加時は自動検知。
    expect(entries.length).toBeGreaterThanOrEqual(29);
  });

  for (const [key, entry] of entries) {
    test(`[${key}] renderPreview() が例外を投げない`, () => {
      expect(() => entry.renderPreview()).not.toThrow();
    });

    test(`[${key}] @react-email/render で HTML 文字列に変換できる`, async () => {
      const element = entry.renderPreview();
      const html = await render(element, { pretty: false });
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
      // react-email は必ず doctype を出力する
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  }
});
