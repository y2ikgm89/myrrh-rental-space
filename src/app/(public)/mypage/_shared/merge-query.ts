import { DomainError } from "@/shared/domain/domain-error";

export const MERGE_SUCCESS_QUERY_KEY = "merged";
export const MERGE_SUCCESS_SENTINEL = "ok";

export const MERGE_SUCCESS_MESSAGE =
  "履歴の統合が完了しました。マイページからご確認ください。";

export const MERGE_ERROR_SENTINELS = [
  "rate_limit",
  "invalid",
  "expired",
  "inactive",
] as const;

export type MergeErrorSentinel = (typeof MERGE_ERROR_SENTINELS)[number];

export const MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE =
  "確認 URL が無効または期限切れです";

const MERGE_CONFIRM_ERROR_MESSAGES: Record<MergeErrorSentinel, string> = {
  rate_limit: "リクエストが多すぎます。しばらく経ってから再度お試しください。",
  invalid: MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE,
  expired: MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE,
  inactive:
    "このアカウントは現在ご利用いただけません。お手数ですがお問い合わせフォームよりご連絡ください。",
};

const MERGE_ERROR_SENTINEL_SET = new Set<string>(MERGE_ERROR_SENTINELS);

export function isMergeSuccessQuery(value: unknown): boolean {
  return value === MERGE_SUCCESS_SENTINEL;
}

export function isMergeErrorSentinel(
  value: unknown,
): value is MergeErrorSentinel {
  return typeof value === "string" && MERGE_ERROR_SENTINEL_SET.has(value);
}

/**
 * confirm ページの警告文。未知の `error` は既定文言に倒し、
 * クエリの生文字列は返さない。
 */
export function mergeConfirmWarningText(raw: string | null): string | null {
  if (raw === null || raw.length === 0) return null;
  if (isMergeErrorSentinel(raw)) return MERGE_CONFIRM_ERROR_MESSAGES[raw];
  return MERGE_CONFIRM_DEFAULT_ERROR_MESSAGE;
}

export function classifyCustomerMergeConfirmError(
  error: DomainError,
): MergeErrorSentinel {
  if (error.code === "FORBIDDEN") return "inactive";
  return "invalid";
}
