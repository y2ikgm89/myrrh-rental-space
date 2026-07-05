/**
 * 回帰テスト: お知らせバー / ナビゲーション フォームの「空欄保存」
 *
 * conform の `parseWithZod`（@conform-to/zod/v4）は空入力を `undefined` に変換する。
 * `barFormSchema` の任意項目（linkUrl / linkText / startAt / endAt）は当初
 * `.or(z.literal(""))` ないし bare `z.string()` のままで `.optional()` を欠いており、
 * 「リンク・日時なしのメッセージだけのお知らせバー」が
 * 「Invalid input / expected string, received undefined」で保存不能だった。
 *
 * 任意項目に `.optional()` を付与し undefined を許容する必要がある（空 → null 化は
 * Server Action `toAnnouncementBarInput` の `|| null` で実施）。ここで実体スキーマを
 * import し FormData 経由で固定する（修正を外すと本テストが落ちる）。
 *
 * navFormSchema / socialFormSchema は `parentId="none"` 送出・`z.preprocess` boolean で
 * 元から空欄/OFF 安全だが、回帰ガードとして success を固定する。
 */
import { describe, test, expect } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import { barFormSchema } from "@/app/(admin)/admin/(dashboard)/settings/appearance/_components/announcement-bar/bar-form-schema";
import {
  navFormSchema,
  socialFormSchema,
} from "@/app/(admin)/admin/(dashboard)/settings/appearance/_components/navigation/nav-form-schema";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

const validMessage = JSON.stringify([
  { _key: "k1", _type: "span", text: "お知らせ本文" },
]);
const validLabel = JSON.stringify([
  { _key: "k1", _type: "span", text: "メニュー" },
]);

describe("barFormSchema（お知らせバー）", () => {
  test("リンク無し・日時無し（message のみ）で保存できる", () => {
    const submission = parseWithZod(
      form({
        message: validMessage,
        linkUrl: "",
        linkText: "",
        isActive: "on",
        startAt: "",
        endAt: "",
      }),
      { schema: barFormSchema },
    );
    expect(submission.status).toBe("success");
  });

  test("OFF（isActive 空）・空欄リンクでも保存できる", () => {
    const submission = parseWithZod(
      form({
        message: validMessage,
        linkUrl: "",
        linkText: "",
        isActive: "",
        startAt: "",
        endAt: "",
      }),
      { schema: barFormSchema },
    );
    expect(submission.status).toBe("success");
  });

  test("リンク・日時を入力した場合も保存できる", () => {
    const submission = parseWithZod(
      form({
        message: validMessage,
        linkUrl: "https://example.com",
        linkText: "詳細はこちら",
        isActive: "on",
        startAt: "2026-07-01T09:00",
        endAt: "2026-07-31T18:00",
      }),
      { schema: barFormSchema },
    );
    expect(submission.status).toBe("success");
  });

  test("不正な URL は弾く（境界）", () => {
    const submission = parseWithZod(
      form({
        message: validMessage,
        linkUrl: "not-a-url",
        linkText: "",
        isActive: "on",
        startAt: "",
        endAt: "",
      }),
      { schema: barFormSchema },
    );
    expect(submission.status).toBe("error");
  });
});

describe("navFormSchema / socialFormSchema（回帰ガード）", () => {
  test("ナビ: トップレベル（parentId=none）・外部リンク OFF で保存できる", () => {
    const submission = parseWithZod(
      form({
        type: "HEADER_DESKTOP",
        parentId: "none",
        label: validLabel,
        url: "/about",
        isExternal: "",
        isActive: "on",
      }),
      { schema: navFormSchema },
    );
    expect(submission.status).toBe("success");
  });

  test("SNS: 表示トグルを全 OFF にしても保存できる", () => {
    const submission = parseWithZod(
      form({
        platform: "INSTAGRAM",
        url: "https://example.com",
        isActive: "",
        showOnDesktop: "",
        showOnMobile: "",
      }),
      { schema: socialFormSchema },
    );
    expect(submission.status).toBe("success");
  });

  test("ナビ: 旧 order hidden input は拒否する", () => {
    const submission = parseWithZod(
      form({
        type: "HEADER_DESKTOP",
        parentId: "none",
        label: validLabel,
        url: "/about",
        isExternal: "",
        order: "0",
        isActive: "on",
      }),
      { schema: navFormSchema },
    );
    expect(submission.status).toBe("error");
  });

  test("SNS: 旧 order hidden input は拒否する", () => {
    const submission = parseWithZod(
      form({
        platform: "INSTAGRAM",
        url: "https://example.com",
        order: "0",
        isActive: "",
        showOnDesktop: "",
        showOnMobile: "",
      }),
      { schema: socialFormSchema },
    );
    expect(submission.status).toBe("error");
  });
});
