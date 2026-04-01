# Dynamic Section Architecture Design

> 全ページでセクション単位の微調整を可能にし、CLI による完全なデザイン刷新にも対応する動的セクションシステム。

## 目的

1. 全公開ページをセクション単位で管理画面から編集可能にする
2. CLI（Claude Code）が新しいセクションタイプを自由に追加できる（Prisma マイグレーション不要）
3. CLI がページデザインを完全に刷新しても、管理画面から微調整可能な状態を維持
4. 後方互換性を捨てたクリーンな実装

## 破壊的変更一覧

| 対象                                            | 変更内容                                                   |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `SectionType` Prisma enum                       | **廃止** → `Section.type` を `String` に変更               |
| `PageContent` Prisma model                      | **廃止** → 全ページが `Page` + `Section` で管理            |
| `src/app/(public)/_shared/lib/content/`         | **全削除** — schemas.ts, types.ts, defaults.ts, queries.ts |
| `src/shared/domain/page-content/`               | **全削除**                                                 |
| `sectionConfigSchemas` 中央マップ               | **廃止** → ファイルベースレジストリに移行                  |
| `section-defaults.ts` の getter 群              | **廃止** → 各 definition の schema.ts にデフォルト値を内包 |
| `section-metadata.ts` の中央定義                | **廃止** → 各 definition の metadata.ts に分散             |
| 手書きの config-form コンポーネント群           | **廃止** → Zod スキーマから自動生成                        |
| ホームページの専用コンポーネント群              | **廃止** → セクションコンポーネントに移行                  |
| 10 個の固定ページの `getPageContent()` 呼び出し | **廃止** → `getPageSectionsWithFallback()` に統一          |

---

## アーキテクチャ

### 1. Prisma スキーマ変更

```prisma
// BEFORE
enum SectionType {
  HERO
  HERO_PARALLAX
  CUSTOM
  // ... 17 values
}

model Section {
  type SectionType
  // ...
}

model PageContent {
  id              String   @id @default(uuid()) @db.Uuid
  pageKey         String   @unique
  content         Json
  // ...
}

// AFTER
// SectionType enum: 削除
// PageContent model: 削除

model Section {
  type String @db.VarChar(64)  // "hero", "cta", "pricing-table" etc.
  // ... 他は変更なし
}
```

**マイグレーション手順**:

1. `Section.type` を `String` に変更（enum 値はそのまま小文字ケバブケースに変換）
2. `PageContent` テーブルのデータを `Page` + `Section` に移行
3. `PageContent` モデルを削除
4. `SectionType` enum を削除

### 2. ファイルベースセクションレジストリ

```
src/shared/lib/sections/
├── registry.ts              # 全セクション定義を集約・export
├── types.ts                 # 共通型（SectionDefinition, FieldDef, SectionProps 等）
├── field-helpers.ts         # field.text(), field.select() 等のヘルパー
├── auto-form/               # Zod スキーマ → React フォーム自動生成
│   ├── auto-section-form.tsx
│   ├── field-renderers.tsx   # 各 field タイプのレンダラー
│   └── types.ts
└── definitions/              # 1ディレクトリ = 1セクションタイプ
    ├── hero/
    │   ├── schema.ts         # Zod config スキーマ（field ヘルパー使用）
    │   └── metadata.ts       # label, icon, description, category
    ├── hero-parallax/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── custom/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── concept/
    ├── space-list/
    ├── space-showcase/
    ├── news-list/
    ├── post-list/
    ├── faq-list/
    ├── features/
    ├── testimonial/
    ├── gallery/
    ├── cta/
    ├── contact-form/
    ├── map/
    ├── embed/
    └── instagram/
```

### 3. セクション定義の構造

```typescript
// types.ts — セクション定義の型

/** セクション定義（1タイプにつき1つ） */
export interface SectionDefinition<TConfig = unknown> {
  /** セクションタイプ識別子（ケバブケース） */
  type: string;
  /** Zod config スキーマ（field メタデータ付き） */
  configSchema: z.ZodType<TConfig>;
  /** 管理画面表示用メタデータ */
  metadata: SectionMetadata;
}

export interface SectionMetadata {
  label: string; // "ヒーロー"
  description: string; // "ページ上部のメインビジュアル"
  icon: string; // "IconPhoto" (Tabler)
  category: SectionCategory;
}

export type SectionCategory =
  | "hero"
  | "content"
  | "list"
  | "functional"
  | "media";

/** 公開ページコンポーネントの props 型 */
export interface SectionProps<TConfig> {
  config: TConfig;
  design: SectionDesign;
  section: PublicSection; // DB の Section レコード
}
```

### 4. field ヘルパー（スキーマ + フォームメタデータ統合）

Zod スキーマに `.describe()` でフォームメタデータを埋め込む。管理画面はこのメタデータからフォームを自動生成する。

```typescript
// field-helpers.ts

import { z } from "zod";

/** フィールドメタデータを JSON エンコードして .describe() に埋め込む */
function withMeta<T extends z.ZodType>(schema: T, meta: FieldMeta): T {
  return schema.describe(JSON.stringify(meta)) as T;
}

export interface FieldMeta {
  fieldType: FieldType;
  label: string;
  placeholder?: string;
  suffix?: string;
  helpText?: string;
}

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "image"
  | "url"
  | "icon"
  | "array"
  | "group";

export const field = {
  text(label: string, opts?: { placeholder?: string; default?: string }) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, {
      fieldType: "text",
      label,
      placeholder: opts?.placeholder,
    });
  },

  textarea(
    label: string,
    opts?: { placeholder?: string; default?: string; rows?: number },
  ) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, {
      fieldType: "textarea",
      label,
      placeholder: opts?.placeholder,
    });
  },

  number(
    label: string,
    opts?: { min?: number; max?: number; default?: number; suffix?: string },
  ) {
    let base = z.number().default(opts?.default ?? 0);
    if (opts?.min !== undefined) base = base.min(opts.min) as typeof base;
    if (opts?.max !== undefined) base = base.max(opts.max) as typeof base;
    return withMeta(base, { fieldType: "number", label, suffix: opts?.suffix });
  },

  boolean(label: string, opts?: { default?: boolean }) {
    const base = z.boolean().default(opts?.default ?? false);
    return withMeta(base, { fieldType: "boolean", label });
  },

  select<T extends string>(
    label: string,
    opts: {
      options: readonly { value: T; label: string }[];
      default: NoInfer<T>;
    },
  ) {
    const values = opts.options.map((o) => o.value) as [T, ...T[]];
    const base = z.enum(values).default(opts.default);
    return withMeta(base, {
      fieldType: "select",
      label,
      // options は describe の JSON には入れず、schema の enum values から復元
    });
  },

  image(label: string, opts?: { default?: string }) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, { fieldType: "image", label });
  },

  color(label: string, opts?: { default?: string }) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, { fieldType: "color", label });
  },

  url(label: string, opts?: { default?: string; placeholder?: string }) {
    const base = z
      .string()
      .url({ error: "有効なURLを入力してください" })
      .or(z.literal(""))
      .default(opts?.default ?? "");
    return withMeta(base, {
      fieldType: "url",
      label,
      placeholder: opts?.placeholder,
    });
  },

  icon(label: string, opts?: { default?: string }) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, { fieldType: "icon", label });
  },

  /** ネストされた配列フィールド */
  array<T extends z.ZodRawShape>(
    label: string,
    opts: { fields: T; maxItems?: number },
  ) {
    let base = z.array(z.object(opts.fields));
    if (opts.maxItems) base = base.max(opts.maxItems);
    return withMeta(base.default([]), { fieldType: "array", label });
  },

  /** フィールドグループ（折りたたみ可能） */
  group<T extends z.ZodRawShape>(label: string, fields: T) {
    return withMeta(z.object(fields), { fieldType: "group", label });
  },
};
```

### 5. セクション定義の実装例

```typescript
// definitions/hero/schema.ts
import { z } from "zod";
import { field } from "../field-helpers";

const ctaButtonSchema = z.object({
  text: field.text("ボタンテキスト", { default: "詳しく見る" }),
  url: field.url("リンク先", { placeholder: "/spaces" }),
  variant: field.select("スタイル", {
    options: [
      { value: "primary", label: "プライマリ" },
      { value: "secondary", label: "セカンダリ" },
      { value: "outline", label: "アウトライン" },
    ] as const,
    default: "primary",
  }),
});

export const heroConfigSchema = z.object({
  title: field.text("タイトル", { default: "Welcome" }),
  subtitle: field.textarea("サブタイトル"),
  backgroundImageUrl: field.image("背景画像"),
  buttons: field.array("ボタン", {
    fields: ctaButtonSchema.shape,
    maxItems: 3,
  }),
  height: field.select("高さ", {
    options: [
      { value: "auto", label: "自動" },
      { value: "md", label: "中" },
      { value: "lg", label: "大" },
      { value: "fullscreen", label: "全画面" },
    ] as const,
    default: "md",
  }),
  overlay: field.boolean("オーバーレイ", { default: true }),
  overlayOpacity: field.number("オーバーレイ透過度", {
    min: 0,
    max: 100,
    default: 50,
  }),
});

export type HeroConfig = z.infer<typeof heroConfigSchema>;

// definitions/hero/metadata.ts
import type { SectionMetadata } from "../../types";

export const heroMetadata: SectionMetadata = {
  label: "ヒーロー",
  description: "ページ上部のメインビジュアルセクション",
  icon: "IconPhoto",
  category: "hero",
};
```

### 6. レジストリ

```typescript
// registry.ts
import type { SectionDefinition } from "./types";

// 各 definition を静的 import（ビルド時解決）
import { heroConfigSchema } from "./definitions/hero/schema";
import { heroMetadata } from "./definitions/hero/metadata";
import { ctaConfigSchema } from "./definitions/cta/schema";
import { ctaMetadata } from "./definitions/cta/metadata";
// ... 全17タイプ + CLI追加分

const definitions: Record<string, SectionDefinition> = {
  hero: {
    type: "hero",
    configSchema: heroConfigSchema,
    metadata: heroMetadata,
  },
  cta: { type: "cta", configSchema: ctaConfigSchema, metadata: ctaMetadata },
  // ...
};

/** タイプ文字列からセクション定義を取得 */
export function getSectionDefinition(
  type: string,
): SectionDefinition | undefined {
  return definitions[type];
}

/** 全セクション定義を取得（管理画面のタイプピッカー用） */
export function getAllSectionDefinitions(): SectionDefinition[] {
  return Object.values(definitions);
}

/** カテゴリ別にグループ化 */
export function getSectionDefinitionsByCategory(): Record<
  string,
  SectionDefinition[]
> {
  const result: Record<string, SectionDefinition[]> = {};
  for (const def of Object.values(definitions)) {
    const cat = def.metadata.category;
    (result[cat] ??= []).push(def);
  }
  return result;
}

/** config を検証（型安全） */
export function validateSectionConfig(type: string, config: unknown) {
  const def = definitions[type];
  if (!def)
    return { success: false as const, error: `Unknown section type: ${type}` };
  return def.configSchema.safeParse(config);
}

/** config にデフォルト値を適用 */
export function getDefaultConfig(type: string): Record<string, unknown> {
  const def = definitions[type];
  if (!def) return {};
  const result = def.configSchema.safeParse({});
  return result.success ? (result.data as Record<string, unknown>) : {};
}
```

### 7. SectionRenderer（公開ページ）

```typescript
// src/app/(public)/_shared/components/sections/section-renderer.tsx

import type { PublicSection } from "@/shared/domain/sections/queries";
import { getSectionDefinition } from "@/shared/lib/sections/registry";

// コンポーネントマップ（静的 import）
import { HeroSection } from "./hero/hero-section";
import { CtaSection } from "./cta/cta-section";
// ... 全コンポーネント

const componentMap: Record<string, React.ComponentType<SectionProps<unknown>>> = {
  hero: HeroSection,
  cta: CtaSection,
  // ...
};

export function SectionRenderer({ section }: { section: PublicSection }) {
  if (!section.isActive) return null;

  const def = getSectionDefinition(section.type);
  if (!def) return null;

  const Component = componentMap[section.type];
  if (!Component) return null;

  const parseResult = def.configSchema.safeParse(section.config);
  const config = parseResult.success ? parseResult.data : getDefaultConfig(section.type);
  const design = parseSectionDesign(section.design);

  return <Component config={config} design={design} section={section} />;
}
```

### 8. 自動フォーム生成（管理画面）

Zod スキーマの `.describe()` に埋め込まれた `FieldMeta` JSON を解析し、対応する UI コンポーネントを動的レンダリング。

```typescript
// auto-form/auto-section-form.tsx

"use client";

import type { z } from "zod";
import { extractFieldMeta } from "./field-meta-extractor";
import { TextFieldRenderer, NumberFieldRenderer, SelectFieldRenderer,
         BooleanFieldRenderer, ImageFieldRenderer, ColorFieldRenderer,
         ArrayFieldRenderer, GroupFieldRenderer } from "./field-renderers";

interface AutoSectionFormProps {
  schema: z.ZodType;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function AutoSectionForm({ schema, values, onChange }: AutoSectionFormProps) {
  // ZodObject の shape から各フィールドを抽出
  const fields = extractFieldsFromSchema(schema);

  return (
    <div className="space-y-6">
      {fields.map((fieldDef) => {
        const Renderer = fieldRenderers[fieldDef.meta.fieldType];
        if (!Renderer) return null;
        return (
          <Renderer
            key={fieldDef.key}
            field={fieldDef}
            value={values[fieldDef.key]}
            onChange={(v) => onChange({ ...values, [fieldDef.key]: v })}
          />
        );
      })}
    </div>
  );
}

const fieldRenderers: Record<string, React.ComponentType<FieldRendererProps>> = {
  text: TextFieldRenderer,
  textarea: TextareaFieldRenderer,
  number: NumberFieldRenderer,
  boolean: BooleanFieldRenderer,
  select: SelectFieldRenderer,
  image: ImageFieldRenderer,
  color: ColorFieldRenderer,
  url: UrlFieldRenderer,
  icon: IconFieldRenderer,
  array: ArrayFieldRenderer,
  group: GroupFieldRenderer,
};
```

### 9. 固定ページのマイグレーション

全固定ページを `about` ページと同じパターンに統一:

```typescript
// 統一パターン: page.tsx
export default async function ContactPage() {
  await connection();

  const [sections, turnstileSiteKey] = await Promise.all([
    getPageSectionsWithFallback("contact"),
    getTurnstileSiteKey(),
  ]);

  // sections からヒーローセクションを抽出（先頭の hero タイプ）
  const heroSection = sections.find((s) => s.type === "hero" || s.type === "hero-parallax");
  const otherSections = sections.filter((s) => s !== heroSection);

  // ページ固有コンテンツの前後にセクションを配置
  return (
    <>
      {/* ヒーロー（セクションから） */}
      {heroSection && <SectionRenderer section={heroSection} />}

      {/* ページ固有コンテンツ（フォーム、リスト等） */}
      <section className="py-[var(--spacing-section)]">
        <Container>
          <ContactForm turnstileSiteKey={turnstileSiteKey} />
        </Container>
      </section>

      {/* 残りのセクション（CTA等） */}
      {otherSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
```

**ページ別の移行内容**:

| ページ      | 現状                                                    | 移行後                                                         |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Homepage    | PageContent (hero/concept/features/cta) + SpaceShowcase | sections (hero/concept/features/cta) + SpaceShowcase(Suspense) |
| About       | sections + PageContent (hero)                           | sections のみ                                                  |
| Contact     | PageContent (hero) + hardcoded form                     | sections (hero/cta) + form                                     |
| FAQ         | PageContent (hero) + FaqItem query                      | sections (hero/cta) + FaqAccordion                             |
| News        | PageContent (hero) + paginated list                     | sections (hero/cta) + list                                     |
| Posts       | PageContent (hero) + filtered list                      | sections (hero/cta) + list                                     |
| Privacy     | sections + PageContent (hero)                           | sections のみ                                                  |
| Terms       | sections + PageContent (hero)                           | sections のみ                                                  |
| Reservation | PageContent (hero) + wizard form                        | sections (hero/cta) + wizard                                   |
| Spaces      | PageContent (hero+desc) + filtered list                 | sections (hero/cta) + list                                     |

### 10. Seed データ移行

`prisma/seed.ts` の PageContent upsert を Page + Section upsert に変換:

```typescript
// BEFORE (seed.ts)
await prisma.pageContent.upsert({
  where: { pageKey: "contact" },
  update: {},
  create: {
    pageKey: "contact",
    content: { hero: { title: "お問い合わせ", description: "..." } },
    metaTitle: "お問い合わせ",
  },
});

// AFTER (seed.ts)
const contactPage = await prisma.page.upsert({
  where: { slug: "contact" },
  update: {},
  create: {
    slug: "contact",
    title: "お問い合わせ",
    isSystemPage: true,
    isPublished: true,
    metaDescription: "ご質問・ご相談はお気軽にどうぞ",
  },
});

// DEFAULT_PAGE_SECTIONS["contact"] からセクションを生成
await seedPageSections(
  prisma,
  contactPage.id,
  DEFAULT_PAGE_SECTIONS["contact"],
);
```

### 11. CLI スキル: `create-section-type`

新しいセクションタイプを追加するための CLI スキル。

**生成するファイル**:

1. `src/shared/lib/sections/definitions/<type>/schema.ts`
2. `src/shared/lib/sections/definitions/<type>/metadata.ts`
3. `src/app/(public)/_shared/components/sections/<type>/<type>-section.tsx`
4. `registry.ts` に import + 登録追加

**Prisma マイグレーション不要** — `Section.type` が `String` のため。

### 12. 管理画面の変更

**セクション追加ダイアログ**:

- 現行: `SectionType` enum から固定リスト表示
- 変更後: `getAllSectionDefinitions()` から動的生成、カテゴリでグループ化

**セクション設定フォーム**:

- 現行: 各タイプ手書きの config-form コンポーネント（17ファイル）
- 変更後: `AutoSectionForm` が Zod スキーマから自動生成

**削除するファイル**:

- `config-forms/hero-config-form.tsx` 等の手書きフォーム 17 ファイル
- `section-metadata.ts`（中央定義 → 各 definition に分散）
- `section-defaults.ts`（getter 群 → schema の default() に統合）

### 13. enum → String のマッピング

既存データの互換性のため、enum 値を小文字ケバブケースに変換:

| 旧 enum          | 新 String        |
| ---------------- | ---------------- |
| `HERO`           | `hero`           |
| `HERO_PARALLAX`  | `hero-parallax`  |
| `CUSTOM`         | `custom`         |
| `CONCEPT`        | `concept`        |
| `SPACE_LIST`     | `space-list`     |
| `SPACE_SHOWCASE` | `space-showcase` |
| `NEWS_LIST`      | `news-list`      |
| `POST_LIST`      | `post-list`      |
| `FAQ_LIST`       | `faq-list`       |
| `FEATURES`       | `features`       |
| `TESTIMONIAL`    | `testimonial`    |
| `GALLERY`        | `gallery`        |
| `CTA`            | `cta`            |
| `CONTACT_FORM`   | `contact-form`   |
| `MAP`            | `map`            |
| `EMBED`          | `embed`          |
| `INSTAGRAM`      | `instagram`      |

---

### 14. design JSON フィールドの扱い

`Section.design` JSON は全セクション共通のビジュアル設定（背景色、パディング、アニメーション等）を格納する。**変更なし** — 既存の `parseSectionDesign()` と `section-design.ts` をそのまま維持。`design` は `config` と異なりセクションタイプに依存しない共通構造のため、レジストリに含めない。

### 15. CUSTOM セクション（Lexical エディタ）の扱い

CUSTOM タイプは `contentJson`（Lexical EditorState）+ `contentHtml`（キャッシュ済み HTML）を使用する特殊なセクション。auto-form ではなく、既存の Lexical エディタを直接レンダリング。

```typescript
// definitions/custom/schema.ts
export const customConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル"),
  maxWidth: field.select("最大幅", {
    options: [
      { value: "default", label: "標準" },
      { value: "narrow", label: "狭い" },
      { value: "wide", label: "広い" },
    ] as const,
    default: "default",
  }),
});
// NOTE: contentJson/contentHtml は Section モデルのフィールドであり、config には含めない
// 管理画面は CUSTOM タイプ検出時に Lexical エディタを config フォームの上に表示する
```

### 16. `as` 使用箇所の例外登録

`field-helpers.ts` の `withMeta()` 関数は Zod の `.describe()` が同一型を返す保証を型レベルで表現できないため、`as T` を使用する。`type-safety.md` の許可例外に追加する。`keysOf` / `entriesOf` と同じ「境界ヘルパー」パターン。

---

## スコープ外

- セクション内リッチテキスト（CUSTOM タイプの Lexical エディタ）の変更 — 既存のまま維持
- 管理画面のデザイン変更 — 既存の Swiss Industrial Admin テーマを維持
- 公開ページの見た目変更 — 既存のレンダリングを維持（移行のみ）
- マイページ・ログイン等の認証ページ — セクション管理の対象外
- `Section.design` の構造変更 — 既存の共通ビジュアル設定をそのまま維持

---

## 実装順序（概要）

### Phase 1: 基盤構築

1. field ヘルパー + 型定義
2. 17 セクション定義を definitions/ に移行
3. レジストリ実装
4. Prisma スキーマ変更（enum → String, PageContent 削除）
5. マイグレーション + Seed 移行

### Phase 2: 管理画面

6. AutoSectionForm（自動フォーム生成）
7. セクション追加ダイアログの動的化
8. 手書き config-form の削除

### Phase 3: 公開ページ移行

9. SectionRenderer のレジストリベース化
10. 10 ページの PageContent → Section 移行
11. PageContent 関連コード全削除

### Phase 4: CLI 統合

12. `create-section-type` スキル作成
13. `create-page-content` スキルの廃止 → `create-page` スキルに置換
14. CLAUDE.md / rules 更新

---

## 成功基準

- [ ] 全公開ページがセクション単位で管理画面から編集可能
- [ ] CLI が `definitions/` にディレクトリを追加するだけで新セクションタイプが使用可能（マイグレーション不要）
- [ ] 管理画面のフォームが Zod スキーマから自動生成される
- [ ] `PageContent` モデルが完全に廃止されている
- [ ] `SectionType` enum が完全に廃止されている
- [ ] `bun run validate && bun run build` が通る
- [ ] 既存のセクション編集（DnD、表示/非表示、削除）が動作する
