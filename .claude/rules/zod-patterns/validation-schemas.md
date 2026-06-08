---
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod バリデーションスキーマ構築

> Zod 4 対応

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

## conform 連携 (canonical)

Phase 1 Task 4-8 で全完了した conform 1.19 + Zod 4 + Server Action 統合 SSoT。新規 form は本パターン必須:

```typescript
"use client";
import { useActionState } from "react";
import { useForm } from "@conform-to/react";
import { parseWithZod, getZodConstraint } from "@conform-to/zod/v4"; // Zod 4 専用 subpath
import { postFormSchema } from "@/shared/lib/validations/post";

export function PostForm({ defaultValue }: Props) {
  const [lastResult, action] = useActionState(savePostAction, undefined);
  const [form, fields] = useForm({
    id: "post-form",
    constraint: getZodConstraint(postFormSchema),
    lastResult,
    defaultValue,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: postFormSchema }),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });
  return <form id={form.id} onSubmit={form.onSubmit} action={action}>...</form>;
}
```

Server Action 側は `parseWithZod({ formData, schema })` で **同一 schema** を再実行し、client / server の二段検証は不要（schema 1 元化が conform の優位点）。`executeAdminMutationResult` との統合は `executeConformMutation` SSoT helper（`@/shared/lib/forms/conform-action`）経由。

**conform 採用基準**: 全 admin / public 新規 form は本パターン必須。React Hook Form (`react-hook-form` / `@hookform/resolvers` / `zodResolver` / `standardSchemaResolver` / `useFormAction`) は `package.json` から完全削除済、新規利用不可。inline editor (Posts / News) は本文 useState + 設定 conform `useForm` の dual pattern (`usePostEditor` / `useNewsEditor` 参照)。

**In-place schema preprocess (LocationForm 確立、SpaceEditForm に水平展開)**: canonical schema (`@/shared/lib/validations/<entity>.ts` または `_shared/lib/validations/<entity>.ts`) を in-place 修正で FormData transit (conform) と object literal (test) を両対応にする SSoT pattern。詳細は [`server-actions/implementation/forms-and-public.md`](../server-actions/implementation/forms-and-public.md) §In-place schema preprocess pattern を参照。

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

| パス                                              | 内容                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `@/shared/lib/validations/enums/{guards,helpers}` | Prisma enum 型ガード（`isValid*`、guards）/ デフォルト取得（`getValid*`、helpers） |
| `@/shared/lib/validations/seo.ts`                 | SEO/OGP 共通スキーマ（Server Action 用 + フォーム用）                              |
| `@/shared/lib/validations/section.ts`             | セクション設定スキーマ                                                             |
| `@/shared/lib/validations/lexical.ts`             | Lexical EditorState JSON バリデーション                                            |
| `@/shared/lib/validations/params.ts`              | URL パラメータバリデーション（slugParamSchema 等）                                 |
| `@/shared/lib/validations/`                       | その他共有スキーマ                                                                 |
| `@/admin/lib/validations/`                        | 管理画面専用スキーマ                                                               |
| `@/public/lib/validations/`                       | 公開ページ専用スキーマ                                                             |

## 禁止事項

1. **z.any() / z.unknown() の乱用禁止**
2. **型アサーションとの併用禁止** — `safeParse` の結果は `result.data` をそのまま使用
3. **バリデーションなしの Server Action 禁止** — 入力は必ず `safeParse` でバリデーション後に使用
