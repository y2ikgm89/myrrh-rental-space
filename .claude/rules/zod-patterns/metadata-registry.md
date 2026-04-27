---
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod メタデータと Registry

> Zod 4.3 対応 / ADR 0018

## メタデータと registry（Zod 4 公式パターン）

Zod 4 は `.meta()` / `z.registry<T>()` でスキーマに型安全メタデータを登録する公式 API を提供する。本プロジェクトは ADR 0018（field-registry）でこの API を採用し、フィールドメタデータ（ラベル・プレースホルダー・フィールド種別・グループ等）の SSoT として運用している。

### `.meta()` shorthand（z.globalRegistry）

```typescript
import { z } from "zod";

// .meta() は z.globalRegistry に登録する shorthand
const userSchema = z
  .object({
    email: z.string().email(),
    age: z.number().int(),
  })
  .meta({
    title: "User",
    description: "A registered user",
    examples: [{ email: "a@example.com", age: 20 }],
  });

// 読み取り
const meta = z.globalRegistry.get(userSchema);
// => { title: "User", description: "A registered user", examples: [...] }
```

`.meta()` は `.describe(JSON.stringify(...))` の型安全な後継。`describe()` は文字列のみ受け取るため構造化メタデータが失われるが、`.meta()` は型付きオブジェクトとして保持する。

### カスタム registry `z.registry<T>()`

ドメイン固有のメタデータを型安全に管理したい場合は `z.registry<T>()` でカスタム registry を作成する:

```typescript
// src/shared/lib/sections/field-registry.ts（ADR 0018 参照実装）
import { z } from "zod";

export type FieldMeta = {
  label: string;
  placeholder?: string;
  fieldType: "text" | "textarea" | "select" | /* ... */;
  group: "content" | "design" | "advanced";
  maxLength?: number;
};

export const fieldRegistry = z.registry<FieldMeta>();

// スキーマに登録
const titleSchema = z
  .string()
  .max(100)
  .register(fieldRegistry, {
    label: "タイトル",
    fieldType: "text",
    group: "content",
    maxLength: 100,
  });

// 読み取り（型安全）
const meta = fieldRegistry.get(titleSchema);
// => FieldMeta | undefined
```

### GlobalMeta augmentation（プロジェクト共通メタデータ型）

```typescript
declare module "zod" {
  interface GlobalMeta {
    deprecated?: boolean;
    seoWeight?: "high" | "medium" | "low";
  }
}

const schema = z.string().meta({
  title: "Title",
  deprecated: false, // 型補完が効く
  seoWeight: "high",
});
```

**本プロジェクトの採用方針**:

- **フィールドメタデータ**（セクション編集 UI 用）: `z.registry<FieldMeta>()` でカスタム registry（`fieldRegistry`、ADR 0018）
- **汎用メタデータ**（title / description 等）: `.meta()` shorthand（`z.globalRegistry`）
- `.describe(JSON.stringify(...))` + parse パターンは廃止（dead code）

参照実装: `@/shared/lib/sections/field-registry` の `field.text()` / `field.select()` ヘルパーが `fieldRegistry` 経由でメタデータを自動登録する（→ ADR 0018・SSOT 一覧の「管理画面 セクション編集」節）。
