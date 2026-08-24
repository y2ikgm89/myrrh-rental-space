import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE,
  MERGE_SUCCESS_MESSAGE,
  classifyCustomerMergeConfirmError,
  isMergeSuccessQuery,
  mergeConfirmWarningText,
} from "@/app/(public)/mypage/_shared/merge-query";
import { DomainError } from "@/shared/domain/domain-error";
import {
  REAGREE_PATH,
  ReagreeRequiredError,
} from "@/shared/domain/terms/reagree-error";

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

  /**
   * 監査 A-79。`FORBIDDEN` は 2 つの別の状態から投げられるので、
   * code だけで分類すると**自力で解決できる状態がアカウント停止に丸められる**。
   */
  test("再同意 pending とアカウント停止を別の sentinel に分ける", () => {
    expect(
      classifyCustomerMergeConfirmError(
        new ReagreeRequiredError("利用規約が更新されています"),
      ),
    ).toBe("reagree");

    // 停止 / BLACKLIST は従来どおり inactive。
    expect(
      classifyCustomerMergeConfirmError(
        new DomainError("このアカウントは停止されています", "FORBIDDEN"),
      ),
    ).toBe("inactive");

    expect(
      classifyCustomerMergeConfirmError(new DomainError("不正", "VALIDATION")),
    ).toBe("invalid");
  });

  test("再同意の文言は問い合わせではなく導線を示す", () => {
    const text = mergeConfirmWarningText("reagree");
    expect(text).toContain(REAGREE_PATH);
    // 自力で解決できるのに問い合わせへ流さない。
    expect(text).not.toContain("お問い合わせ");
    expect(text).not.toBe(MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE);
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
