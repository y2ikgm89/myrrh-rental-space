# AutoSectionForm 品質改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AutoSectionForm の3つの品質問題（Switch 制御バグ、画像フィールド未統合、バリデーションエラー非表示）を修正し、管理画面のセクション編集 UX を改善する。

**Architecture:** `auto-section-form.tsx` の `AutoFieldByType` に `formState.errors` を渡し、各フィールドにエラー表示を追加。boolean は `useController` で RHF 制御に統一した独立コンポーネントに抽出。image は既存の `AutoImageField`（メディアピッカー統合済み）を接続。

**Tech Stack:** React 19, React Hook Form, Zod 4, Radix UI Switch, useSingleMediaPicker

---

## File Structure

| ファイル                                                              | 操作         | 責務                                                      |
| --------------------------------------------------------------------- | ------------ | --------------------------------------------------------- |
| `pages/[slug]/_sections/_components/auto-section-form.tsx`            | **Modify**   | `formState.errors` の伝播、image/boolean ケースの書き換え |
| `pages/[slug]/_sections/_components/auto-fields/AutoBooleanField.tsx` | **Create**   | `useController` ベースの制御された boolean フィールド     |
| `pages/[slug]/_sections/_components/auto-fields/AutoImageField.tsx`   | **Existing** | 変更不要（既に完成済み）                                  |

> パスプレフィックス: `src/app/(admin)/admin/(dashboard)/`

---

### Task 1: AutoBooleanField — useController ベースの制御された Switch

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoBooleanField.tsx`

- [ ] **Step 1: AutoBooleanField コンポーネントを作成**

```tsx
"use client";

/**
 * AutoBooleanField — useController ベースの制御された Switch
 *
 * RHF の useController で状態を同期し、Switch の checked prop がリアクティブに更新される。
 * defaultValue のみ参照する旧実装のバグ（トグルしても UI が更新されない）を修正。
 */

import { useController, type Control } from "react-hook-form";
import { Label, Switch } from "@/admin/components/ui";

interface AutoBooleanFieldProps {
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RHF generic compatibility
  readonly control: Control<any>;
  readonly isPending: boolean;
  readonly error: string | undefined;
}

export function AutoBooleanField({
  fieldKey,
  fieldId,
  label,
  helpText,
  control,
  isPending,
  error,
}: AutoBooleanFieldProps) {
  const { field } = useController({
    control,
    name: fieldKey,
  });

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Switch
          id={fieldId}
          checked={field.value === true}
          onCheckedChange={field.onChange}
          disabled={isPending}
        />
        <Label htmlFor={fieldId}>{label}</Label>
        {helpText && (
          <p className="text-xs text-muted-foreground ml-2">{helpText}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: PASS（新規ファイルのみ、既存コードに影響なし）

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoBooleanField.tsx'
git commit -m "feat(sections): add AutoBooleanField with useController for reactive Switch"
```

---

### Task 2: AutoSectionForm — エラー表示 + image/boolean 統合

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`

- [ ] **Step 1: formState.errors を分割代入に追加し、AutoBooleanField と AutoImageField を import**

`useForm` の分割代入を変更:

```tsx
// 変更前（line ~91-106 付近）
const {
  register,
  handleSubmit,
  setValue,
  control,
  formState: { isDirty },
} = useForm<Record<string, unknown>>({...});

// 変更後
const {
  register,
  handleSubmit,
  setValue,
  control,
  formState: { isDirty, errors },
} = useForm<Record<string, unknown>>({...});
```

import セクションに追加:

```tsx
import { AutoBooleanField } from "./auto-fields/AutoBooleanField";
```

（`AutoImageField` は既に import されている可能性があるため確認。されていなければ追加:）

```tsx
import { AutoImageField } from "./auto-fields/AutoImageField";
```

- [ ] **Step 2: AutoFieldByType の props に error と control を追加**

`AutoFieldByTypeProps` interface に追加:

```tsx
readonly error: string | undefined;
```

`AutoField` コンポーネント内の `AutoFieldByType` 呼び出しにエラーを渡す:

```tsx
// AutoField コンポーネント内（line ~195 付近）
const errorMessage = errors[key]?.message;

return (
  <AutoFieldByType
    // ... existing props
    error={typeof errorMessage === "string" ? errorMessage : undefined}
  />
);
```

- [ ] **Step 3: boolean ケースを AutoBooleanField に置き換え**

`AutoFieldByType` 内の `case "boolean":` を書き換え:

```tsx
// 変更前
case "boolean":
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={fieldId}
        checked={typeof defaultValue === "boolean" ? defaultValue : false}
        onCheckedChange={(checked) => setValue(fieldKey, checked)}
        disabled={isPending}
      />
      <Label htmlFor={fieldId}>{label}</Label>
      {helpText && (
        <p className="text-xs text-muted-foreground ml-2">{helpText}</p>
      )}
    </div>
  );

// 変更後
case "boolean":
  return (
    <AutoBooleanField
      fieldKey={fieldKey}
      fieldId={fieldId}
      label={label}
      helpText={helpText}
      control={control}
      isPending={isPending}
      error={error}
    />
  );
```

- [ ] **Step 4: image ケースを AutoImageField に置き換え**

`AutoFieldByType` 内の `case "image":` を `case "url":` から分離:

```tsx
// 変更前
case "image":
case "url":
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        type={fieldType === "url" ? "url" : "text"}
        {...register(fieldKey)}
        placeholder={...}
        disabled={isPending}
      />
      {helpText && (...)}
    </div>
  );

// 変更後 — image と url を分離
case "image":
  return (
    <div className="space-y-1">
      <AutoImageField
        fieldId={fieldId}
        label={label}
        value={typeof defaultValue === "string" ? defaultValue : undefined}
        onSelect={(url) => setValue(fieldKey, url, { shouldDirty: true })}
        helpText={helpText}
        disabled={isPending}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );

case "url":
  return (
    <div className="space-y-1">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        type="url"
        {...register(fieldKey)}
        placeholder={placeholder ?? "https://..."}
        disabled={isPending}
      />
      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
```

- [ ] **Step 5: 残りの全フィールドタイプにエラー表示を追加**

text, textarea, number, color, select, array, group の各 case に `{error && <p>}` を追加。
select は `AutoSelectField` に `error` prop を追加して渡す。

各フィールドの closing div 直前に:

```tsx
{
  error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}
```

- [ ] **Step 6: 型チェック確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx'
git commit -m "feat(sections): integrate AutoImageField, AutoBooleanField, field-level errors"
```

---

### Task 3: AutoImageField の image → setValue 連携を useController で改善

`AutoImageField` は `onSelect` callback で `setValue` を呼ぶが、`defaultValue` のみで初期値を渡しているため、保存後に再読み込みしないと表示が更新されない。`useController` で RHF 制御に統一する。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`

- [ ] **Step 1: image ケースを useController ベースに変更**

AutoSectionForm の `AutoFieldByType` 内 image ケースを修正し、`defaultValue` ではなく `control` 経由で値を取得:

```tsx
case "image": {
  // useController は条件分岐内のため別コンポーネントに分離済み（AutoImageFieldControlled）
  return (
    <AutoImageFieldControlled
      fieldKey={fieldKey}
      fieldId={fieldId}
      label={label}
      helpText={helpText}
      control={control}
      isPending={isPending}
      error={error}
    />
  );
}
```

新しいラッパーコンポーネントを `auto-section-form.tsx` 内またはインラインで追加:

```tsx
function AutoImageFieldControlled({
  fieldKey,
  fieldId,
  label,
  helpText,
  control,
  isPending,
  error,
}: {
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly control: Control<any>;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const { field } = useController({ control, name: fieldKey });

  return (
    <div className="space-y-1">
      <AutoImageField
        fieldId={fieldId}
        label={label}
        value={typeof field.value === "string" ? field.value : undefined}
        onSelect={(url) => field.onChange(url)}
        helpText={helpText}
        disabled={isPending}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック + lint 確認**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx'
git commit -m "fix(sections): use useController for image field reactive value sync"
```

---

### Task 4: validate + build 検証

- [ ] **Step 1: 完全検証**

Run: `bun run validate && bun run build`
Expected: PASS（型エラー・lint エラー・ビルドエラーなし）

- [ ] **Step 2: 最終 Commit（必要な場合のみ）**

validate/build でフック修正があった場合のみ追加コミット。
