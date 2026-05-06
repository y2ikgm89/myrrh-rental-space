# プロジェクト構造 — なぜ Multiple Root Layouts か

> このドキュメントは採用したディレクトリ構造の **「なぜ」** を説明する（Diátaxis: explanation）。
>
> **実装の SSoT**: ファイル配置は実コード（`src/`）と Claude Code 用 `.claude/rules/project-structure.md`（path-scoped で auto-load）。手動メンテのファイル列挙はここに置かない。

## 採用方針

公開サイトと管理画面を **Multiple Root Layouts** で完全分離する（Next.js 16 推奨パターン）。同一ドメインで運用しつつ、CSS / 認証 / レイアウトを混在させない。

- 公開系: `src/app/(public)/...` — デザイン重視、スクロール演出あり
- 管理系: `src/app/(admin)/admin/(dashboard)/...` — 実務向け UI、Lexical / 型付きフォーム
- 共有: `src/shared/...` — CSS 変数に依存しない共通ロジック
- プレビュー: `src/app/(preview)/...` — 管理画面向け第 3 root layout（`ManagedPageSections` を共有）

公開 ↔ 管理間の遷移は **フルリロード**を前提とする（異なる Root Layout のため）。

## なぜ分離するのか

| 観点           | 理由                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| CSS            | 公開は Luxury White × Bronze、管理は実務向け。同一 token system にしない |
| 認証           | 公開は顧客 Better Auth、管理は admin Better Auth（cookie prefix も分離） |
| バンドルサイズ | 管理 Lexical / 重い admin UI を公開ルートに引き込ませない                |
| デプロイ       | 同一 Cloud Run 1 サービスで運用、`proxy.ts` で coarse gate のみ          |

## 層の責務

### `src/app/*`

route / page / layout / route handler の **orchestration に限定**する。業務ロジックを置かない。

### `src/shared/domain/*`

業務ロジックと read model の **正本**。UI 層・route 層は domain を経由してデータ取得する。`types.ts` で公開する型を SSoT として固定し、generated Prisma model を UI へ漏らさない。

### `src/shared/db/*`

Prisma facade。enum / generated type の再公開、Prisma singleton と Decimal 変換の境界、Better Auth 向け DB adapter の境界。

### `src/shared/lib/*`

infra / framework integration。auth / env / constants / logger / validation / analytics / external API client。DB client は直接 import せず、必要な adapter は `src/shared/db/*` 経由で受け取る。

### `src/app/(public)/_shared/*`

公開 UI 専用の component / hook / presentational helper。`actions/` は公開フォーム送信（Turnstile + Zod、認証なし）専用、データ取得は持たない。

### `src/app/(admin)/admin/(dashboard)/_shared/*`

管理画面 UI と action adapter。`executeAdminMutationResult` を薄い write adapter の共通入口にする。action から Prisma を直接読まず、domain command / query を呼ぶ。

## パスエイリアス

```json
{
  "@/*": "./src/*",
  "@generated/*": "./generated/*",
  "@/admin/*": "./src/app/(admin)/admin/(dashboard)/_shared/*",
  "@/public/*": "./src/app/(public)/_shared/*",
  "@/shared/*": "./src/shared/*"
}
```

内部モジュールの `import { X as Y }` は禁止（namespace import で衝突解決）。barrel export も禁止（例外: Lexical 内部）。

## 命名ルール

- Component: `PascalCase.tsx`
- Utility / validation: `kebab-case.ts`
- Domain query: `queries.ts` / Domain command: `commands.ts` / 型: `types.ts`
- ルートファイル: `page.tsx` / `layout.tsx` / `route.ts`

## 変更時の判断基準

| 配置先              | 該当                                    |
| ------------------- | --------------------------------------- |
| `src/app/(public)`  | UI 責務、公開ページ専用                 |
| `src/app/(admin)`   | UI 責務、管理画面専用                   |
| `src/shared/domain` | 業務ルール、read model、所有者チェック  |
| `src/shared/lib`    | 外部サービス連携、framework integration |
| `src/shared/db`     | Prisma generated 由来の型・client       |

## ルーティング構造の概要

具体的なファイルパス・ページ一覧は実コード（`src/app/`）を ground truth にする。本ドキュメントには列挙しない（drift するため）。

- 公開 root: `/`, `/spaces`, `/posts`, `/news`, `/events`, `/faq`, `/access`, `/contact`, `/[...segments]`
- 管理 root: `/admin/login`（gate）, `/admin/*`（dashboard）
- preview root: `/preview/*`（管理画面向け）
- API: `/api/*`（auth / webhooks / cron / probe / sitemap / feed）
