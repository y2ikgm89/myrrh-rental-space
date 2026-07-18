/**
 * 再同意 gate (MypageAuthGate 内、LOGIN_SIGNUP scope 差分検出) の allowlist SSoT。
 *
 * 「証跡アクセスは agreement 前提外」の原則に従い、以下の read-only 履歴閲覧経路は
 * 再同意 pending でも redirect しない。税務資料 (領収書 DL)・過去予約詳細・過去問い合わせ
 * 詳細へのアクセスを閉ざさない。
 *
 * settings は `MypageAuthGate` の email 未登録 fallback (LINE ログイン) の必須経路
 * のため必ず含める (再同意 gate との循環 redirect を防ぐ)。
 *
 * dashboard (`/mypage` root) は含めない (mutation 起点の hub なので最短で trip wire
 * にする)。
 */
export const REAGREE_ALLOWLIST_PREFIXES: readonly string[] = [
  "/mypage/terms/reagree",
  "/mypage/settings",
  "/mypage/reservations",
  "/mypage/inquiries",
  "/mypage/events",
];

/**
 * pathname が再同意 gate の allowlist に該当するかを判定する。
 *
 * prefix 前方一致で比較する (`/mypage/reservations/[id]/edit` のような入れ子も対象)。
 * Phase 2 で edit/cancel 系 Server Action 側に curl-bypass gate を追加する前提。
 */
export function isReagreeAllowlisted(pathname: string): boolean {
  return REAGREE_ALLOWLIST_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}
