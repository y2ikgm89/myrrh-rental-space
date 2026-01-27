# 058: 統一エディターサイドパネル

## 概要

管理画面のコンテンツ編集UIを統一する大規模改修。全コンテンツタイプ（ブログ、お知らせ、ページ、スペース、FAQ）で一貫したUI/UXを実現するため、プラグイン型アーキテクチャを導入。

## 目標

- 全コンテンツ編集ページで一貫したUI/UX
- 統一されたサイドパネル構成（3タブ: 基本 / SEO・OGP / 公開）
- 拡張可能なプラグイン型アーキテクチャ

## アプローチ

### Clean Architectureパターン

後方互換性なし、クリーンな実装を優先。`ContentTypeConfig`によるプラグイン型設計で、新しいコンテンツタイプは設定オブジェクトを追加するだけで対応可能。

### タブ構成

| タブ | 内容 |
|------|------|
| 基本 | タイトル/スラッグ、抜粋、カテゴリ、タグ、画像など |
| SEO・OGP | メタディスクリプション、キーワード、OGPタイトル/説明/画像 |
| 公開 | 公開状態、公開日時、レイアウト設定 |

### 公開方式

- **status** (BlogPostStatus enum): ブログ用（DRAFT/PUBLISHED/ARCHIVED）
- **isPublished** (boolean): その他のコンテンツ用

## 実装内容

### 1. Core Infrastructure

**新規ファイル:**
- `content-types/types.ts` - ContentTypeConfig型定義
- `UnifiedSidePanel.tsx` - 統一サイドパネルコンポーネント
- `side-panel/*.tsx` - 再利用可能フィールドコンポーネント群
  - TitleSlugFields, ExcerptFields, CategoryFields, TagFields
  - SEOFields, OGPFields, UnifiedPublishFields, LayoutFields

### 2. Content Type Configs

**新規ファイル:**
- `content-types/blog-config.ts`
- `content-types/news-config.ts`
- `content-types/page-config.ts`
- `content-types/space-config.ts`
- `content-types/faq-config.ts`

### 3. DB Schema更新

**Prisma schema変更:**
- News: `NewsStatus` enum → `isPublished: Boolean`
- News: SEO/OGPフィールド追加
- FaqItem: `isActive` → `isPublished`

### 4. エディター更新

**変更ファイル:**
- `BlogInlineEditor.tsx` - UnifiedSidePanel使用
- `NewsInlineEditor.tsx` - UnifiedSidePanel使用 + SEO/OGP対応
- `PageInlineEditor.tsx` - UnifiedSidePanel使用

### 5. 削除ファイル

- `BlogSidePanel.tsx`
- `NewsSidePanel.tsx`
- `SidePanel.tsx`

## アーキテクチャ

```
content-types/
├── types.ts              # ContentTypeConfig型定義
├── blog-config.ts        # ブログ設定
├── news-config.ts        # お知らせ設定
├── page-config.ts        # ページ設定
├── space-config.ts       # スペース設定
└── faq-config.ts         # FAQ設定

side-panel/
├── TitleSlugFields.tsx   # タイトル/スラッグ
├── ExcerptFields.tsx     # 抜粋
├── CategoryFields.tsx    # カテゴリ選択
├── TagFields.tsx         # タグ入力
├── ImageFields.tsx       # 画像選択
├── SEOFields.tsx         # SEO設定
├── OGPFields.tsx         # OGP設定
├── UnifiedPublishFields.tsx  # 公開設定（status/isPublished両対応）
├── LayoutFields.tsx      # レイアウト設定
└── index.ts              # エクスポート

UnifiedSidePanel.tsx      # 統一サイドパネル本体
```

## 拡張方法

新しいコンテンツタイプを追加する場合:

1. `content-types/`に`xxx-config.ts`を作成
2. `ContentTypeConfig`に従って設定を定義
3. エディターで`UnifiedSidePanel`に`config`を渡す

```typescript
// example-config.ts
export const exampleContentTypeConfig: ContentTypeConfig = {
  id: 'example',
  label: '例',
  sidePanelTitle: '例の設定',
  sidePanelWidth: 'default',
  publishControl: 'isPublished',
  tabs: [
    {
      id: 'basic',
      label: '基本',
      sections: [
        { title: '基本情報', component: TitleSlugFields, props: { ... } },
      ],
    },
    // ...
  ],
}
```

## 完了日

2026-01-21

## 関連

- Plan 055: Admin UI/UX Unification
- Plan 056: Type Assertion Reduction
