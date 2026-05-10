---
description: 公開ページの Section 描画パターン（ホームページ専用 / 標準 Section / Section config / 高さ単位）
paths:
  - src/app/(public*)/**
  - src/shared/lib/sections/**
  - src/app/(admin)/admin/(dashboard)/_shared/components/sections/**
---

# 公開ページ Section パターン

> Dynamic Section Architecture（DB 駆動）+ ホームページ専用 editorial 構造の SSoT

## ホームページ Section 管理

- **`homepage-*` セクション型はホームページ専用** — 他ページの `hero` / `cta` / `features` 等は標準セクション型（SectionRenderer 描画）。`homepage-*` に置き換えない
- **ホームページは DB 未登録でも表示される** — `page.tsx` が `homepage-*` セクションをフィルタし、0 件なら editorial コンポーネントの defaultProps で直接レンダリング
- **ホームページ Spaces セクションは SC + CC 分離** — `spaces-section.tsx`（SC: ヘッダー + CTA）が `spaces-carousel.tsx`（CC: Center Stage Carousel）を呼ぶ
  - **重なり**: 中央カード `z-30/scale-1`、隣 `z-20/scale-0.9` のカードスタック
  - **無限スクロール**: 51 回繰り返しで実装
  - **UI**: detail パネル + ドットインジケーター
  - **操作**: 矢印 / スワイプ / キーボード / ドット
  - **自動回転**: `autoPlayInterval` 秒。hover / focus / reduced-motion / tab 非表示で停止、ユーザー操作後 8 秒一時停止

## Seed と Section config

- **seed 再実行時のホームページセクション重複** — seed は既存セクションを削除せず追加する。旧型（`hero-parallax` / `concept` 等）と新型（`homepage-*`）が重複し、管理画面に二重表示される。seed 後に旧型を手動削除するか、seed スクリプトに既存セクション削除ロジックを追加する
- **seed は既存セクションの config を更新しない** — `DEFAULT_PAGE_SECTIONS` のフォーマットが変更されても（例: `imageUrl` → `images` 配列）、既存 DB レコードは旧フォーマットのまま。`mapHeroConfig` 等のマッパーが `arr(config, "images")` で取得できずデフォルト 1 枚にフォールバックする。手動で DB 更新するか seed reset が必要
- **ホームページセクション固有の UI 設定は section config に追加** — カルーセル速度・表示件数等のセクション固有設定は `definitions/homepage-*/schema.ts` に `field.*` ヘルパーで追加する。Settings シングルトンではなくセクション単位で管理画面から制御可能（AutoSectionForm が自動フォーム生成）
- **セクション定義の enum は `as const` 配列 + `field.select` + Set 型ガード** — `HERO_TRANSITIONS` のように schema ファイルに `as const` 配列を定義し、`field.select` の `options` に渡す。消費側（`page.tsx`）では `new Set<string>(VALUES)` + `is*` 型ガードでパース。`enums/helpers.ts` と同構造だがセクション定義はスキーマファイルに閉じる

## 高さ単位 / Hero

- **公開ページのセクション高さは `svh` 単位を使用** — `vh` は iOS Safari のアドレスバー問題がある。`min-h-[*svh]` を使用し、`h-[*vh]` は禁止。`height` ではなく `min-height` でコンテンツ溢れを防ぐ（WCAG 1.4.4 準拠）。例外: error/loading/not-found の中央寄せ用 `min-h-[60vh]`、ダイアログの `max-h-[85vh]`、`min-h-screen`（ページ全体）
- **ヒーロー高さはセマンティックプリセット + カスタム** — `sm/md/lg/full/custom` の 5 段階。custom 時は `heightCustom`（svh 数値）をインラインスタイルで適用。ユーザーに px / vh を直接入力させない（Squarespace / Payload CMS 方式）
