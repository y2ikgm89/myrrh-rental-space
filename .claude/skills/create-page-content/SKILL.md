---
name: create-page-content
description: >
  公開ページをスキャフォールド生成する（Dynamic Section Architecture）。
  Page レコード + DEFAULT_PAGE_SECTIONS エントリ + page.tsx テンプレート。
  新規公開ページ追加時に使用。
when_to_use: 公開サイトに新規ページを追加するとき。Page レコード + DEFAULT_PAGE_SECTIONS + page.tsx を一括 scaffold する。
argument-hint: <page-slug-kebab-case>
---

# 公開ページ スキャフォールド（Dynamic Section Architecture）

全ページは `Page` + `Section` モデルで管理。`PageContent` モデルは廃止済み。

## 実行前の確認事項

生成前に必ず以下を確認する（不明な場合は AskUserQuestion で確認）:

1. **ページキー（slug）**: 英語 kebab-case（例: `gallery`, `pricing`, `staff`）
2. **ルートパス**: `/<slug>` 等の URL パス
3. **ページタイトル**: 日本語（例: `ギャラリー`）
4. **必要なセクション**: ヒーロー + CTA のみ or 追加セクションあり
5. **ページ固有コンテンツ**: フォーム、リスト、ウィザード等の有無

## 生成ファイル構成

```
src/app/(public)/
└── <route>/
    └── page.tsx                    # ページ本体（Server Component）

src/shared/lib/constants/
└── default-page-sections.ts        # DEFAULT_PAGE_SECTIONS にエントリ追加

src/shared/domain/pages/
└── system-pages-commands.ts        # システムページ定義に追加（任意）
```

## 実行手順

### Step 1: DEFAULT_PAGE_SECTIONS にエントリ追加

`src/shared/lib/constants/default-page-sections.ts` にデフォルトセクション構成を追加:

```typescript
"<page-key>": [
  {
    type: "hero",
    config: {
      title: "<日本語タイトル>",
      subtitle: "<日本語説明文>",
    },
    design: {},
    order: 0,
    isActive: true,
  },
  {
    type: "cta",
    config: {
      title: "お気軽にご相談ください",
      description: "ご質問やご予約のご相談はこちらから",
      buttons: [
        { text: "お問い合わせ", url: "/contact", variant: "primary", openInNewTab: false },
      ],
    },
    design: {},
    order: 1,
    isActive: true,
  },
],
```

NOTE: 追加セクションが必要な場合は、既存の17セクションタイプから選択して追加。
新しいセクションタイプが必要な場合は先に `create-section-type` スキルで作成。

### Step 2: page.tsx 作成

`src/app/(public)/<route>/page.tsx`

```typescript
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("<page-key>");
}

export default async function <PageName>Page(): Promise<ReactElement> {
  await connection();
  const sections = await getPageSectionsWithFallback("<page-key>");

  return (
    <>
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
```

#### ページ固有コンテンツがある場合

ヒーローと末尾セクション（CTA等）の間にページ固有コンテンツを挟む:

```typescript
export default async function <PageName>Page(): Promise<ReactElement> {
  await connection();
  const sections = await getPageSectionsWithFallback("<page-key>");

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) => s !== heroSection && s.type !== "hero" && s.type !== "hero-parallax",
  );

  return (
    <>
      {heroSection && <SectionRenderer section={heroSection} />}

      <section className="py-[var(--space-lg)]">
        <Container>
          {/* ページ固有コンテンツ（フォーム、リスト等） */}
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
```

### Step 3: システムページとして登録（任意）

管理画面のページ一覧に自動表示したい場合、`bootstrapSystemPagesCommand` にページ定義を追加。

### Step 4: Seed 更新

`prisma/seed.ts` の `seedSystemPageSections()` は `DEFAULT_PAGE_SECTIONS` を参照するため、
Step 1 でエントリを追加すれば seed 時に自動作成される。

Page レコード自体は `seedPages()` → `bootstrapSystemPagesCommand` で作成される。
新ページを `isSystemPage: true` にする場合は `system-pages-commands.ts` への追加も必要。

### Step 5: 検証

```bash
bun run type-check
bun run validate
```

## 必須パターン

- **`connection()` 必須**: PPR 動的 opt-in（全公開ページ）
- **`getPageSectionsWithFallback(slug)` 使用**: DB セクション → DEFAULT_PAGE_SECTIONS フォールバック
- **`SectionRenderer` で描画**: セクションコンポーネントの動的ディスパッチ
- **kebab-case ファイル名**: 公開ページコンポーネントの命名規則
- **`readonly` props**: 全 interface に必須
- **`import type`**: 型のみの import は必ず `type` キーワード付き
- **Design System Primitives**: `Container`, `Heading`, `Stack`, `Button` 等は `_shared/components/design-system/` から

## セクションタイプ一覧（利用可能）

hero, hero-parallax, custom, concept, space-list, space-showcase, news-list,
post-list, faq-list, features, testimonial, gallery, cta, contact-form, map, embed, instagram

新しいタイプが必要な場合は `/create-section-type <type-name>` を先に実行。

## 参照

- `src/shared/lib/constants/default-page-sections.ts` — デフォルトセクション構成
- `src/shared/lib/sections/registry.ts` — セクションレジストリ（22定義）
- `src/shared/lib/sections/definitions/` — 各セクションの schema + metadata
- `src/app/(public)/about/page.tsx` — セクションのみページの実装例
- `src/app/(public)/contact/page.tsx` — ページ固有コンテンツ + セクションの実装例
