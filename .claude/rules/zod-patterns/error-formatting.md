---
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod エラーフォーマット

> Zod 4 対応

## エラーメッセージ（error: パラメータ）

**重要**: Zod 4では `message` パラメータは非推奨。`error` パラメータを使用:

```typescript
import { z } from "zod";

// NG: Zod 3スタイル（非推奨）
z.string().min(1, "タイトルは必須です");
z.string().min(1, { message: "タイトルは必須です" });

// OK: Zod 4スタイル
z.string().min(1, { error: "タイトルは必須です" });
z.string({ error: "フィールドは必須です" });
z.uuid({ error: "有効なUUIDを入力してください" });

// OK: 動的エラーメッセージ（コンテキスト依存）
z.string({
  error: (iss) =>
    iss.input === undefined ? "フィールドは必須です" : "入力が無効です",
});
```

## safeParse + flattenError パターン

```typescript
// バリデーション（safeParse + flattenError）
const validated = updatePostSchema.safeParse(input);
if (!validated.success) {
  return { success: false, error: z.flattenError(validated.error) };
}
```

**`z.flattenError` の出力形式**:

```typescript
{
  formErrors: string[],     // トップレベルエラー
  fieldErrors: {            // フィールド別エラー
    [field: string]: string[]
  }
}
```

## 禁止事項

7. **message: パラメータ禁止（Zod 4）**
   - `{ message: 'エラー' }` → `{ error: 'エラー' }`
