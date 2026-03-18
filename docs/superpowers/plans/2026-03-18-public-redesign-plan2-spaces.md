# Public Pages Redesign — Plan 2: Spaces + Reservation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スペース一覧・詳細ページと予約ページを Page-First アーキテクチャで実装し、コア予約導線を確立する

**Architecture:** スペース一覧は FilterBar + SpaceGrid の Page-First 構成。スペース詳細は新規ルート `spaces/[slug]` で画像ギャラリー + 2カラムレイアウト。予約ページはデザインシステム適用 + StepIndicator 更新。

**Tech Stack:** Next.js 16.1.6 / React 19.2 / Tailwind CSS 4.2 / Prisma 7.5 / GSAP 3.14 / Zod 4.3 / bun:test

**Spec:** `docs/superpowers/specs/2026-03-16-public-pages-redesign.md` (Section 4.2-4.4)

---

## Task 1: 公開スペースクエリの追加

**Files:**

- Create: `src/shared/domain/spaces/public-queries.ts`
- Create: `src/app/(public)/_shared/lib/content/schemas/space-list.ts`

**Context:** 現在のスペースクエリは管理画面向け。公開ページ用のキャッシュ付きクエリを追加。カテゴリフィルタ・人数フィルタ・ソート対応。

- [ ] 既存の `src/shared/domain/spaces/queries.ts` を読む
- [ ] 公開用クエリを作成: `getPublishedSpaces(filters)` — `'use cache'` + `cacheTag('spaces')`
- [ ] `getSpaceBySlug(slug)` — 公開用スペース詳細クエリ
- [ ] `getRelatedSpaces(spaceId, categoryId, limit)` — 関連スペース
- [ ] SpaceList ページ用コンテンツスキーマ (hero title/description)
- [ ] type-check + commit

## Task 2: スペース一覧ページ Page-First 書き換え

**Files:**

- Modify: `src/app/(public)/spaces/page.tsx`
- Create: `src/app/(public)/spaces/_components/space-card.tsx`
- Modify: `src/app/(public)/spaces/_components/SpaceGrid.tsx` → リファクタリング

**Context:** SectionRenderer ベースから Page-First に。PageHero compact + FilterBar（将来追加）+ SpaceGrid + Pagination。

- [ ] page.tsx を Page-First に書き換え（PageHero compact + Breadcrumb + SpaceGrid + SiteCTA）
- [ ] SpaceCard コンポーネント（デザインシステム Card ベース）
- [ ] SpaceGrid を新トークンで更新
- [ ] type-check + validate + commit

## Task 3: スペース詳細ページ（新規ルート）

**Files:**

- Create: `src/app/(public)/spaces/[slug]/page.tsx`
- Create: `src/app/(public)/spaces/[slug]/_components/space-info.tsx`
- Create: `src/app/(public)/spaces/[slug]/_components/space-gallery.tsx`
- Create: `src/app/(public)/spaces/[slug]/_components/reservation-widget.tsx`

**Context:** 新規ルート。画像ギャラリー + 2カラム（情報 60% + 予約ウィジェット 40% sticky）+ 関連スペース。

- [ ] page.tsx: `getSpaceBySlug(slug)` でスペース取得、generateMetadata でSEO
- [ ] SpaceGallery: メイン画像 + サムネイル4枚グリッド（ライトボックスは後続）
- [ ] SpaceInfo: 名前 + Badge + 説明 + 設備リスト + アクセス情報
- [ ] ReservationWidget: sticky サイドバー（料金テーブル + 予約ボタン）
- [ ] 関連スペースセクション（Card 横並び × 3）
- [ ] type-check + validate + commit

## Task 4: 予約ページ デザインシステム適用

**Files:**

- Modify: `src/app/(public)/reservation/page.tsx`
- Modify: `src/app/(public)/reservation/_components/ReservationForm.tsx`
- Modify: `src/app/(public)/reservation/_components/StepIndicator.tsx`

**Context:** 既存のダミーフォームのデザインをデザインシステムに統一。フォーム機能自体は変更しない（DB連携は将来）。

- [ ] page.tsx を Page-First に（PageHero compact + Breadcrumb + フォーム + SiteCTA）
- [ ] StepIndicator のカラートークンを新テーマに更新
- [ ] ReservationForm のカラートークン + ボタンをデザインシステムに更新
- [ ] type-check + validate + commit

## Task 5: validate + build 確認

- [ ] `bun run test`
- [ ] `bun run validate`
- [ ] `bun run build`
- [ ] 修正があれば commit

---

## 依存関係

```
Task 1 (queries) ← Task 2 (space list)
Task 1 (queries) ← Task 3 (space detail)
Task 2, 3 は並列可能だが Task 1 完了後
Task 4 は独立（Task 1 不要）
Task 5 は全タスク完了後
```
