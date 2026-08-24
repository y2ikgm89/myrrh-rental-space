import "server-only";

import { updateTag, revalidateTag } from "next/cache";
import { after } from "next/server";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/**
 * cache tag の invalidate を「呼べる文脈に合った API で」実行する。
 *
 * ## なぜ必要か
 *
 * `updateTag` は Server Action 専用で、**3 つの文脈でそれぞれ別の理由で throw する**。
 * 監査ログのような共通の書込ヘルパーは、自分がどこから呼ばれたかを知らない。
 *
 * | 文脈 | Next の挙動 | ここでの扱い |
 * | --- | --- | --- |
 * | Server Action | 成功 | そのまま（read-your-own-writes を保つ） |
 * | Route Handler / cron | `E872` で throw | `revalidateTag(tag, { expire: 0 })` へ切替 |
 * | Server Component の render 中 | `E7` で throw | `after` フェーズへ委譲 |
 *
 * ## なぜ「常に after」ではないか
 *
 * Server Action では invalidate が**即時**でなければ read-your-own-writes が壊れる。
 * action のレスポンス後に tag が期限切れになると、その action が誘発する再レンダーが
 * 古い値を読み得る。よって「まず即時実行を試し、throw の理由で分岐する」。
 *
 * ## なぜ tag 文字列を受け取るのか（コールバックではなく）
 *
 * Route Handler では **`updateTag` そのものが使えない**。呼び出し側が
 * `() => updateTag(tag)` を閉じ込めていると、ここで `revalidateTag` に
 * 切り替える手段が無く、invalidate を捨てるしかなかった（監査 A-62）。
 * 実際 CSV エクスポート・領収書 PDF の 9 route が毎回この経路を踏み、
 * 偽の CACHE エラーを積みながら recent 監査ログの tag を落とし損ねていた。
 *
 * ## 判定を message 照合にしない
 *
 * Next は全 throw に `__NEXT_ERROR_CODE` を付ける（`revalidate.js`）。
 * 文言は版で変わるがコードは変わらない。旧実装は
 * `"during render which is unsupported"` の部分一致で見ていたため、
 * **文言の違う `E872` を「設計ミス」に分類していた**。
 *
 * `E872` は「Route Handler」だけでなく「workStore がそもそも無い」
 * （リクエスト文脈外）でも投げられる。後者では `revalidateTag` も失敗するので、
 * ログに残して捨てる。
 */
export function invalidateTagNowOrAfterResponse(
  tag: string,
  options: {
    /** ログ用の操作名 */
    readonly operation: string;
    /** 追加コンテキスト */
    readonly context?: Record<string, unknown>;
  },
): void {
  const log = (error: unknown): void => {
    logError(normalizeError(error), {
      category: ErrorCategory.CACHE,
      severity: ErrorSeverity.LOW,
      context: { operation: options.operation, tag, ...options.context },
    });
  };

  try {
    updateTag(tag);
    return;
  } catch (error) {
    const code = nextErrorCode(error);

    if (code === NEXT_ERROR_UPDATE_TAG_OUTSIDE_ACTION) {
      // Route Handler / cron。ブロッキングの即時失効へ切り替える。
      try {
        revalidateTag(tag, { expire: 0 });
      } catch (fallbackError) {
        // リクエスト文脈が無い（unit テスト等）。ここは捨てるしかない。
        log(fallbackError);
      }
      return;
    }

    if (code !== NEXT_ERROR_DURING_RENDER) {
      // `"use cache"` 内など。文脈の設計ミスなので握らずログに残す。
      log(error);
      return;
    }
  }

  // render 中: after フェーズへ委譲する。after は request フェーズなので
  // `updateTag` がそのまま通る（`revalidate.js` の `case "request": break`）。
  const guarded = (): void => {
    try {
      updateTag(tag);
    } catch (error) {
      log(error);
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

/** `updateTag` を Server Action 以外（Route Handler / 文脈なし）で呼んだ。 */
const NEXT_ERROR_UPDATE_TAG_OUTSIDE_ACTION = "E872";

/** render フェーズで revalidate 系を呼んだ。 */
const NEXT_ERROR_DURING_RENDER = "E7";

/**
 * Next.js が throw に付ける `__NEXT_ERROR_CODE` を読む。
 *
 * `enumerable: false` で定義されるので、スプレッドや JSON では見えない。
 * 直接プロパティを読む。
 */
function nextErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const code: unknown = Reflect.get(error, "__NEXT_ERROR_CODE");
  return typeof code === "string" ? code : null;
}
