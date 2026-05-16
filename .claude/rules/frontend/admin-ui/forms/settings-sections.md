---
description: 設定ページの Section パターン (conform `useActionState` canonical / Card 統一 / Switch fieldset / SubmitButton 配置 / Accordion ヒント / スキーマ責務分離)
paths:
  - src/app/(admin)/**/settings/**/*.tsx
  - src/app/(admin)/**/settings/**/sections/**
  - src/app/(admin)/**/_shared/components/SettingsLayout.tsx
---

# 設定セクション フォームパターン (conform canonical)

> Phase 1 Task 5 (PR #61) で確立した React 19 `useActionState` + conform `useForm` + `executeConformMutation` 統合パターン。`useFormAction` (RHF) は legacy で新規利用禁止 (Task 8 で削除予定)。

## 設定ページ間の導線（`SettingsLayout` / `CardDescription`）

関連する設定ページへのリンクは `CardDescription` 内または `SettingsLayout description` に `<Link>` で埋め込む。
`SettingsLayout` の `description` は `ReactNode` を受け付ける（例: ナビゲーション管理 ↔ サイト設定レイアウトタブ間の相互リンク）。

## 設定セクションのヒント折りたたみ（Accordion）

3 行以上のヒント・補足リストは Accordion で折りたたむ（デフォルト閉じ）。
1-2 行の短いヒントはインライン表示のまま。PermissionsSection / SidebarSection / RobotsTxtSection が実装例。

```tsx
<Accordion type="single" collapsible>
  <AccordionItem
    value="hints"
    className="rounded-lg border bg-muted/50 px-4 border-b last:border-b"
  >
    <AccordionTrigger className="text-sm">ヒント</AccordionTrigger>
    <AccordionContent>
      <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
        <li>...</li>
      </ul>
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

**禁止**: Collapsible でヒントを折りたたむ（トリガーとコンテンツが分離して見える）

## conform `useActionState` 統一パターン

設定セクション（`settings/_components/sections/`）は React 19 `useActionState` + conform `useForm` (`@conform-to/react`) + `parseWithZod` (`@conform-to/zod/v4`) で統一:

```tsx
// 標準パターン（PR #61 の MaintenanceSection.tsx が canonical 参照実装）
"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { updateMaintenanceSettings } from "@/admin/actions/settings";
import { maintenanceFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Label, Input, Textarea, Switch, SubmitButton,
} from "@/admin/components/ui";

export function MaintenanceSection({ settings }: Props) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateMaintenanceSettings,
    undefined,
  );
  const [form, fields] = useForm({
    id: "maintenance-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: maintenanceFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      maintenanceMode: settings.maintenanceMode ? "on" : "",
      maintenanceMessage: settings.maintenanceMessage ?? "",
    },
  });

  // boolean Switch は useInputControl + hidden input で sync
  const maintenanceMode = useInputControl(fields.maintenanceMode);
  const isActive = maintenanceMode.value === "on";

  // conform v1 公式: resetForm: true の reply は { initialValue: null } のみ
  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("メンテナンス設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>メンテナンス設定</CardTitle>
          <CardDescription>...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Switch + hidden input pattern (useInputControl) */}
          <Switch
            id={fields.maintenanceMode.id}
            checked={isActive}
            onCheckedChange={(checked) =>
              maintenanceMode.change(checked ? "on" : "")
            }
            onBlur={maintenanceMode.blur}
            disabled={isPending}
          />
          <input
            type="hidden"
            name={fields.maintenanceMode.name}
            value={isActive ? "on" : ""}
          />

          {/* Textarea は getTextareaProps */}
          <Textarea
            {...getTextareaProps(fields.maintenanceMessage)}
            placeholder={...}
            disabled={isPending}
          />
          {fields.maintenanceMessage.errors && (
            <p id={fields.maintenanceMessage.errorId} className="text-sm text-destructive">
              {fields.maintenanceMessage.errors.join(", ")}
            </p>
          )}

          {/* 送信ボタン (右寄せ統一) */}
          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="メンテナンス設定を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
```

## SubmitButton 配置（右寄せ統一）

```tsx
// パターン A: 保存ボタンのみ
<div className="flex justify-end pt-2">
  <SubmitButton isPending={isPending} label="保存" />
</div>

// パターン B: 接続テスト + 保存（クリア → テスト → 保存の順）
<div className="flex flex-wrap items-center justify-end gap-2">
  <Button type="button" variant="destructive" ...>クリア</Button>
  <Button type="button" variant="outline" ...>接続テスト</Button>
  <SubmitButton isPending={isPending} label="保存" />
</div>
```

`useActionState` の `isPending` を `SubmitButton` の `isPending` prop に渡す。`useFormStatus` 経由禁止（→ `frontend/admin-ui-patterns/submit-and-sticky.md`）。

## Switch グループの fieldset パターン

複数の Switch を視覚グループ化する場合は `<fieldset>` + `<legend>` を使用。`<div>` + `<h4>` は禁止（a11y・セマンティクス）:

```tsx
<fieldset className="rounded-lg border p-4 space-y-4">
  <legend className="px-1 text-sm font-medium">送信設定</legend>
  <div className="flex flex-wrap gap-6">
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={fields.optInA.id}>...</Label>
      <Switch
        id={fields.optInA.id}
        checked={optInAControl.value === "on"}
        onCheckedChange={(c) => optInAControl.change(c ? "on" : "")}
      />
      <input
        type="hidden"
        name={fields.optInA.name}
        value={optInAControl.value === "on" ? "on" : ""}
      />
    </div>
    {/* ... */}
  </div>
</fieldset>
```

参照実装: `EmailSection.tsx`（PR #61 で conform 化済の switch group）、`CustomerForm.tsx`（PR #62、連絡可否 Switch 2 件）。

## スキーマ構成（責務分離）

- Server Action 内部スキーマ（`schemas/basic.ts` 等）: `z.string().nullable()` — サーバーバリデーション用
- conform `parseWithZod` 用スキーマ（`schemas/form-schemas-*.ts` + `form-schema-helpers.ts`、barrel は `schemas/index.ts`）: `z.string().max(100)` + 数値は `z.coerce.number()` + boolean は `z.boolean()` ("on"/"" coerce) + datetime-local は `z.string().datetime({ local: true })` — FormData coerce 前提
- `emptyToNull()` で送信時に空文字列 → null 変換（command 層で行う）

## 接続テスト・OAuth ボタンの共存

```tsx
// フォーム送信: useActionState
const [lastResult, action, isPending] = useActionState(
  updateSettings,
  undefined,
);
const [form, fields] = useForm({
  /* ... */
});

// 接続テスト: 別の useTransition（isPending と競合しない）
const [testPending, startTestTransition] = useTransition();
```

## 非適用の例外（form 不要 / 構造が大きく異なる場合）

- **CRUD テーブル** (`CustomApiKeysSection` / `ICalFeedSection` / `SidebarSection` — widget CRUD list) — 1 レコード CRUD ではなく行ごとに dialog 編集、`useFormAction` 不使用パターンのため migration 対象外
- **読み取り専用 UI** (`PermissionsSection`) — form 不要
- **Lexical エディタ** (`RobotsTxtSection`) — エディタ統合特殊
- **複雑なネスト配列** (`BusinessHoursSection` — 曜日 × 時間帯) — Phase 1 Task 8 で conform `form.insert/remove` に migration 予定（参照実装: `DiscountSection` PR #84 で 1 次元 `useFieldArray` → `form.insert/remove` の clean break 移行を確立）
- **スペース作成・編集フォーム** (`SpaceEditForm`) — DnD・メディアピッカー・複数 `useFieldArray` 等のため、現在は RHF + `useActionState` + `FormData` hybrid。Phase 1 Task 8 で conform 完全化予定

## 禁止事項

- **`useFormAction` (RHF) 新規利用禁止** — legacy hook、Task 8 で削除予定。設定セクションで残存している場合は同 commit 内で conform に置換する
- **`useState` + 手動 `onChange` のフォーム管理禁止** — conform `useForm` を使う
- **`useRefreshOnSuccess` フック禁止** — 削除済、conform `useEffect(() => { if (lastResult?.initialValue === null) router.refresh() })` で代替
- **Server Action 内 `parseWithZod` 直接呼び出し禁止** — `executeConformMutation` SSoT helper 経由
- **`@conform-to/zod` ルート import 禁止** — Zod v3 用、Zod 4 と非互換。`@conform-to/zod/v4` から `parseWithZod` を import する
- **`standardSchemaResolver` 使用禁止** — RHF + Standard Schema 用、conform では不要
