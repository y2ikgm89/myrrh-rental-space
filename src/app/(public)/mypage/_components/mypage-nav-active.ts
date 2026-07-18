/**
 * /mypage NAV 項目の active 判定 (テスト可能な pure 関数).
 *
 * `"use client"` 境界外に切り出す (mypage-nav.tsx から re-export). unit test は
 * この module を直接 import して next/navigation の hook 依存を回避する
 * (sidebar-active.ts と同じ house pattern)。
 *
 * - `/mypage` (「予約」タブ) は root だけでなく `/mypage/reservations/*`
 *   (詳細・編集) でも active. bare match だけだと詳細ページで aria-current
 *   が消えて mypage ダッシュボードから離れたように見える (NAV-01 回帰)。
 * - 他の bare href (`/mypage/events` 等) は完全一致 + `/` 続きの sub route を
 *   active とする. prefix だけの誤マッチは `/` 継続でガードする。
 */
export function isMypageNavActive(pathname: string, href: string): boolean {
  if (href === "/mypage") {
    return (
      pathname === "/mypage" || pathname.startsWith("/mypage/reservations")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
