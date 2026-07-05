---
paths:
  ["src/app/**", "src/proxy.ts", "src/instrumentation.ts", "next.config.ts"]
---

# Next.js アプリ構造

## Multiple Root Layouts + APP_SURFACE

- `(public)` と `(admin)` がそれぞれ独立した `<html>/<body>` 付き root layout を持つ。
  相互遷移はフルページリロード（仕様）
- `APP_SURFACE` env（public | admin、既定 admin）で 2 サービスに分離。public surface では
  proxy が /admin・/preview・/api/admin・OAuth callback を 404 にする
- app-root の `manifest.ts` / `not-found.tsx` convention は**使用禁止**
  （admin surface への manifest link 漏れ / hydration mismatch を起こす）。
  代替: `(public)/manifest.webmanifest/route.ts` と
  `global-not-found.tsx` + `experimental.globalNotFound: true`

## cacheComponents + strict-dynamic CSP（最重要）

- route segment config（`export const dynamic` / `revalidate` / `runtime` 等）は
  src/app 全域で禁止（テストが 0 件強制）。動的化は `await connection()`
- 全 route は完全動的（ƒ）が前提。静的シェル（◐）になると framework script に
  per-request nonce が付かず CSP が全 JS をブロックする。両 root layout の
  「`generateViewport` 内 `await connection()` + `<html>` を `<Suspense>` で包む」
  opt-in 構造を崩さない。**layout 本体で `connection()` を呼ぶとビルドが落ちる**
- データ依存の layout chrome（Header/Footer 等）は「Suspense 内 async SC +
  冒頭 `await connection()`」に隔離する（build 時 fallback 焼き込み防止）
- `bun run build` の route 表（ƒ/◐/○）で動的化を実測確認する

## proxy.ts（Next.js 16 proxy convention）

- 責務: セキュリティヘッダー・CSP nonce（x-nonce）・rate limit・surface 分岐・
  ゲストキャンセル token 転写。**DB-backed module の import は禁止**（テスト強制）。
  Cache Components の producer / revalidation もここに置かない
- rate limit は /api/webhooks・/api/cron・/api/live を除外。**/api/live に DB チェックや
  rate limit を追加しない**（Cloud Run liveness probe がコンテナ kill される）
- localhost では HSTS / upgrade-insecure-requests を skip する（E2E / Lighthouse が壊れる）
- matcher は静的アセット・prefetch を除外している（そこには proxy が走らない）

## その他の規約

- admin `(dashboard)/_shared` 配下に App Router special file 名
  （page/layout/route/error 等）を置かない（テスト強制）
- 公開 route の loading/error/not-found に `<main id="main-content">` landmark を
  重複させない
- `export const metadata` で module load 時に env 依存値を評価しない
  （build 焼き込み）→ `generateMetadata` で runtime 評価
- Server Component から cookie の set/delete は不可 → Server Action 経由に切り出す
- 公開 CMS ページは `(public)/[...segments]` catch-all が single-segment slug のみ解決
- サイト機能の ON/OFF は Feature Module registry（`src/shared/lib/features/`）が一元管理。
  公開 route は 404 ガード、cron は早期 return で連動する（追加は `add-feature-module` skill）
