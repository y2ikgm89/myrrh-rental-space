# Server Actions テンプレート

`_shared/actions/<resources>.ts` の雛形。詳細は `create-server-action` スキルも参照。

```typescript
"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { CACHE_TAGS } from "@/shared/lib/constants";
import prisma from "@/shared/lib/prisma";
import { toPlainObject, toPlainArray } from "@/shared/lib/serialize";
import {
  <resource>FormSchema,
  type <Resource>FormInput,
} from "@/shared/lib/validations/<resource>";

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
    items: toPlainArray(items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))),
    total,
  };
}

export async function get<Resource>ById(id: string) {
  const item = await prisma.<resource>.findUnique({
    where: { id },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  if (!item) return null;
  return toPlainObject({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
}

export async function create<Resource>(
  input: <Resource>FormInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = <resource>FormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "<resource>",
    action: "create",
    execute: async () => prisma.<resource>.create({ data: parsed.data }),
    afterSuccess: () => { updateTag(CACHE_TAGS.<RESOURCES>); },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function update<Resource>(
  id: string,
  input: <Resource>FormInput,
): Promise<MutationResult<null>> {
  const parsed = <resource>FormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "<resource>",
    action: "update",
    resourceId: id,
    execute: async () => {
      await prisma.<resource>.update({ where: { id }, data: parsed.data });
    },
    afterSuccess: () => { updateTag(CACHE_TAGS.<RESOURCES>); },
  });
}

export async function delete<Resource>(
  id: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "<resource>",
    action: "delete",
    resourceId: id,
    execute: async () => { await prisma.<resource>.delete({ where: { id } }); },
    afterSuccess: () => { updateTag(CACHE_TAGS.<RESOURCES>); },
  });
}
```
