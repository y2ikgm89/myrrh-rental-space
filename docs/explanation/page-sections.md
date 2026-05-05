# ページセクション デザイン変更ガイド

## 概要

ページセクションのデザインを変更する際の影響範囲と手順をまとめたガイドです。

## アーキテクチャ

```
src/app/(public)/_shared/
├── lib/styles/
│   └── section-variants.ts    # 🎨 共通スタイル（変更の起点）
│
└── components/
    ├── sections/              # ホームページセクション
    │   ├── HeroSection.tsx
    │   ├── SpaceListSection.tsx
    │   └── ...
    │
    └── page-sections/         # ページセクション
        ├── GallerySection.tsx
        ├── TestimonialSection.tsx
        ├── MapSection.tsx
        ├── EmbedSection.tsx
        └── ContactFormSection.tsx
```

## デザイン変更時の手順

### 1. 全セクション共通の変更

**対象ファイル**: `src/app/(public)/_shared/lib/styles/section-variants.ts`

```typescript
// セクションのパディングを変更
export const sectionVariants = tv({
  base: "py-12 md:py-16", // ← ここを変更
  // ...
});

// タイトルのスタイルを変更
export const sectionTitleVariants = tv({
  base: "text-2xl font-bold md:text-3xl mb-8 text-center text-foreground",
  // ...
});

// カードのスタイルを変更
export const cardVariants = tv({
  base: "bg-card rounded-lg shadow-sm border border-border",
  // ...
});
```

### 2. 画像オーバーレイの変更

**対象ファイル**: `section-variants.ts`

```typescript
export const imageOverlayClasses = {
  captionGradient: "bg-gradient-to-t from-black/60 to-transparent",
  light: "bg-black/30",
  medium: "bg-black/40",
  dark: "bg-black/60",
};
```

> **注意**: オーバーレイは背景画像の上に表示されるため、テーマに関係なく黒系を使用します。

### 2.5. Masonryレイアウト・星評価の変更

**対象ファイル**: `section-variants.ts`

```typescript
// Masonryカラム（動的クラス回避）
export const masonryColumnClasses = {
  1: "columns-1",
  2: "columns-1 sm:columns-2",
  3: "columns-1 sm:columns-2 lg:columns-3",
  // ...
};

// 星評価の色
export const ratingStarClasses = {
  filled: "fill-yellow-400 text-yellow-400",
  empty: "fill-muted text-muted",
};
```

> **注意**: Tailwind CSSは動的クラス（`lg:columns-${n}`）を検出できないため、完全なクラス名を事前定義しています。

### 3. 個別セクションの変更

各セクションコンポーネントを直接編集します。

| セクション  | ファイル                                          |
| ----------- | ------------------------------------------------- |
| Hero        | `components/sections/HeroSection.tsx`             |
| Gallery     | `components/page-sections/GallerySection.tsx`     |
| Testimonial | `components/page-sections/TestimonialSection.tsx` |
| Map         | `components/page-sections/MapSection.tsx`         |
| Embed       | `components/page-sections/EmbedSection.tsx`       |
| ContactForm | `components/page-sections/ContactFormSection.tsx` |

## スタイルルール

### 使用すべきテーマ変数

| 用途               | 使用する変数                            | 禁止                             |
| ------------------ | --------------------------------------- | -------------------------------- |
| テキスト（メイン） | `text-foreground`                       | `text-gray-900`, `text-black`    |
| テキスト（サブ）   | `text-muted-foreground`                 | `text-gray-600`, `text-gray-500` |
| 背景               | `bg-background`                         | `bg-white`, `bg-gray-50`         |
| 背景（サブ）       | `bg-muted`, `bg-muted/30`               | `bg-gray-100`, `bg-slate-50`     |
| ボーダー           | `border-border`                         | `border-gray-200`                |
| カード             | `bg-card`                               | `bg-white`                       |
| アクセント         | `bg-accent`, `text-accent-foreground`   | `bg-blue-*`                      |
| プライマリ         | `bg-primary`, `text-primary-foreground` | 直接色指定                       |

### 例外（テーマ変数を使用しない場合）

1. **画像オーバーレイ上のテキスト**
   - 白固定（`overlayTextClasses.primary`）
   - 理由: 背景画像の上に視認性を確保するため

2. **星評価の色**
   - 黄色固定（`ratingStarClasses.filled`）
   - 理由: 評価を表す一般的な色として認知されているため
   - 変更時は `section-variants.ts` の `ratingStarClasses` を修正

## 型定義

### page-sectionの型

```typescript
// src/shared/lib/validations/page-section.ts
export type HeroConfig = z.output<typeof heroConfigSchema>;
export type GalleryConfig = z.output<typeof galleryConfigSchema>;
// ...

// フォーム用（React Hook Form）
export type HeroConfigInput = z.input<typeof heroConfigSchema>;
// ...
```

### homepage-sectionとの互換性

`HeroSection`は両方で使用されるため、共通のインターフェースを内部で定義:

```typescript
// HeroSection.tsx内
interface HeroConfig {
  title: string;
  subtitle?: string;
  backgroundImageUrl?: string;
  ctaPrimary: { text: string; url: string };
  ctaSecondary?: { text?: string; url?: string };
}
```

## DBスキーマ変更時の注意

### 新しいセクションタイプを追加する場合

1. `prisma/schema.prisma` - enum追加
2. `src/shared/lib/validations/page-section.ts` - スキーマ追加
3. `src/app/(public)/_shared/components/page-sections/` - コンポーネント作成
4. `PageSectionRenderer.tsx` - switch文にケース追加
5. `src/app/(admin)/admin/(dashboard)/pages/[slug]/sections/_components/PageSectionEditor.tsx` - フォーム追加

### configフィールドを変更する場合

1. Zodスキーマに`.default()`を設定
   - 既存データは読み込み時にデフォルト値が適用される
2. DBマイグレーション不要（JSON型のため）
3. 必須フィールドは追加しない（既存データが無効になる）

## 検証手順

```bash
# 型チェック
bun run type-check

# Lint
bun run lint

# ビルド
bun run build
```

## 参考

- `AGENTS.md` - Tailwind CSS / UI 実装の共通ルール
- `.agents/skills/public-site-change/SKILL.md` - 公開ページ UI 変更の Codex skill
- `.claude/rules/tailwind-patterns.md` / `.claude/rules/ui-ux-patterns.md` - Claude Code 用 legacy reference。Codex 作業では参照しない
