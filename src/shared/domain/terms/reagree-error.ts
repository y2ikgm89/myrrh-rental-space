/**
 * 「規約の再同意が必要」を表す `DomainError`。
 *
 * ## なぜ専用の型が要るのか（監査 A-79）
 *
 * `FORBIDDEN` は 2 つのまったく違う状態から投げられる。
 *
 * - `customers/guard.ts` — アカウント停止 / BLACKLIST（利用者が自力で解決できない）
 * - `terms/consent-gate.ts` — 規約の再同意 pending（**再同意すれば解決する**）
 *
 * `code` だけで分類すると後者が前者に丸められ、履歴統合の確認画面は
 * 「このアカウントは現在ご利用いただけません。お問い合わせフォームよりご連絡ください」と
 * 表示していた。自力で直せる状態なのに、利用者はアカウント停止と誤解して問い合わせに流れる。
 *
 * ## なぜ新しい `DomainErrorCode` にしないのか
 *
 * `FORBIDDEN` はリポジトリ内の 12 箇所以上で分岐に使われている（領収書 PDF や
 * 添付ダウンロードの route など）。code を増やすと、そのすべてが
 * 「新しい code をどう扱うか」を考える必要が出る = 影響範囲が広すぎる。
 *
 * 部分型にすれば `error instanceof DomainError` も `error.code === "FORBIDDEN"` も
 * これまでどおり成立し、**区別したい場所だけが区別できる**。
 *
 * ## client-safe に置く理由
 *
 * `consent-gate.ts` は `server-only`。分類側（`merge-query.ts`）は純粋な helper で、
 * server-only を引き込みたくないので型だけをここに切り出している。
 */

import { DomainError } from "@/shared/domain/domain-error";

/** 再同意ページのパス。文言とリンクの SSoT。 */
export const REAGREE_PATH = "/mypage/terms/reagree";

export class ReagreeRequiredError extends DomainError {
  /**
   * 再同意ページへの導線。
   *
   * **型を構造的に区別する役割も兼ねる。** メンバを 1 つも追加しないと
   * TypeScript は `DomainError` と同一と見なし、型ガードの否定側が
   * `never` になって後続の `error.code` が型エラーになる（実測で踏んだ）。
   */
  readonly reagreePath: string = REAGREE_PATH;

  constructor(message: string) {
    super(message, "FORBIDDEN");
    this.name = "ReagreeRequiredError";
  }
}

export function isReagreeRequiredError(
  error: unknown,
): error is ReagreeRequiredError {
  return error instanceof ReagreeRequiredError;
}
