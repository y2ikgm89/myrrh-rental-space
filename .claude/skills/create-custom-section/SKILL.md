---
name: create-custom-section
description: カスタムセクションのスキャフォールドを生成する。definition.ts、コンポーネント.tsx、index.ts を custom/ ディレクトリに作成し、レジストリ登録まで行う。
argument-hint: <SectionName> <category>
allowed-tools: Read, Write, Edit, Glob, Grep
context: fork
---

# カスタムセクション生成

コンポーネント駆動セクションアーキテクチャに準拠したカスタムセクションを生成します。

## 引数

- `SectionName`: PascalCase（例: `Feature`, `Pricing`, `TeamIntro`）
- `category`: `hero` | `content` | `list` | `interactive` | `media` | `utility`

## 生成ファイル

| ファイル | パス | 内容 |
|---|---|---|
| `definition.ts` | `src/app/(public)/_shared/components/sections/custom/<kebab-name>/definition.ts` | configSchema + SectionDefinition |
| `<Name>Section.tsx` | `src/app/(public)/_shared/components/sections/custom/<kebab-name>/<Name>Section.tsx` | セクションコンポーネント |
| `index.ts` | `src/app/(public)/_shared/components/sections/custom/<kebab-name>/index.ts` | barrel export |

## 実行手順

### 1. 要件確認

ユーザーに以下を確認:

- セクションの目的（何を表示するか）
- 設定可能なフィールド（タイトル、画像URL、テキスト等）
- カテゴリ（hero / content / list / interactive / media / utility）
- GSAP / Three.js / PixiJS の使用有無
- Server Component / Client Component の選択

### 2. ファイル生成

#### 2-1. definition.ts

```typescript
import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";

export const <camelName>ConfigSchema = z.object({
  // 全フィールドに .default() と .meta() を付与
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("")
    .meta({ description: "タイトル", fieldType: "text" }),
  subtitle: z
    .string()
    .max(300, { error: "サブタイトルは300文字以内です" })
    .default("")
    .meta({ description: "サブタイトル", fieldType: "textarea" }),
  // ... 追加フィールド
});

export type <PascalName>Config = z.output<typeof <camelName>ConfigSchema>;

export const <camelName>Definition: SectionDefinition<typeof <camelName>ConfigSchema> = {
  id: "<kebab-name>",
  meta: {
    label: "<日本語ラベル>",
    description: "<日本語説明>",
    icon: "<LucideアイコンKeyName>",
    category: "<category>",
  },
  configSchema: <camelName>ConfigSchema,
  defaultConfig: <camelName>ConfigSchema.parse({}),
  component: {
    type: "server",  // or "client" / "client-only"
    load: () =>
      import("./<PascalName>Section").then((m) => ({
        default: m.<PascalName>Section,
      })),
  },
};
```

**dataLoader が必要な場合**（リスト系セクション等、server-only 依存あり）:

definition.ts とは別に `config.ts` を作成し、管理画面用 meta を分離する:

```typescript
// config.ts — admin-safe（server-only 依存なし）
import { z } from "zod";
import type { SectionMeta } from "@/shared/lib/sections/admin-registry";

export const <camelName>ConfigSchema = z.object({ /* ... */ });

export const <camelName>Meta: SectionMeta<typeof <camelName>ConfigSchema> = {
  id: "<kebab-name>",
  meta: { label: "...", description: "...", icon: "...", category: "..." },
  configSchema: <camelName>ConfigSchema,
  defaultConfig: <camelName>ConfigSchema.parse({}),
};
```

```typescript
// definition.ts — server-only 依存を含む
import { <camelName>Meta, <camelName>ConfigSchema } from "./config";
import type { SectionDefinition } from "@/shared/lib/sections/types";

export const <camelName>Definition: SectionDefinition<typeof <camelName>ConfigSchema> = {
  ...<camelName>Meta,
  component: { type: "server", load: () => import("./<PascalName>Section").then((m) => ({ default: m.<PascalName>Section })) },
  dataLoader: async (config) => {
    const { getSomeData } = await import("@/public/data/some-query");
    return { items: await getSomeData(config.limit) };
  },
};
```

#### 2-2. コンポーネント（Server Component）

```typescript
import type { SectionComponentProps } from "@/shared/lib/sections/types";
import type { <PascalName>Config } from "./definition";

export function <PascalName>Section({
  config,
  design,
  section,
}: SectionComponentProps<<PascalName>Config>) {
  return (
    <section
      className="py-24 md:py-32 lg:py-40"
      style={{
        backgroundColor: design.backgroundColor ?? undefined,
        color: design.textColor ?? undefined,
      }}
    >
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        {config.title && (
          <h2 className="font-heading text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
            {config.title}
          </h2>
        )}
        {config.subtitle && (
          <p className="mt-4 text-muted-foreground">{config.subtitle}</p>
        )}
      </div>
    </section>
  );
}
```

#### 2-2b. コンポーネント（Client Component — GSAP 使用時）

```typescript
"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { DURATION, EASE, SCROLL_TRIGGER } from "@/public/lib/animations";
import type { SectionComponentProps } from "@/shared/lib/sections/types";
import type { <PascalName>Config } from "./definition";

export function <PascalName>Section({
  config,
  design,
  section,
}: SectionComponentProps<<PascalName>Config>) {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = sectionRef.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          el.querySelectorAll(".animate-item"),
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger: 0.1,
            scrollTrigger: {
              trigger: el,
              ...SCROLL_TRIGGER.reveal,
            },
          },
        );
      });
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="py-24 md:py-32 lg:py-40"
      style={{
        backgroundColor: design.backgroundColor ?? undefined,
        color: design.textColor ?? undefined,
      }}
    >
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        {config.title && (
          <h2 className="animate-item font-heading text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
            {config.title}
          </h2>
        )}
      </div>
    </section>
  );
}
```

#### 2-3. index.ts

```typescript
export { <camelName>Definition } from "./definition";
```

### 3. レジストリ登録

#### 3-1. 公開ページレジストリ

`src/app/(public)/_shared/lib/sections/register-standard-sections.ts` に追加:

```typescript
import { <camelName>Definition } from "../../components/sections/custom/<kebab-name>";

registerSection(<camelName>Definition);
```

#### 3-2. 管理画面レジストリ

`src/app/(admin)/admin/(dashboard)/_shared/lib/sections/register-admin-sections.ts` に追加:

**dataLoader なしの場合**（definition.ts を直接 import）:

```typescript
import { <camelName>Definition } from "@/public/components/sections/custom/<kebab-name>";

registerSectionMeta(<camelName>Definition);
```

**dataLoader ありの場合**（config.ts から meta を import）:

```typescript
import { <camelName>Meta } from "@/public/components/sections/custom/<kebab-name>/config";

registerSectionMeta(<camelName>Meta);
```

### 4. 検証

```bash
bun run validate
```

## Zod configSchema ルール

- **全フィールドに `.default()` を付与** — `configSchema.parse({})` がエラーなく通ること
- **全フィールドに `.meta({ description: "...", fieldType: "..." })` を付与** — 管理画面 SchemaForm が UI を自動生成する
- **`{ error: "..." }` パラメータ** — Zod 4 形式（`message:` は非推奨）
- **optional URL フィールド**: `.url().optional().or(z.literal(""))` パターン

### fieldType 一覧

| fieldType | UI | 用途 |
|---|---|---|
| `text` | `<input type="text">` | 短いテキスト |
| `textarea` | `<textarea>` | 長いテキスト |
| `number` | `<input type="number">` | 数値 |
| `image` | 画像アップロード | 画像URL |
| `select` | `<select>` | z.enum() の選択肢 |
| `color` | カラーピッカー | 色指定 |
| `array` | 動的リスト | 配列フィールド |
| `switch` | トグルスイッチ | boolean |

## アイコン

`icon` フィールドには Lucide React のアイコン名（KeyName）を文字列で指定:
`"Image"`, `"LayoutGrid"`, `"List"`, `"MessageSquare"`, `"Map"`, `"Code"`, `"Instagram"`, `"Star"`, `"Users"`, `"Zap"` 等。

## チェックリスト

- [ ] 全フィールドに `.default()` — `configSchema.parse({})` がエラーなく通る
- [ ] 全フィールドに `.meta({ description, fieldType })` — SchemaForm 自動生成対応
- [ ] `component.type` が正しい（`"server"` / `"client"` / `"client-only"`）
- [ ] GSAP 使用時は `gsap-config.ts` 経由 import + `useGSAP` + `scope` + `matchMedia`
- [ ] `register-standard-sections.ts` に `registerSection()` 追加
- [ ] `register-admin-sections.ts` に `registerSectionMeta()` 追加
- [ ] dataLoader ありの場合は `config.ts` 分離パターン使用
- [ ] テーマ変数使用（ハードコードカラー禁止）
- [ ] `bun run validate` 通過
