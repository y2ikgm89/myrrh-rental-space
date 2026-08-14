import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE,
  MERGE_SUCCESS_MESSAGE,
  isMergeSuccessQuery,
  mergeConfirmWarningText,
} from "@/app/(public)/mypage/_shared/merge-query";

const ROOT = process.cwd();

describe("merge confirm query sentinels", () => {
  test("maps known error sentinels and defaults unknown values", () => {
    expect(mergeConfirmWarningText("rate_limit")).toBe(
      "リクエストが多すぎます。しばらく経ってから再度お試しください。",
    );
    expect(mergeConfirmWarningText("invalid")).toBe(
      MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE,
    );
    expect(mergeConfirmWarningText("expired")).toBe(
      MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE,
    );
    expect(mergeConfirmWarningText("inactive")).toBe(
      "このアカウントは現在ご利用いただけません。お手数ですがお問い合わせフォームよりご連絡ください。",
    );

    const phishing = "今すぐ http://evil.example に連絡してください";
    expect(mergeConfirmWarningText(phishing)).toBe(
      MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE,
    );
    expect(mergeConfirmWarningText(phishing)).not.toBe(phishing);
    expect(mergeConfirmWarningText(null)).toBeNull();
  });

  test("only the merged=ok sentinel is a success flash", () => {
    expect(isMergeSuccessQuery("ok")).toBe(true);
    expect(
      isMergeSuccessQuery(
        "履歴の統合が完了しました。マイページからご確認ください。",
      ),
    ).toBe(false);
    expect(isMergeSuccessQuery(undefined)).toBe(false);
    expect(MERGE_SUCCESS_MESSAGE).toBe(
      "履歴の統合が完了しました。マイページからご確認ください。",
    );
  });

  test("mypage shows FlashMessage for merged=ok and confirm ignores raw error", () => {
    const mypage = readFileSync(
      join(ROOT, "src", "app", "(public)", "mypage", "page.tsx"),
      "utf8",
    );
    expect(mypage).toMatch(/queryKey=["']merged["']/u);
    expect(mypage).toMatch(/isMergeSuccessQuery/u);
    expect(mypage).toMatch(/MERGE_SUCCESS_MESSAGE/u);
    expect(mypage).not.toMatch(/mergeSuccess/u);

    const confirm = readFileSync(
      join(
        ROOT,
        "src",
        "app",
        "(public)",
        "mypage",
        "merge",
        "confirm",
        "page.tsx",
      ),
      "utf8",
    );
    expect(confirm).toMatch(/mergeConfirmWarningText/u);
    expect(confirm).not.toMatch(/: actionError\}/u);
  });
});
