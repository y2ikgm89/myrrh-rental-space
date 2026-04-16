# Blog Detail Page Editorial Redesign

> ブログ記事詳細ページを Editorial Magazine デザインに統一

## 背景

ブログ記事詳細ページ (`/posts/[...segments]`) のデザインが、他の公開ページ (SPACES, NEWS, EVENTS) の Editorial Magazine トーン (Kinfolk/Cereal) と乖離している。

**現状の問題点:**

1. アイキャッチ画像 (`thumbnailUrl`) が詳細ページに表示されない（一覧カードでは表示済み）
2. メタデータ（カテゴリ Badge + 日付 + 著者）がインラインで素朴
3. 本文が `SanitizedHtml className="prose prose-lg max-w-none"` で直接描画され、`Prose` Primitive の `variant="editorial"` (drop-cap) を使っていない
4. サイドバーウィジェット間に視覚的な区切りがなく、密度が高い

## スコープ

### 変更対象ファイル

| ファイル                                                          | 変更内容                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/app/(public)/posts/_components/post-detail-page-content.tsx` | メイン: アイキャッチ追加、メタデータ再構成、Prose Primitive 切り替え |
| `src/app/(public)/_shared/components/layouts/blog-sidebar.tsx`    | ウィジェット間に `border-t` 区切り追加                               |

### 変更しないもの

- `BlogLayout` の構造（2カラム `lg:grid-cols-[1fr_320px]`）
- `PageHero variant="compact"` の使用
- サイドバーウィジェット個別コンポーネント（既にエディトリアルパターンに沿っている）
- `ShareButtons` コンポーネント（既に適切なスタイリング）
- `SiteCTA` コンポーネント
- News 詳細ページ（`/news/[slug]` — 別途必要なら個別対応）

## 設計

### 1. アイキャッチ画像の追加

`thumbnailUrl` がある場合のみ、メタデータ行の上に `ImageFrame` を表示。

```tsx
{
  post.thumbnailUrl ? (
    <div className="mb-8">
      <ImageFrame src={post.thumbnailUrl} alt={post.title} aspect="video" />
    </div>
  ) : null;
}
```

- `aspect="video"` (16:9) でコンテンツ幅に合わせた画像
- 画像なし記事は graceful degradation（スキップ）
- `mb-8` で本文との間隔を確保

### 2. メタデータのエディトリアル化

**Before:**

```tsx
<div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
  {post.category?.name ? <Badge>{post.category.name}</Badge> : null}
  <time>...</time>
  {post.author?.name ? (
    <>
      <span>/</span>
      <span>{name}</span>
    </>
  ) : null}
</div>
```

**After:**

```tsx
<div className="mb-8 flex flex-wrap items-center gap-3 text-muted-foreground">
  {post.category?.name ? (
    <span className="text-[0.7rem] uppercase tracking-[0.18em] text-accent">
      {post.category.name}
    </span>
  ) : null}
  {post.category?.name && (post.publishedAt || post.author?.name) ? (
    <span aria-hidden="true" className="text-border">·</span>
  ) : null}
  <time
    dateTime={...}
    className="font-heading text-sm font-light"
  >
    {formatSerializedDate(...)}
  </time>
  {post.author?.name ? (
    <>
      <span aria-hidden="true" className="text-border">·</span>
      <span className="text-sm">{post.author.name}</span>
    </>
  ) : null}
</div>
```

変更点:

- `Badge` → uppercase tracking ラベル (`text-accent`) — 他ページの SectionLabel と同じトーン
- 区切り `/` → `·` (ミドルドット) — より洗練された区切り
- 日付に `font-heading font-light` — セリフで軽量な印象
- `mb-6` → `mb-8` — 余白を広げてエディトリアルな呼吸感

### 3. Prose Primitive への切り替え

**Before:**

```tsx
<SanitizedHtml html={post.contentHtml} className="prose prose-lg max-w-none" />
```

**After:**

```tsx
<Prose variant="editorial" className="max-w-none">
  <SanitizedHtml html={post.contentHtml} />
</Prose>
```

変更点:

- `Prose variant="editorial"` でラップ → `drop-cap` クラス有効化（先頭文字装飾）
- `prose-neutral max-w-[65ch]` + リンクの `text-accent` 等の統一スタイルが自動適用
- `SanitizedHtml` 側の `className` は除去（Prose がスタイリング担当）
- `max-w-none` は `className` prop で渡す（BlogLayout の contentWidth 設定に従わせるため）

### 4. サイドバーウィジェット間の区切り

**Before (blog-sidebar.tsx):**

```tsx
<div className="sticky top-[calc(var(--header-height)+2rem)] space-y-8">
  {enabledWidgets.map((widget) => (
    <div key={getWidgetKey(widget)}>{renderWidget(widget, data)}</div>
  ))}
</div>
```

**After:**

```tsx
<div className="sticky top-[calc(var(--header-height)+2rem)]">
  {enabledWidgets.map((widget, index) => (
    <div
      key={getWidgetKey(widget)}
      className={cn(index > 0 && "mt-8 border-t border-border pt-8")}
    >
      {renderWidget(widget, data)}
    </div>
  ))}
</div>
```

変更点:

- `space-y-8` → 手動の `mt-8 border-t border-border pt-8`（最初のウィジェット以外）
- 各ウィジェット間に薄いボーダー線を追加して視覚的に区切る
- `cn()` で条件クラス適用（`@/shared/lib/cn` 使用）

## Anti-AI セルフレビュー

| 質問                                         | 結果                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| タイポグラフィに serif/sans の対比があるか？ | Yes — メタデータ日付に `font-heading`（セリフ）、本文は sans  |
| Accent カラーが控えめ（15% 以下）か？        | Yes — カテゴリラベルのみ `text-accent`、他は muted/foreground |
| セクション間で padding に変化があるか？      | Yes — Hero compact → 画像 → メタデータ → 本文で余白変化       |
| アニメーションに主役/脇役の差があるか？      | N/A（記事ページはアニメーションなし — 読みやすさ優先）        |
| カードに hover のインタラクションがあるか？  | N/A（記事詳細にカードなし）                                   |
| セクションラベルに統一された装飾があるか？   | Yes — サイドバー h3 の uppercase tracking が既に統一済み      |

4/4 yes（N/A 除外）→ 合格

## 影響範囲

- `/posts/*` の全記事詳細ページ
- `/news/*` は **対象外**（別途対応が必要なら個別 spec）
- サイドバーの変更は `/posts` と `/news` の両方に影響（`BlogLayout` 共有のため）
- 既存の `resolveWidthStyles` によるコンテンツ幅設定は維持
- ArticleJsonLd、SEO メタデータ等は変更なし
