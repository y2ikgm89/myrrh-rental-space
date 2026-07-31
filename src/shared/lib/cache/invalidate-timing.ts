import "server-only";

import { after } from "next/server";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/**
 * cache tag の invalidate を「呼べる文脈なら即時、render 中なら after フェーズ」で実行する。
 *
 * ## なぜ必要か
 *
 * `updateTag` / `revalidateTag` は **render フェーズで呼ぶと Next.js が throw する**
 * （`packages/next/src/server/web/spec-extension/revalidate.ts` の
 * `workUnitStore.phase === "render"` ガード）。監査ログのように
 * 「Server Action からも Server Component の render 中からも呼ばれる」書込ヘルパーは、
 * 後者で invalidate が丸ごと失われる。
 *
 * ## なぜ「常に after」ではないか
 *
 * Server Action では invalidate が **即時**でなければ read-your-own-writes が壊れる
 * （`.claude/rules/caching.md` の呼び分け契約）。action のレスポンス後に tag が
 * 期限切れになると、その action が誘発する再レンダーが古い値を読み得る。
 * よって「まず即時実行を試し、render フェーズ由来の throw のときだけ after へ逃がす」。
 *
 * 同ガードは after フェーズを明示的に許可している（`case "request": break`）。
 */
export function invalidateTagNowOrAfterResponse(
  invalidate: () => void,
  options: {
    /** ログ用の操作名 */
    readonly operation: string;
    /** 追加コンテキスト */
    readonly context?: Record<string, unknown>;
  },
): void {
  try {
    // Server Action / Route Handler: 即時実行して read-your-own-writes を保つ。
    invalidate();
    return;
  } catch (error) {
    if (!isRevalidateDuringRenderError(error)) {
      // render 以外の理由（"use cache" 内など）は設計ミスなので握らずログに残す。
      logError(normalizeError(error), {
        category: ErrorCategory.CACHE,
        severity: ErrorSeverity.LOW,
        context: { operation: options.operation, ...options.context },
      });
      return;
    }
  }

  // render 中: after フェーズへ委譲する。
  const guarded = () => {
    try {
      invalidate();
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.CACHE,
        severity: ErrorSeverity.LOW,
        context: { operation: options.operation, ...options.context },
      });
    }
  };

  try {
    after(guarded);
  } catch {
    // リクエストスコープ外（unit テスト・非リクエスト文脈）では after が同期 throw する。
    // `fireAndForget` と同じくフォールバックする。
    guarded();
  }
}

/**
 * Next.js の「render 中に revalidate を呼んだ」エラーだけを識別する。
 *
 * メッセージ照合なのは、Next.js が判別可能な error class / code を公開していないため。
 * 文言は `revalidate.ts` の該当 throw に由来する。
 */
function isRevalidateDuringRenderError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("during render which is unsupported")
  );
}
