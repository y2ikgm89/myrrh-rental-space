---
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod バリデーションスキーマ構築

> Zod 4.3 対応

> 詳細サブルール（path-scoped auto-load）:
>
> - **基本スキーマ + 複合 + .extend() 合成 + URL + datetime-local 連携 (JST 変換)** — `zod-patterns/validation-schemas/basics.md`
> - **useFieldArray + safeParse + Discriminated default + prefault + Length introspection + .default([]) skip + Read/Write 分離** — `zod-patterns/validation-schemas/advanced.md`

## URL パラメータバリデーション

```typescript
// @/shared/lib/validations/params.ts — 'use cache' 関数の入口検証
export const slugParamSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const idParamSchema = z.string().min(1).max(100);
```

## React Hook Form 連携

```typescript
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

// フォーム用スキーマ（空文字許可・文字列型）を resolver に渡す
const form = useForm<PostFormData>({
  resolver: zodResolver(postFormSchema),
  defaultValues: { title: "", slug: "" },
});
```

**注意**: React Hook Form に渡すスキーマはフォーム用（空文字許可・文字列型）。Server Action 側で改めてサーバー用スキーマで検証する二段構成。

## Zod 4 新機能

### z.fromJSONSchema()

```typescript
import { z } from "zod";

const schema = z.fromJSONSchema({
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    age: { type: "number", minimum: 0 },
  },
  required: ["name"],
});
```

## ファイル配置

| パス                                  | 内容                                                        |
| ------------------------------------- | ----------------------------------------------------------- |
| `@/shared/lib/validations/enums.ts`   | Prisma enum 型ガード（`isValid*` / `getValid*`）、re-export |
| `@/shared/lib/validations/seo.ts`     | SEO/OGP 共通スキーマ（Server Action 用 + フォーム用）       |
| `@/shared/lib/validations/section.ts` | セクション設定スキーマ                                      |
| `@/shared/lib/validations/lexical.ts` | Lexical EditorState JSON バリデーション                     |
| `@/shared/lib/validations/params.ts`  | URL パラメータバリデーション（slugParamSchema 等）          |
| `@/shared/lib/validations/`           | その他共有スキーマ                                          |
| `@/admin/lib/validations/`            | 管理画面専用スキーマ                                        |
| `@/public/lib/validations/`           | 公開ページ専用スキーマ                                      |

## 禁止事項

1. **z.any() / z.unknown() の乱用禁止**
2. **型アサーションとの併用禁止** — `safeParse` の結果は `result.data` をそのまま使用
3. **バリデーションなしの Server Action 禁止** — 入力は必ず `safeParse` でバリデーション後に使用
