---
name: new-section
description: >
  Component-Driven Sections アーキテクチャに準拠した新セクションをスキャフォールド生成する。
  引数: セクション名（kebab-case, 例: hero-video, feature-grid, testimonial-carousel）。
  引数ヒント: <section-name-kebab-case>
---

# New Section スキャフォールド

Component-Driven Sections アーキテクチャに準拠したセクション定義ファイルを生成する。

## Pre-flight チェック

ユーザーに以下を確認:

1. **セクション名**（kebab-case）: 引数から取得、未指定なら質問
2. **カテゴリ**: `hero` | `content` | `list` | `interactive` | `media` | `utility`
3. **dataLoader が必要か**: DB からデータを取得するセクションか？
4. **日本語ラベル**: 管理画面に表示するラベル
5. **簡単な説明**: セクションの用途（日本語）

## 変数マッピング

| Placeholder     | ルール            | 例 (`space-showcase`)          |
| --------------- | ----------------- | ------------------------------ |
| `<kebab-name>`  | kebab-case        | `space-showcase`               |
| `<camelName>`   | camelCase         | `spaceShowcase`                |
| `<PascalName>`  | PascalCase        | `SpaceShowcase`                |
| `<LABEL>`       | 日本語ラベル      | `スペースショーケース`         |
| `<DESCRIPTION>` | 日本語説明        | `スペースをカルーセル表示する` |
| `<ICON>`        | Lucide アイコン名 | `LayoutGrid`                   |
| `<CATEGORY>`    | SectionCategory   | `list`                         |

## 生成パターン

### Pattern A: Simple Section（dataLoader なし）

```
src/app/(public)/_shared/components/sections/standard/<kebab-name>/
├── definition.ts
└── index.ts
```

### Pattern B: List Section（dataLoader あり）

```
src/app/(public)/_shared/components/sections/standard/<kebab-name>/
├── config.ts        ← admin-safe（configSchema + SectionMeta）
├── definition.ts    ← server-only（SectionDefinition + dataLoader）
└── index.ts
```

## テンプレート

### Pattern A: `definition.ts`（Simple）

```typescript
import type { SectionDefinition } from "@/shared/lib/sections/types";
import { z } from "zod/v4";

export const <camelName>ConfigSchema = z.object({
  // TODO: セクション固有のフィールドを追加
  // 全フィールドに .default() 必須
  title: z
    .string()
    .max(100, { error: "100文字以内で入力してください" })
    .optional()
    .meta({ description: "タイトル" }),
});

export type <PascalName>Config = z.output<typeof <camelName>ConfigSchema>;

export const <camelName>Definition: SectionDefinition<typeof <camelName>ConfigSchema> = {
  id: "<kebab-name>",
  meta: {
    label: "<LABEL>",
    description: "<DESCRIPTION>",
    icon: "<ICON>",
    category: "<CATEGORY>",
  },
  configSchema: <camelName>ConfigSchema,
  defaultConfig: <camelName>ConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      import("../../../../../_components/<PascalName>Section").then((m) => ({
        default: m.<PascalName>Section,
      })),
  },
};
```

### Pattern A: `index.ts`（Simple）

```typescript
export { <camelName>Definition, <camelName>ConfigSchema } from "./definition";
export type { <PascalName>Config } from "./definition";
```

### Pattern B: `config.ts`（List — admin-safe）

```typescript
import type { SectionMeta } from "@/shared/lib/sections/types";
import { z } from "zod/v4";

export const <camelName>ConfigSchema = z.object({
  // TODO: セクション固有のフィールドを追加
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(6)
    .meta({ description: "最大表示件数" }),
});

export type <PascalName>Config = z.output<typeof <camelName>ConfigSchema>;

export const <camelName>Meta: SectionMeta<typeof <camelName>ConfigSchema> = {
  id: "<kebab-name>",
  meta: {
    label: "<LABEL>",
    description: "<DESCRIPTION>",
    icon: "<ICON>",
    category: "<CATEGORY>",
  },
  configSchema: <camelName>ConfigSchema,
  defaultConfig: <camelName>ConfigSchema.parse({}),
};
```

### Pattern B: `definition.ts`（List — server-only）

```typescript
import type { SectionDefinition } from "@/shared/lib/sections/types";

import { <camelName>ConfigSchema, <camelName>Meta } from "./config";

export const <camelName>Definition: SectionDefinition<typeof <camelName>ConfigSchema> = {
  ...<camelName>Meta,
  component: {
    type: "server",
    load: () =>
      import("../../../../../_components/<PascalName>Section").then((m) => ({
        default: m.<PascalName>Section,
      })),
  },
  dataLoader: async (config) => {
    // TODO: ドメインクエリをインポートしてデータ取得
    // const { getXxx } = await import("@/shared/domain/sections/queries");
    // const data = await getXxx(config.maxItems);
    // return { data };
    return {};
  },
};
```

### Pattern B: `index.ts`（List）

```typescript
export { <camelName>Definition, <camelName>ConfigSchema } from "./definition";
export type { <PascalName>Config } from "./config";
```

## 登録手順

### Step 1: Public Registry に追加

`src/app/(public)/_shared/lib/sections/register-standard-sections.ts`:

```typescript
import { <camelName>Definition } from "../../components/sections/standard/<kebab-name>";

registerSection(<camelName>Definition);
```

### Step 2: Admin Registry に追加

`src/app/(admin)/admin/(dashboard)/_shared/lib/sections/register-admin-sections.ts`:

**Simple Section の場合:**

```typescript
import { <camelName>Definition } from "@/public/components/sections/standard/<kebab-name>";

registerSectionMeta(<camelName>Definition);
```

**List Section の場合（config.ts から import）:**

```typescript
import { <camelName>Meta } from "@/public/components/sections/standard/<kebab-name>/config";

registerSectionMeta(<camelName>Meta);
```

## ポスト生成チェックリスト

- [ ] configSchema の全フィールドに `.default()` がある
- [ ] `defaultConfig: configSchema.parse({})` が通る
- [ ] meta.icon が有効な Lucide アイコン名
- [ ] category が 6 種のいずれか
- [ ] component.load() が動的 import（code splitting）
- [ ] registry 2 箇所に登録済み
- [ ] List Section の admin registry は `config.ts` から import（`definition.ts` からではない）
- [ ] コンポーネント本体（`<PascalName>Section`）は別途実装が必要 — ここではスキャフォールドしない

## 注意事項

- **コンポーネント本体はこのスキルの範囲外** — `_components/<PascalName>Section.tsx` は `frontend-design` スキルや手動で作成する
- **section-options.ts に新しい enum 値が必要な場合** — `src/shared/lib/validations/section-options.ts` に追加する
- **effects オプション**（`supportsOverlay`, `requiresExperienceShell`）は必要に応じて definition に追加
