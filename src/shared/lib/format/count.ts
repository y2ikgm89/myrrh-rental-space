/**
 * 整数件数の表示用 SSoT フォーマッタ。
 *
 * - module-scope で {@link Intl.NumberFormat} を 1 度だけ生成しキャッシュする
 *   （呼出毎の formatter インスタンス生成コストを回避）。
 * - 日本語ロケール（ja-JP）の 3 桁区切り（カンマ）で整数件数を整形する。
 * - 通貨表示は `@/shared/lib/pricing/format` を使う（こちらは件数専用）。
 */

const COUNT_FORMATTER = new Intl.NumberFormat("ja-JP");

export function formatCount(value: number): string {
  return COUNT_FORMATTER.format(value);
}
