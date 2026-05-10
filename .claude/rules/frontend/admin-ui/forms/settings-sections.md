---
description: 設定ページの Section パターン（useFormAction / Card 統一 / Switch fieldset / SubmitButton 配置 / Accordion ヒント / スキーマ責務分離）
paths:
  - src/app/(admin)/**/settings/**/*.tsx
  - src/app/(admin)/**/settings/**/sections/**
  - src/app/(admin)/**/_shared/components/SettingsLayout.tsx
---

# 設定セクション フォームパターン

> `useFormAction` + `Form` + Card による設定セクション統一パターン + Accordion ヒント + スキーマ責務分離 + 接続テスト共存。

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

## useFormAction 統一パターン

設定セクション（`settings/_components/sections/`）は `useFormAction` + `Form` コンポーネント群で統一:

```tsx
// 標準パターン（BasicInfoSection.tsx が実装例）
const { form, isPending, onSubmit } = useFormAction(
  basicInfoFormSchema,           // schemas/form-schemas-*.ts のフォーム用スキーマ
  (data) => updateBasicInfo({    // emptyToNull で空文字→null 変換
    siteName: emptyToNull(data.siteName),
  }),
  { defaultValues: {...}, refresh: true, successMessage: "保存しました" }
);

<Form {...form}>
  <form onSubmit={onSubmit}>
    <Card>
      <CardContent>
        <FormField control={form.control} name="siteName" render={({ field }) => (
          <FormItem>
            <FormLabel>サイト名</FormLabel>
            <FormControl><Input {...field} disabled={isPending} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex justify-end pt-2">
          <SubmitButton isPending={isPending} label="保存" disabled={!form.formState.isDirty} />
        </div>
      </CardContent>
    </Card>
  </form>
</Form>
```

## SubmitButton 配置（右寄せ統一）

```tsx
// パターン A: 保存ボタンのみ
<div className="flex justify-end pt-2">
  <SubmitButton isPending={isPending} label="保存" disabled={!form.formState.isDirty} />
</div>

// パターン B: 接続テスト + 保存（クリア → テスト → 保存の順）
<div className="flex flex-wrap items-center justify-end gap-2">
  <Button type="button" variant="destructive" ...>クリア</Button>
  <Button type="button" variant="outline" ...>接続テスト</Button>
  <SubmitButton isPending={isPending} label="保存" disabled={!form.formState.isDirty} />
</div>
```

## Switch グループの fieldset パターン

複数の Switch を視覚グループ化する場合は `<fieldset>` + `<legend>` を使用。`<div>` + `<h4>` は禁止（a11y・セマンティクス）:

```tsx
<fieldset className="rounded-lg border p-4 space-y-4">
  <legend className="px-1 text-sm font-medium">送信設定</legend>
  <div className="flex flex-wrap gap-6">
    <FormField .../> {/* Switch */}
    <FormField .../> {/* Switch */}
  </div>
</fieldset>
```

参照実装: `EmailSection.tsx`（設定 switch グループ）、`DesignFields.tsx`（ToggleGroup fieldset）

## スキーマ構成（責務分離）

- Server Action スキーマ（`schemas/basic.ts`）: `z.string().nullable()` — サーバーバリデーション用
- フォーム用スキーマ（`schemas/form-schemas-*.ts` + `form-schema-helpers.ts`、barrel は `schemas/index.ts`）: `z.string().max(100)` — クライアントバリデーション用
- `emptyToNull()` で送信時に空文字列 → null 変換

## 接続テスト・OAuth ボタンの共存

```tsx
// フォーム送信: useFormAction
const { form, isPending, onSubmit } = useFormAction(schema, action, options);
// 接続テスト: 別の useTransition（isPending と競合しない）
const [testPending, startTestTransition] = useTransition();
```

## useFormAction 非適用の例外

- CRUD テーブル（CustomApiKeysSection, ICalFeedSection）
- 読み取り専用 UI（PermissionsSection）
- Lexical エディタ（RobotsTxtSection）
- 複雑なネスト配列（BusinessHoursSection — 曜日 × 時間帯）
- **スペース作成・編集フォーム**（`SpaceEditForm`）— DnD・メディアピッカー・`useFieldArray` 等のため RHF は維持し、送信のみ React 19 **`useActionState` + `FormData` + Server Action**（`submitSpaceFormAction`）へ統一。ペイロード変換は `spaceEditFormDataToSpaceFormPayload`、シリアライズは `@/admin/lib/space-form-data-codec`（`spaceFormSchema` でサーバー再検証）

## 禁止事項

- 設定セクションで `useState` + 手動 `onChange` のフォーム管理（`useFormAction` を使用）
- `useRefreshOnSuccess` フック（削除済み、`useFormAction` の `refresh: true` で代替）
