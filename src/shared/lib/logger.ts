/**
 * GCP 構造化汎用ロガー（クライアント・サーバー共用エントリ）
 *
 * 実装は SSoT として `@/shared/lib/errors/logger-core` に集約済み。
 * このファイルは旧来の `@/shared/lib/logger` import パスを互換維持するための
 * 薄い re-export レイヤ（client component からの import を許可するため
 * `server-only` を付けない）。
 *
 * サーバーサイドのエラーログには `@/shared/lib/errors/server` の
 * `logError` を使用（カテゴリ・深刻度付き構造化ログ + Error Reporting 連携）。
 *
 * @see https://cloud.google.com/logging/docs/structured-logging#special-payload-fields
 */

export { logger } from "@/shared/lib/errors/logger-core";
export type { LogEnrichment } from "@/shared/lib/errors/logger-core";
