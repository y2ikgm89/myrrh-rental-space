import { DomainError } from "@/shared/domain/domain-error";
import {
  REAGREE_PATH,
  isReagreeRequiredError,
} from "@/shared/domain/terms/reagree-error";

export const MERGE_SUCCESS_QUERY_KEY = "merged";
export const MERGE_SUCCESS_SENTINEL = "ok";

export const MERGE_SUCCESS_MESSAGE =
  "履歴の統合が完了しました。マイページからご確認ください。";

export const MERGE_ERROR_SENTINELS = [
  "rate_limit",
  "invalid",
  "expired",
  "inactive",
  "maintenance",
  "reagree",
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
  // 監査 A-48。URL は有効なので既定文言（「無効または期限切れ」）に倒すと誤解を招く。
  maintenance:
    "ただいまメンテナンス中のため統合を実行できません。時間をおいて再度お試しください。",
  // 監査 A-79。利用者が**自力で解決できる**状態なので、
  // `inactive`（アカウント停止・要問い合わせ）に丸めない。
  reagree: `利用規約が更新されています。${REAGREE_PATH} で再同意すると統合を実行できます。`,
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

/**
 * `DomainError` を confirm ページの sentinel へ分類する。
 *
 * 監査 A-79: `FORBIDDEN` だけを見ると、**再同意 pending**（自力で解決できる）が
 * **アカウント停止**（解決できない）に丸められる。発生源で分ける。
 */
export function classifyCustomerMergeConfirmError(
  error: DomainError,
): MergeErrorSentinel {
  if (isReagreeRequiredError(error)) return "reagree";
  if (error.code === "FORBIDDEN") return "inactive";
  return "invalid";
}
