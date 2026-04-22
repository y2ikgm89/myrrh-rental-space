# スキーマ例・コードサンプル

> 親 skill: [../SKILL.md](../SKILL.md)

## 型マッピング

| サフィックス | Prisma 型                 | Zod 型                        | TypeScript 型    |
| ------------ | ------------------------- | ----------------------------- | ---------------- |
| `string`     | `String @default("")`     | `z.string().min(1)`           | `string`         |
| `string?`    | `String?`                 | `z.string().nullable()`       | `string \| null` |
| `boolean`    | `Boolean @default(false)` | `z.boolean()`                 | `boolean`        |
| `number`     | `Int @default(0)`         | `z.number().int()`            | `number`         |
| `number?`    | `Int?`                    | `z.number().int().nullable()` | `number \| null` |

## prisma/schema.prisma — フィールド追加

既存フィールドの末尾（`createdAt` の直前）に追加:

```prisma
  // Footer Settings (フッター設定)
  footerTagline  String?
  footerShowLinks  Boolean  @default(true)
```

## src/shared/domain/settings/types.ts

`SettingsData` 型の `createdAt` 直前に追加:

```typescript
footerTagline: string | null;
footerShowLinks: boolean;
```

## src/shared/domain/settings/queries.ts

```typescript
export interface FooterSettings {
  footerTagline: string | null;
  footerShowLinks: boolean;
}

export async function getFooterSettings(): Promise<FooterSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(getCacheTag(CACHE_TAGS.SETTINGS));

  return safeFetch(
    async () => {
      const settings = await prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          footerTagline: true,
          footerShowLinks: true,
        },
      });
      return {
        footerTagline: settings?.footerTagline ?? null,
        footerShowLinks: settings?.footerShowLinks ?? true,
      };
    },
    {
      footerTagline: null,
      footerShowLinks: true,
    },
    {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "getFooterSettings" },
    },
  );
}
```

即時反映が必要な設定（メンテナンスモード等）は `CACHE_LIFE.DYNAMIC_DATA` を使用する。

## src/shared/domain/settings/commands.ts

```typescript
export type FooterSettingsInput = {
  footerTagline: string | null;
  footerShowLinks: boolean;
};

export async function updateFooterSettings(
  data: FooterSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}
```

## actions/settings/schemas.ts — Zod スキーマ

```typescript
export const footerSettingsSchema = z.object({
  footerTagline: z.string().nullable(),
  footerShowLinks: z.boolean(),
});
export type FooterSettingsInput = z.infer<typeof footerSettingsSchema>;
```

## actions/settings/other.ts — Server Action

```typescript
export async function updateFooterSettings(
  input: FooterSettingsInput,
): Promise<MutationResult<null>> {
  const parsed = footerSettingsSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => updateFooterSettingsCommand(parsed.data),
    afterSuccess: () => {
      invalidateLayoutCache();
    },
  });
}
```

## actions/settings/index.ts — export 追加

```typescript
export type { FooterSettingsInput } from "./schemas";
export { updateFooterSettings } from "./other";
```
