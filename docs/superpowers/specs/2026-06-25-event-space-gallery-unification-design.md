# Event / Space Gallery Unification — Design Spec

**Status**: Draft / awaiting user review
**Author**: Claude Code (Opus 4.7) + ユーザー協議
**Date**: 2026-06-25
**Scope**: 1 PR / 1 論理変更 = 「Space と Event の写真ギャラリー機能を `{url, alt, caption}[]` 統一形に刷新」
**Breaking**: yes（後方互換性なし・pre-release 状態 + アクティブユーザー無による big-bang 移行）

---

## 0. Purpose

イベント詳細ページに複数写真を掲載できるようにする。同時に「プロジェクトの一貫性」を担保するため、既存 Space の `imageUrls: string[]` 配列を `gallery: {url, alt, caption}[]` 構造へ刷新し、Space / Event / 公開セクション（gallery section）の **3 つで同一の SSoT shape** を採用する。

公式推奨に揃える観点:

- WCAG 1.1.1（a11y）: per-image `alt` を許容
- Next.js 16 / React 19 React Compiler 規約準拠
- Prisma 7 / Postgres 16 + squawk safety
- Conform `field.array()` + AutoArrayField 形式
- gallery section `field.array({fields: {url, alt, caption}})` 既存 SSoT 形と完全一致

---

## 1. Non-Goals (本 PR では取り組まない)

| 項目                                                                 | 理由                                                                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Lexical body 内 `data-gallery` のクリック→ lightbox ハイドレーション | 別 PR（SanitizedHtml 属性 whitelist の修正は本 PR で行うが、JS 経由ハイドレーションは別問題）                                           |
| Space 詳細の Airbnb 風「すべての写真を表示」CTA ボタン               | GalleryGrid の "+N" overlay で代替可。専用 CTA は polish 別 PR                                                                          |
| Per-event / per-space cache タグの粒度化（detail tag 追加）          | collection-only（`CACHE_TAGS.SPACES` / `CACHE_TAGS.EVENTS`）が現 SSoT・本 PR の範囲では不要                                             |
| `Location.imageUrls`（別モデル）                                     | 別 PR。schema 上は同じ `Json @default("[]")` だが responsibility 分離のため別タスク                                                     |
| Lexical Image Node の R2 アップロード経路統合                        | 既に動作・別 concern                                                                                                                    |
| 並列実装上の expand/contract 分割                                    | pre-release ＋ アクティブユーザー無の状態なので [migrations.md の例外条項](../../../.claude/rules/migrations.md) により big-bang を採る |

---

## 2. Final Schema

### 2.1 Prisma diff

**`prisma/schema.prisma`**

```prisma
// Space (L445)
- imageUrls Json @default("[]")  // string[] (bare URLs)
+ gallery   Json @default("[]")  // GalleryItem[]

// Event (L1618 model)
+ gallery   Json @default("[]")  // GalleryItem[]    // ※新規追加。Event は元々 imageUrls 列を持たない
```

`mainImageUrl` (Space) / `thumbnailUrl` (Event) は **変更なし**（カード / ヒーロー用の single image。gallery とは責務分離）。

`Location.imageUrls` は **本 PR では触らない**（Non-Goals §1）。

### 2.2 GalleryItem JSON shape (SSoT)

既存の `src/shared/lib/sections/definitions/gallery/schema.ts:15-22` と完全に揃える:

```ts
type GalleryItem = {
  url: string; // R2 URL or external URL; 画像 or 動画 MIME
  alt: string; // 空文字許容（WCAG 1.1.1 decorative image）
  caption: string; // 空文字許容
};
```

### 2.3 Zod 制約（Space / Event 共通）

```ts
// src/shared/lib/validations/gallery.ts (新設)
export const galleryItemSchema = z.object({
  url: z.string().url(),
  alt: z.string().max(200).default(""), // .default("") は parseWithZod 空文字→undefined 罠回避
  caption: z.string().max(500).default(""),
});

export const gallerySchema = z
  .array(galleryItemSchema)
  .max(20, { error: "ギャラリーは最大20件まで" })
  .default([])
  .superRefine((items, ctx) => {
    const urls = items.map((i) => i.url);
    const dup = urls.findIndex((u, i) => urls.indexOf(u) !== i);
    if (dup !== -1) {
      ctx.addIssue({
        code: "custom",
        message: "URL が重複",
        path: [dup, "url"],
      });
    }
  });
```

追加 cross-field 検証（form schema 側で実施）:

- `mainImageUrl` (Space) / `thumbnailUrl` (Event) と `gallery[].url` は重複しないこと（既存 `validations/space.ts:276-281` の `.refine` パターンを踏襲）

---

## 3. Migration (big-bang)

### 3.1 適用順序

⚠️ **`prisma/migrations/**` への直接 Edit は agent deny**（`.claude/settings.json`）。実装時はユーザーが下記を実行する:

```bash
bun run db:migrate -- --name space_event_gallery_unification --create-only
# → 空の migration ディレクトリが生成される
# その後、生成された migration.sql を §3.2 の SQL で完全置換
# 完了後:
bun run db:migrate  # 適用
```

agent からの SQL 書き込みは `python3 -c "..."` ワークアラウンド経由になる（過去 PR #762/#765 の前例）。

### 3.2 migration.sql 完全版

```sql
-- Big-bang migration: imageUrls (string[]) → gallery (GalleryItem[])
-- Spaces + Events 統一。pre-release / アクティブユーザー無による migrations.md 例外条項適用。
-- Precedent: 20260507163006_space_facilities_to_object_array (jsonb_agg + jsonb_build_object pattern)
-- 全文 Prisma による自動トランザクションでアトミック。

-- ============ SPACES ============

ALTER TABLE "spaces" ADD COLUMN "gallery" JSONB NOT NULL DEFAULT '[]';

UPDATE "spaces"
SET "gallery" = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object('url', value, 'alt', '', 'caption', '')
    )
    FROM jsonb_array_elements_text("imageUrls")
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof("imageUrls") = 'array' AND jsonb_array_length("imageUrls") > 0;

-- squawk-ignore ban-drop-column
ALTER TABLE "spaces" DROP COLUMN "imageUrls";

-- ============ EVENTS ============
-- Event には元々 imageUrls 列が無い (prisma/schema.prisma:1618 model Event スキャン済) ため、
-- 追加のみ。データ移行 / DROP は不要。

ALTER TABLE "events" ADD COLUMN "gallery" JSONB NOT NULL DEFAULT '[]';
```

**安全性確認**:

| 項目                                  | 確認結果                                                                                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADD COLUMN ... DEFAULT '[]'` の lock | Postgres 11+ は constant default の metadata-only ADD → 全行 rewrite なし                                                                                                              |
| `NOT NULL` 設定                       | inline default が non-null なので追加の `SET NOT NULL` パス不要                                                                                                                        |
| `squawk-ignore ban-drop-column` 配置  | 対象 DROP の **直前 1 行**（per [.squawk.toml](../../../.squawk.toml) + memory `project_ical-feed-removal-gcal-ssot-2026-06-24`）                                                      |
| ALTER + UPDATE + DROP の transaction  | Prisma が migration 全体を 1 transaction で包む → atomic rollback 可                                                                                                                   |
| Cloud Run Job migrate との互換        | 単一 migration 内 multi-statement は前例多数（20260419175644, 20260511133710 他）                                                                                                      |
| big-bang 正当性                       | migrations.md 例外条項「pre-release / アクティブユーザーなし」を引用（[memory: project_deep-audit-batch1-2026-06-25](../../../memory/project_deep-audit-batch1-2026-06-25.md) と整合） |

### 3.3 デプロイ順序

1. PR merge → `bun run build` で `@generated/prisma` 更新（新 client は `gallery` を知る）
2. Cloud Build → migrate Job 実行（schema migration 適用）
3. 新リビジョン deploy（新 client で稼働）
4. 旧リビジョン → 新リビジョン rolling 切替

中間窓（migrate 完了～新リビジョン ready）で旧 client が `imageUrls` を select する場合 500 が出るが、**pre-release / トラフィック 0 なので影響なし**。

---

## 4. Conform Form Wire-up

### 4.1 Canonical Precedent

**Gallery section の AutoArrayField** ([src/shared/lib/sections/definitions/gallery/schema.ts:15-22](../../../src/shared/lib/sections/definitions/gallery/schema.ts) + `_shared/components/auto-fields/AutoArrayField.tsx`)。

- パターン: Conform `field.array()` + 指標付き FormData (`gallery[0].url`, `gallery[0].alt`, ...)
- **却下**: EventForm の tickets で使われている `JSON.stringify` 隠し input パターン — チケットは bespoke React state が前提の異形であり、Conform native 配列対応の本ケースでは正規でない

### 4.2 Reorder の役割分担

dnd-kit と Conform の **両方** を使い、責務分離する:

| 層                                                  | 担当                                             | ライブラリ  |
| --------------------------------------------------- | ------------------------------------------------ | ----------- |
| ドラッグ UX（hit-test / a11y / キーボード並べ替え） | `DndContext` / `SortableContext` / `useSortable` | **dnd-kit** |
| Form state の最終配列順更新                         | `form.reorder({ name, from, to })` intent        | **Conform** |

[SpaceEditForm.tsx:22-51, 1178-1201](<../../../src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm.tsx>) の構成（`DndContext` / `SortableContext` / `useSortable` / `verticalListSortingStrategy` / `KeyboardSensor` / `PointerSensor`）を踏襲し、`onDragEnd` で `from` / `to` を Conform に委譲する。

dnd-kit 単独使用（state を bespoke React state で持つ既存 Space パターン）でも reorder 自体は動くが、本 PR では **Conform 配列形式に統一**するため form intent も同時に使う。dnd-kit を完全に剥がす案は不採用（a11y + キーボード並べ替えの実装が追加コストになる）。

### 4.3 Form 側 wire-up（GalleryField 内で完結）

```tsx
const galleryItems = fields.gallery.getFieldList();
// item 単位: const { url, alt, caption } = item.getFieldset();

// 追加
form.insert({
  name: fields.gallery.name,
  defaultValue: { url, alt: "", caption: "" },
});

// 削除
form.remove({ name: fields.gallery.name, index });

// 並べ替え（dnd-kit の onDragEnd ハンドラ内で呼ぶ）
form.reorder({ name: fields.gallery.name, from, to });
```

---

## 5. Component Inventory

### 5.1 CREATE

| Path                                                                                    | 役割                                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/shared/components/gallery/GalleryGrid.tsx`                                         | 公開ギャラリーレンダラ（`'use client'`）。 0/1/2-4/5+ 件で grid を切替、5+ で最終タイルに "+N" overlay → lightbox 起動 |
| `src/shared/components/gallery/GalleryLightbox.tsx`                                     | native `<dialog>` lightbox（GallerySection L54-126 のロジックを抽出・section chrome 非依存）                           |
| `src/shared/lib/validations/gallery.ts`                                                 | `galleryItemSchema` / `gallerySchema` / `parseGallery()` パーサ（既存 `parseStringArray` を gallery 用途では置換）     |
| `src/app/(admin)/admin/(dashboard)/_shared/components/gallery-field/GalleryField.tsx`   | 管理画面 multi picker + dnd-kit + 各行の alt/caption 入力。Space と Event 両方で使う                                   |
| `src/app/(admin)/admin/(dashboard)/_shared/components/gallery-field/GalleryItemRow.tsx` | 1 行 = サムネ + alt input + caption input + drag handle + remove ボタン                                                |

### 5.2 EXTRACT

| Before                                                       | After                                           | 理由                                    |
| ------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------- |
| `src/app/(public)/_components/space-list/image-carousel.tsx` | `src/shared/components/media/ImageCarousel.tsx` | EventCard でも使う・実体は Space 非依存 |

`image-carousel.tsx` の export 型（`ImageCarouselProps`）も併せて移設。

### 5.3 MODIFY — Domain / Validators

**Space**:

- [prisma/schema.prisma:445](../../../prisma/schema.prisma) — 列名/型変更
- [src/shared/domain/spaces/queries.ts:69](../../../src/shared/domain/spaces/queries.ts) — `parseStringArray` → `parseGallery`
- [src/shared/domain/spaces/public-queries.ts:44,62,173,203,245,260](../../../src/shared/domain/spaces/public-queries.ts) — select + parse 全置換
- [src/shared/domain/spaces/commands.ts:30,70,322-325](../../../src/shared/domain/spaces/commands.ts) — `SpaceCommandInput.gallery: GalleryItem[]`
- [src/shared/domain/sections/queries.ts:70,91](../../../src/shared/domain/sections/queries.ts) — featured space select + map
- [src/shared/domain/link-cards/resolve-queries.ts:115,127](../../../src/shared/domain/link-cards/resolve-queries.ts) — `gallery[0]?.url` fallback
- [src/shared/domain/link-cards/search-queries.ts:93,103](../../../src/shared/domain/link-cards/search-queries.ts) — 同上

**Event**:

- [src/shared/domain/events/public-queries.ts:15-43](../../../src/shared/domain/events/public-queries.ts) — `publicEventSelect` に `gallery: true` 追加
- `src/shared/domain/events/commands.ts` — `EventCommandInput.gallery: GalleryItem[]` 追加、`duplicateEventCommand` の clone に組込（既存 ticket clone 同パターン）
- `src/shared/domain/events/queries.ts` — admin 用 select に追加

**Validators**:

- [src/app/(admin)/admin/(dashboard)/\_shared/lib/validations/space.ts:57-73,230,276-281,308,360](<../../../src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts>) — `imageUrlsSchema` を `gallerySchema` で置換
- [src/app/(admin)/admin/(dashboard)/events/\_components/event-form-schema.ts:104-165](<../../../src/app/(admin)/admin/(dashboard)/events/_components/event-form-schema.ts>) — `gallery: gallerySchema` 追加

### 5.4 MODIFY — Admin UI

| File                                                                                                                                             | 変更                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [SpaceEditForm.tsx:304-306,418-425,473-475,588-595,1156-1209](<../../../src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm.tsx>) | 既存 bespoke imageUrls UI を `<GalleryField name={fields.gallery} defaultUsage="SPACE" />` に置換。React state / hidden inputs / Sortable JSX 全撤去 |
| [SpaceDetail.tsx:40-41](<../../../src/app/(admin)/admin/(dashboard)/spaces/[id]/_components/SpaceDetail.tsx>)                                    | gallery サムネを `space.gallery.map(g => g.url)` で表示                                                                                              |
| [EventForm.tsx](<../../../src/app/(admin)/admin/(dashboard)/events/_components/EventForm.tsx>)                                                   | 「公開設定」タブの `thumbnailUrl` フィールド直下に `<GalleryField name={fields.gallery} defaultUsage="EVENT" />` 配置                                |

EventForm のラベル hint: `"イベントギャラリー（本文内のギャラリーブロックとは別の、イベント最上位の画像一覧）"`

### 5.5 MODIFY — Public UI

| File                                                                                                    | 変更                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [spaces/[slug]/page.tsx:81](<../../../src/app/(public)/spaces/[slug]/page.tsx>)                         | `subImages = parseStringArray(space.imageUrls)` → `parseGallery(space.gallery)`                                                     |
| [spaces/[slug]/page.tsx:142-184](<../../../src/app/(public)/spaces/[slug]/page.tsx>)                    | 既存 mosaic を `<GalleryGrid items={space.gallery} hero={space.mainImageUrl} />` で置換                                             |
| [events/[slug]/page.tsx:256-258](<../../../src/app/(public)/events/[slug]/page.tsx>)                    | `</Prose>` と registration section の間に `<GalleryGrid items={event.gallery} />` を挿入                                            |
| [space-card.tsx:18,45,52-53,158-172](<../../../src/app/(public)/_components/space-list/space-card.tsx>) | prop `imageUrls` → `gallery: readonly GalleryItem[]`。carousel images = `[mainImageUrl, ...gallery.filter(isImage).map(g=>g.url)]`  |
| [event-card.tsx:143-152](<../../../src/app/(public)/_components/event-calendar/event-card.tsx>)         | gallery が空でない時 `<ImageCarousel>` を採用、空なら現状の static `<Image>`                                                        |
| [related-events.tsx:43-59](<../../../src/app/(public)/_components/event-calendar/related-events.tsx>)   | `gallery: e.gallery ?? []` を EventCardData に map                                                                                  |
| [related-spaces.tsx:39](<../../../src/app/(public)/spaces/[slug]/_components/related-spaces.tsx>)       | prop `gallery={space.gallery}` 受け渡し                                                                                             |
| その他の `imageUrls` → `gallery` prop rename 箇所                                                       | space-grid / space-showcase / SpaceListSection / SpaceShowcaseSection / reservation/space-detail-dialog / sections/section-renderer |

### 5.6 MODIFY — SanitizedHtml

[src/shared/components/SanitizedHtml.tsx:24-33](../../../src/shared/components/SanitizedHtml.tsx) の DOMPurify `ADD_ATTR` に追加:

```
"data-gallery", "data-gallery-columns", "data-gallery-style",
"data-gallery-item", "data-src", "data-alt", "data-caption",
"data-gallery-img", "data-gallery-placeholder"
```

これは Lexical GalleryNode の出力 HTML が public 側で剝がされる現バグの修正。lightbox ハイドレーションは別 PR。

### 5.7 MODIFY — Seed / Tests

- [prisma/seed.ts:633,658,684](../../../prisma/seed.ts) — `imageUrls: []` → `gallery: []`
- 13 個の test fixture（verification report §H 参照、機械的置換 `imageUrls: [url, ...]` → `gallery: [{url, alt:"", caption:""}, ...]`）

### 5.8 DELETE

なし（`parseStringArray` は他用途で利用継続）。

---

## 6. Public UI 詳細仕様

### 6.1 GalleryGrid render rules

| `items.length` | 描画                                                         |
| -------------: | ------------------------------------------------------------ |
|              0 | `null`（描画なし、layout shift なし）                        |
|              1 | full-width image または video（aspect-ratio 4/3）            |
|              2 | `grid-cols-2` 等分                                           |
|              3 | `grid-cols-3` 等分                                           |
|              4 | `grid-cols-2 grid-rows-2`                                    |
|             5+ | 4-up grid + 最終タイルに "+N" overlay（クリックで lightbox） |

### 6.2 Image / Video 取扱

- 一覧カードカルーセル（SpaceCard / EventCard）: **画像のみ filter**（`isImageMime(url)` 拡張子チェック: `.jpg|.jpeg|.png|.webp|.gif|.avif`）。動画は除外し静的サムネ表示
- 詳細ページ GalleryGrid: 画像と動画両方を描画。動画はインライン再生（`<video controls playsInline>`）

### 6.3 Lightbox

`GalleryLightbox.tsx`:

- native `<dialog>` 利用（既存 GallerySection L54-126 の iOS body-lock + scrollY 復帰ロジック踏襲）
- 前後ナビ・キーボード（Left/Right/Esc）・スワイプ（touchStart/touchEnd 既存ロジック）
- 動画はインライン再生、lightbox は画像のみ対象（既存セクション仕様継承）

---

## 7. R2 / Media Picker 仕様

- `useMultipleMediaPicker({ defaultUsage: "SPACE" | "EVENT", accept: "image-or-video", maxSelections: 20 - currentCount })`
- `MediaUsage` enum に `EVENT` が既存（[prisma/schema.prisma](../../../prisma/schema.prisma) で確認済）
- R2 path: `defaultUsage` がフォルダ prefix を決定（既存挙動踏襲）

---

## 8. Cache / Server-Only 規約遵守

- 新規 query / command 全て `import "server-only";` 先頭付与
- Cache タグ追加 **なし**（`CACHE_TAGS.SPACES` / `CACHE_TAGS.EVENTS` のみで covering）
- `executeAdminMutationResult` 経由でのみ mutation（admin-server-actions.md 規約）

---

## 9. Verification Gates

| #   | Gate                        | コマンド / 手順                                                                 | Pass 基準                                         |
| --- | --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Type check                  | `bun run validate`                                                              | 0 errors                                          |
| 2   | Build                       | `bun run build`                                                                 | ルート route 表で event/space detail が `ƒ` 維持  |
| 3   | Migration apply             | `bun run db:migrate`（local PG）                                                | 1 migration 適用・rerun 時 no-op                  |
| 4   | Migration data check        | `SELECT id, gallery FROM spaces WHERE jsonb_array_length(gallery) > 0 LIMIT 5;` | 各行が `[{url, alt:"", caption:""}, ...]` 形      |
| 5   | Unit tests                  | `bun run test:unit`                                                             | 13 fixture updated, 全 green                      |
| 6   | Integration tests           | `bun run test:integration`                                                      | space / space-duplicate / link-cards-search green |
| 7   | Space 編集ラウンドトリップ  | 3 アイテム保存 → reload → 編集画面で確認                                        | 順序・alt・caption 完全保持                       |
| 8   | Event 編集ラウンドトリップ  | 同上                                                                            | 同上                                              |
| 9   | 公開描画 0 件               | gallery 空の Space / Event 詳細                                                 | GalleryGrid 描画なし・shift なし                  |
| 10  | 公開描画 1 件               | 1 件 gallery                                                                    | 単一 full-width 描画                              |
| 11  | 公開描画 20 件              | 20 件 gallery                                                                   | 4-up grid + "+15" overlay + lightbox 起動         |
| 12  | Lexical body gallery        | post 本文に inline gallery                                                      | DOMPurify 後も `data-gallery*` 残存・CSS 適用     |
| 13  | EventCard カルーセル        | gallery + thumbnail の Event                                                    | カルーセル展開、画像のみ表示（動画 filter）       |
| 14  | Migration round-trip parity | pre-migration imageUrls=["a","b"] → post-migration gallery                      | 厳密一致                                          |

⚠️ **報告は実コマンド出力でのみ主張**（CLAUDE.md 反ハルシネーション）。

---

## 10. Frozen Decisions (再 litigate 禁止)

1. フィールド名は **`gallery`** 確定（`imageUrls` / `media` / `images` 復活させない）
2. アイテム shape は **`{url: string, alt: string, caption: string}`** 確定（gallery section SSoT と一致）
3. 上限は **20 件 hard cap**
4. `alt` 空文字許容（WCAG 1.1.1 decorative image 対応）
5. `image-or-video` 受入。listing カルーセルは画像のみ filter、詳細 GalleryGrid は両方描画
6. `mainImageUrl` (Space) / `thumbnailUrl` (Event) は **gallery と分離維持**（hero/card 用 single image）
7. Space + Event を **1 PR で同時統一**（Plan C）
8. **Big-bang migration**（migrations.md 例外条項 = pre-release / アクティブユーザー無）
9. Cache タグは **collection-only**（新規 tag 追加なし）
10. Conform pattern は **`field.array()` indexed**（JSON.stringify 隠し input 不採用）
11. Reorder UI は **dnd-kit**（既存 SpaceEditForm 準拠）。Conform `form.reorder` intent は最終並べ替え反映に使う
12. Lexical body gallery クリック lightbox ハイドレーションは **別 PR**
13. `Location.imageUrls` は **本 PR で触らない**（schema 上の同形性は将来 PR で精査）

---

## 11. Open Items (実装着手時に Read で最終確認)

これらは現時点で defaults を spec に焼いたが、実装フェーズで対象ファイルを Read し齟齬がないことを実証する:

1. `Event.gallery` の admin form 配置タブ確定（thumbnailUrl が居るタブを Grep で再確認）
2. `Space.gallery` 列の Postgres 物理列名 — Prisma は既定で camelCase をそのまま使う（`"gallery"`）。既存 `imageUrls` も `"imageUrls"` だったため一貫。snake_case マップは適用しない
3. `Location.imageUrls` の validator 実装が object-array なのか string[] なのか（verification report の主張と schema の食い違いを別 PR で精査）
4. `isImageMime(url)` 実装の location — 既存 helper があれば再利用、無ければ `src/shared/lib/media/detect-media-type.ts` に追加

---

## 12. Implementation Order (writing-plans への引継ぎ)

1. **`gallery.ts` validator + types** 新設（依存先で参照可能にする）
2. **`prisma/schema.prisma` 修正** → `bun run db:migrate -- --name space_event_gallery_unification --create-only` → 生成 SQL を §3.2 で完全置換 → `bun run db:migrate`
3. **Domain layer 全置換**（Space queries/commands → Event queries/commands → sections/link-cards 周辺）
4. **`@generated/prisma` 再生成確認**（`bun run db:generate`）
5. **`ImageCarousel` 移設**（1 file 移動 + import update）
6. **`SanitizedHtml` `ADD_ATTR` 拡張**
7. **`GalleryLightbox` 抽出**（既存 GallerySection L54-126 のロジックをコピー、section chrome 排除）
8. **`GalleryGrid` 新設**（GalleryLightbox を内包）
9. **`GalleryField` + `GalleryItemRow` 新設**（dnd-kit + multi picker）
10. **`SpaceEditForm` 統合**（bespoke imageUrls UI 撤去 → GalleryField）
11. **`EventForm` 統合**（GalleryField 追加）
12. **公開 UI 統合**（spaces/[slug]/page.tsx mosaic 置換 → events/[slug]/page.tsx GalleryGrid 挿入 → EventCard 改修 → SpaceCard prop rename）
13. **prop rename 群**（space-grid / space-showcase 等の cascading rename）
14. **Seed / Test fixture 機械更新**
15. **`bun run validate && bun run build` 通過**
16. **手動ラウンドトリップ確認**（§9 #7, #8, #9, #10, #11, #13）
17. **PR 作成**（Conventional Commits: `feat(gallery)!: unify Space.imageUrls + Event.gallery into {url,alt,caption}[] SSoT`）

---

## 13. References

- [.claude/rules/migrations.md](../../../.claude/rules/migrations.md) — big-bang 例外条項
- [.claude/rules/admin-server-actions.md](../../../.claude/rules/admin-server-actions.md) — `executeAdminMutationResult` 経路
- [.claude/rules/react-components.md](../../../.claude/rules/react-components.md) — React Compiler 規約
- [.claude/rules/public-app.md](../../../.claude/rules/public-app.md) — `(public)` の DB アクセス境界
- [.claude/rules/sections.md](../../../.claude/rules/sections.md) — gallery section SSoT
- [src/shared/lib/sections/definitions/gallery/schema.ts](../../../src/shared/lib/sections/definitions/gallery/schema.ts) — GalleryItem shape SSoT
- [src/app/(public)/\_components/GallerySection.tsx](<../../../src/app/(public)/_components/GallerySection.tsx>) — lightbox 抽出元
- [src/app/(public)/\_components/space-list/image-carousel.tsx](<../../../src/app/(public)/_components/space-list/image-carousel.tsx>) — ImageCarousel 抽出元
- [memory: project_deep-audit-batch1-2026-06-25](../../../memory/project_deep-audit-batch1-2026-06-25.md) — big-bang 量産前例
- [memory: project_conform-empty-string-undefined-optional-2026-06-17](../../../memory/project_conform-empty-string-undefined-optional-2026-06-17.md) — `.default("")` で空文字罠回避
- [memory: project_ical-feed-removal-gcal-ssot-2026-06-24](../../../memory/project_ical-feed-removal-gcal-ssot-2026-06-24.md) — squawk-ignore per-statement 配置
