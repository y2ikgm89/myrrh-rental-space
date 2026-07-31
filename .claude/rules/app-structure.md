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
- **不変条件は「prerender された HTML に nonce 無しの `<script>` が無いこと」**。
  Next.js は request の `Content-Security-Policy` ヘッダーから nonce を取り出して
  script に載せるため、ビルド時に焼かれた HTML には nonce を付けられない
  （公式 CSP ガイド: nonce 利用時は全ページ動的レンダリングが必要 /
  PPR も _static shell scripts cannot access the nonce_ のため非互換）。
  `script-src` は `'strict-dynamic'` なので `'self'` は無視され、nonce 無し script は全滅する
- **route 表の `◐` 単体は違反ではない**。両 root layout の「`generateViewport` 内
  `await connection()` + `<html>` を `<Suspense>` で包む」opt-in により prerender は
  `<html>` を emit する前に postpone し、静的 prelude は**空**になる
  （`.next/server/app/**/*.html` が 0 byte・`hasHtml:false`）。script は resume 時に
  per-request nonce 付きで書かれる（`resumeToFizzStream(…, { nonce })`）。
  実測 45 route が `◐` だが prelude はすべて空。この opt-in 構造を崩さない。
  **layout 本体で `connection()` を呼ぶとビルドが落ちる**
- Root Layout をバイパスする convention（`global-not-found.tsx` 等）は上記 opt-in が
  使えない（layout の無い route で `generateViewport` に dynamic API を置くと
  `next-prerender-dynamic-viewport` でビルドが落ちる）。**`<html>` を返す async SC を
  `<Suspense>` の内側に置き、その中で `await connection()`** する
- データ依存の layout chrome（Header/Footer 等）は「Suspense 内 async SC +
  冒頭 `await connection()`」に隔離する（build 時 fallback 焼き込み防止）
- **公開ページは常にストリーミング内側なので実 HTTP status を返せない**。
  公式逐語:「Once streaming begins, HTTP response headers and status codes cannot be
  changed. If a `notFound()` function triggers mid-stream, Next.js cannot alter the
  HTTP status code to 404 and instead injects a `noindex` meta tag」。
  page 本体の `notFound()` は **200 + noindex**、`redirect()` は client-side redirect に
  なる（admin 側の帰結は PR #1711 / #1713 参照）。テストや監視で
  「404 が返ること」を契約にしない — 契約は「not-found 境界が描画される」
  「noindex が付く」。実 status が要るときは proxy 層で判定するしかないが、
  `proxy.ts` は DB-backed import 禁止なので DB 由来の条件では採れない
- gate は `scripts/check-static-prelude-empty.ts`（`bun run build` /
  `build:skip-env` が自動実行）。route 表の目視ではなく**ビルド成果物を機械検査**する。
  例外は `_global-error.html` のみ（`global-error.tsx` は Next.js 規約上
  Client Component 必須で動的化 opt-in を持てない。runtime のエラー応答は
  `app-render` の `ErrorApp` 経路で request 内に描画され nonce が付く）

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
  公開 route は `requireFeatureEnabled` で 404 ガード、cron route は
  `authorizeCronRequest` 直後に以下の早期 return で連動する（追加手順は
  `add-feature-module` / `add-cron-job` skill）:

  ```ts
  if (!(await isFeatureEnabled("<id>"))) {
    return jsonSuccess({ skipped: true, reason: "feature_disabled" });
  }
  ```
