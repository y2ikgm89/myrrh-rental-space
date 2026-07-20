/**
 * WCAG 2.4.1 bypass-blocks の SSoT: 管理画面 dashboard の全ページに置く
 * skip-to-main-content anchor。
 *
 * # なぜ必要か
 *
 * dashboard layout は `<ResponsiveSidebar>` (十数個のナビリンク) + `<TopBar>`
 * (通知ベル / 検索トリガー / branding) を毎ページ描画する。skip-link が
 * ないと、キーボードユーザー (screen reader ユーザー・運動障害を持つ
 * ユーザー・power user 全般) は Tab を数十回押して初めて主コンテンツに
 * 到達する。WCAG 2.1 AA の "Bypass Blocks" 必須要件を admin surface は満たしていなかった。
 *
 * # 実装
 *
 * - 通常時は視覚的に隠す (screen reader だけが読める `sr-only`)
 * - focus 時のみ表示 (`focus:not-sr-only` + admin token 色)
 * - anchor の href は `#main-content`。ジャンプ先の <main> は
 *   `DashboardMain.tsx` が `id="main-content" tabIndex={-1}` で描画する。
 *   tabIndex={-1} が無いと、URL fragment ジャンプ後 Tab キーが再びサイドバー
 *   先頭に戻ってしまうため必須。
 * - React 19 native anchor / RSC 互換 (client component である必要はないが、
 *   admin dashboard 側 layout が全 client tree なのでそちらに合わせる)
 */
export function SkipToMainContentLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      メインコンテンツへスキップ
    </a>
  );
}
