/**
 * FAQ コンテンツ健全性の判定しきい値（client-safe）
 *
 * 管理画面の quick filter / ヘルスサマリー / 鮮度チェック cron で共有する SSoT。
 * 「未更新（stale）」の日数は cron 通知（`/api/cron/faq-stale-check`）と一致させ、
 * 通知から管理画面の絞り込みへ動線がぶれないようにする。
 */

/** これ以上更新されていない公開項目を「未更新（要見直し）」とみなす日数 */
export const FAQ_STALE_DAYS = 180;

/** 「最近更新」とみなす直近日数 */
export const FAQ_RECENT_DAYS = 7;

/**
 * 「要改善」とみなす「役に立たなかった」票の最小値。
 * Intercom の negative reactions と同じ「不評票が付いた項目を拾う」思想。
 */
export const FAQ_LOW_RATED_MIN_NOT_HELPFUL = 1;
