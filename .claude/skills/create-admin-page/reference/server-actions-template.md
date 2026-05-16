# Server Actions テンプレート (conform canonical)

`_shared/actions/<resources>.ts` の雛形。**Phase 1 Task 4-6 で確立した conform `useActionState` + `executeAdminMutationResult` 統合パターンが canonical**。詳細な scaffolding は `create-server-action` skill を使う。

```typescript
"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import prisma from "@/shared/lib/prisma";
import { toPlainObject, toPlainArray } from "@/shared/lib/serialize";
import { <resource>FormSchema } from "@/shared/lib/validations/<resource>";

const idSchema = z.string().uuid({ error: "<Resource> ID が不正です" });

// =============================================================================
// Reader 系（Server Component から直接呼ぶ — Server Action 必須ではない）
// =============================================================================

export async function get<Resource>List({
  q,
  page,
  perPage,
}: {
  q: string;
  page: number;
  perPage: number;
}) {
  const where = q ? { name: { contains: q } } : {};
  const [items, total] = await Promise.all([
    prisma.<resource>.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.<resource>.count({ where }),
  ]);
  return {
    items: toPlainArray(
      items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
    ),
    total,
  };
}

export async function get<Resource>ById(id: string) {
  const item = await prisma.<resource>.findUnique({
    where: { id },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  if (!item) return null;
  return toPlainObject({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
}

// =============================================================================
// Conform-integrated Write Actions
// =============================================================================

export async function create<Resource>(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    <resource>FormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "<resource>",
        action: "create",
        execute: async () =>
          prisma.<resource>.create({ data, select: { id: true } }),
        afterSuccess: () => {
          updateTag(CACHE_TAGS.<RESOURCES>);
        },
        resolveAuditResourceId: (data) => data.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function update<Resource>(
  <resource>Id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    <resource>FormSchema,
    async (data) => {
      const idValid = idSchema.safeParse(<resource>Id);
      if (!idValid.success) {
        return { ok: false, error: "<Resource> ID が不正です" };
      }
      const result = await executeAdminMutationResult({
        resource: "<resource>",
        action: "update",
        resourceId: idValid.data,
        execute: async () => {
          await prisma.<resource>.update({
            where: { id: idValid.data },
            data,
          });
          return null;
        },
        afterSuccess: () => {
          updateTag(CACHE_TAGS.<RESOURCES>);
          updateTag(getCacheTag.<resources>.detail(idValid.data));
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

// =============================================================================
// Non-form Mutation (delete) — 入力ベースのまま維持
// =============================================================================

export async function delete<Resource>(
  id: string,
): Promise<MutationResult<null>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return { error: "<Resource> ID が不正です" };
  }
  return executeAdminMutationResult({
    resource: "<resource>",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await prisma.<resource>.delete({ where: { id: validated.data } });
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.<RESOURCES>);
    },
  });
}
```

## Client 側 (form) 雛形

```typescript
// _components/<Resource>Form.tsx
"use client";

import { useActionState, useEffect, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  useForm,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import { create<Resource>, update<Resource> } from "@/admin/actions/<resource>";
import { <resource>FormSchema } from "@/shared/lib/validations/<resource>";
import type { <Resource>Data } from "@/shared/domain/<resource>/types";
import {
  Button,
  Card,
  Input,
  Label,
  SubmitButton,
} from "@/admin/components/ui";

type Props = { <resource>?: <Resource>Data };

export function <Resource>Form({ <resource> }: Props): ReactElement {
  const router = useRouter();
  const isEdit = !!<resource>;
  const boundAction = isEdit
    ? update<Resource>.bind(null, <resource>.id)
    : create<Resource>;
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `<resource>-edit-${<resource>.id}` : "<resource>-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: <resource>FormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: <resource>
      ? { name: <resource>.name }
      : { name: "" },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(isEdit ? "更新しました" : "作成しました");
      router.push(
        isEdit ? `/admin/<resource>s/${<resource>.id}` : "/admin/<resource>s",
      );
    }
  }, [lastResult, router, isEdit, <resource>]);

  return (
    <form {...getFormProps(form)} action={action}>
      <Card className="p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fields.name.id}>名前 *</Label>
            <Input
              {...getInputProps(fields.name, { type: "text" })}
              disabled={isPending}
            />
            {fields.name.errors && (
              <p
                id={fields.name.errorId}
                className="text-xs text-destructive"
              >
                {fields.name.errors.join(", ")}
              </p>
            )}
          </div>
          {form.errors && form.errors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {form.errors.join(", ")}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label={isEdit ? "更新" : "作成"}
              pendingLabel={isEdit ? "更新中..." : "作成中..."}
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
```

## conform pattern の主要要素

- **`(prev, formData) => SubmissionResult`** Server Action signature (React 19 `useActionState` 公式)
- **`bind` で id 部分適用**: `update<Resource>.bind(null, id)` で `(prev, formData)` 形に変換、`useActionState` に直接渡せる
- **`executeConformMutation` SSoT**: `@/shared/lib/forms/conform-action` の 1 箇所のみ。Server Action 内 `parseWithZod` 直接呼び出し禁止
- **boolean Switch**: `useInputControl` + hidden input で `"on"` / `""` を sync (`z.boolean()` が `parseWithZod` で coerce)
- **string enum Select**: `useInputControl` + `isValidXxx` 型ガード + onValueChange + hidden input
- **数値 field**: `getInputProps({ type: "number" })` + `z.coerce.number()` で FormData string coerce
- **MediaPicker bridge**: `useSingleMediaPicker` + `useInputControl.change()` で sync + hidden input
- **success state**: `lastResult?.initialValue === null` を render 中 derive（`useEffect` 内 setState 禁止）
- **mode 別 schema**: `useForm({ onValidate: ({ formData }) => parseWithZod(formData, { schema: isEdit ? updateSchema : createSchema }) })`

## 禁止事項

- **RHF (`react-hook-form` / `@hookform/resolvers`) 復活禁止** — Phase 1 Task 8 で削除予定
- **`useFormAction` hook scaffold 禁止** — legacy hook、Task 8 で削除予定
- **`standardSchemaResolver` 使用禁止** — `parseWithZod` (`@conform-to/zod/v4`) が canonical
- **Server Action 内 `parseWithZod` 直接呼び出し禁止** — `executeConformMutation` SSoT helper 経由
- **`@conform-to/zod` ルート import 禁止** — Zod v3 用、Zod 4 と非互換。`@conform-to/zod/v4` から `parseWithZod` を import する

## 参照実装

PR #61-#62 で migration 完了の 16 件 form を参照。詳細は `create-server-action` SKILL の §参照実装 参照。
