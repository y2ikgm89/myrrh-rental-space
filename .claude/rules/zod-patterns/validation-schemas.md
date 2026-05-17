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

## conform 連携 (canonical)

Phase 1 Task 4-6 で確立した conform 1.19 + Zod 4 + Server Action 統合 SSoT。新規 form は本パターン必須:

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

**conform 採用基準**: 全 admin / public 新規 form は本パターン必須。`zodResolver` / `useForm` from `react-hook-form` / `standardSchemaResolver` は **Task 8 残作業 (Task 8.7 SpaceEditForm) + inline editor 別 phase 完了後に `package.json` から削除予定** のため新規利用禁止。残存 RHF 利用 (SpaceEditForm hybrid / auto-section-form / LayoutFields / inline editor side panel 等) は順次 conform 化。

**In-place schema preprocess (Task 8.6 LocationForm 確立)**: canonical schema (`@/shared/lib/validations/<entity>.ts`) を in-place 修正で FormData transit (conform) と object literal (test) を両対応にする SSoT pattern。詳細は [`server-actions/implementation/forms-and-public.md`](../server-actions/implementation/forms-and-public.md) §In-place schema preprocess pattern を参照。**重要**: preprocess の input 型は `unknown` 化するため、`standardSchemaResolver` (RHF) と非互換。schema preprocess 追加は conform 完全移行と同一 commit で行う (途中状態でビルドが通らない)。

### 残存 RHF (Task 8.7 + 別 phase 移行対象、新規利用禁止)

```typescript
// 残存 RHF 編集時の参照のみ — 新規 form では使用しない
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
```

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
