---
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod 配列 uniqueness 契約

> Zod 4.3 対応

## 配列要素の uniqueness 契約（React key 安全性）

配列要素を React key として使う可能性がある場合、Zod スキーマで重複を拒否する。UI 層の Set dedup は禁止（責務逸脱・データ契約が暗黙化）:

```typescript
// primitive string[] — .refine() で重複拒否
const imageUrlsSchema = z
  .array(z.string().url())
  .refine((arr) => new Set(arr).size === arr.length, {
    error: "同じ画像を複数登録することはできません",
  });

// conform 配列フィールドの object[] — 同フィールドで dedupe
const buttonsSchema = z
  .array(z.object({ url: z.string(), text: z.string() }))
  .refine((arr) => new Set(arr.map((b) => b.url)).size === arr.length, {
    error: "同じURLのボタンを複数登録することはできません",
  });

// cross-field 重複（mainImage ↔ imageUrls）— top-level refine
export const spaceFormSchema = z
  .object({ mainImageUrl: z.string(), imageUrls: imageUrlsSchema /* ... */ })
  .refine((data) => !data.imageUrls.includes(data.mainImageUrl), {
    error: "メイン画像と同じURLを追加画像に登録することはできません",
    path: ["imageUrls"],
  });

// discriminated union — 合成キーで dedupe
const sidebarWidgetsSchema = z
  .array(z.union([builtinWidgetSchema, customWidgetSchema]))
  .refine((widgets) => {
    const keys = widgets.map((w) =>
      w.type === "custom" ? `custom:${w.id}` : `builtin:${w.type}`,
    );
    return new Set(keys).size === keys.length;
  });

// read-side 防御層（write-side 厳格化 + historical data 自己修復）
const stringArraySchema = z
  .array(z.string())
  .transform((arr) => Array.from(new Set(arr)));
```

**ルール:**

- write-side（フォーム送信 / Server Action 入力）は `.refine()` で厳格拒否
- read-side（DB JSON パーサー `parseStringArray` 等）は `.transform()` で silent dedupe（historical data の自己修復）
- 外部 API 応答（Instagram 等）は `.transform()` で防御的 dedupe（契約外事象への備え）

## 複雑な cross-field 検証は `.superRefine()` を parent level で

nested schema に `.refine()` を付けると ZodEffects 化して `.omit()` / `.extend()` が使えなくなる。

解決策: validation 本体を `collectXxxIssues(data, pathPrefix, ctx)` ヘルパーとして shared に抽出し、parent schema の `.superRefine()` から呼ぶ:

```typescript
// src/shared/lib/validations/business-hours.ts
export function collectBusinessHoursWeekIssues(
  week: BusinessHoursWeek,
  pathPrefix: readonly (string | number)[],
  ctx: z.RefinementCtx,
): void {
  for (const day of ["monday", "tuesday" /* ... */] as const) {
    const d = week[day];
    if (d.isOpen && d.slots.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "営業日には最低1つの時間帯を設定してください",
        path: [...pathPrefix, day, "slots"],
      });
    }
  }
}

// 呼び出し側: parent schema で .superRefine()
export const businessHoursSettingsSchema = z
  .object({ businessHours: businessHoursWeekSchema /* ... */ })
  .superRefine((data, ctx) => {
    collectBusinessHoursWeekIssues(data.businessHours, ["businessHours"], ctx);
  });
```

**利点:** nested schema は ZodObject のまま、検証ロジックは shared に集約、UI / Zod / 他モデルで同一ロジックを再利用。
