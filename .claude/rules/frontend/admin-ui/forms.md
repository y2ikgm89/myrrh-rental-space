---
paths:
  - src/app/(admin)/**/*Form.tsx
  - src/app/(admin)/**/*Fields.tsx
  - src/app/(admin)/**/new/page.tsx
  - src/app/(admin)/**/edit/page.tsx
  - src/app/(admin)/**/[id]/page.tsx
  - src/app/(admin)/**/settings/**/*.tsx
  - src/app/(admin)/**/_shared/actions/**
---

# 管理画面フォーム・ページ構造パターン

Server Action 認証・2 カラムフォーム・詳細/編集/新規作成ページ・ToggleGroup・設定セクション。

## Server Actions の認証パターン

管理画面の書き込み系 Server Actions は `executeAdminMutationResult` を使用（認証・権限チェック・監査ログ・DomainError ハンドリングを一括処理）:

```typescript
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";

// OK: executeAdminMutationResult パターン
export async function createItem(
  input: ItemInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "item",
    action: "create",
    execute: async () => createItemCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.ITEMS);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

// NG: 直接 checkPermission（executeAdminMutationResult を使う）
export async function createItem(
  input: ItemInput,
): Promise<MutationResult<{ id: string }>> {
  const auth = await checkPermission("item", "create");
  if (!auth.success) return auth.error;
  // ...
}
```

詳細は `auth-patterns.md` を参照。

---

## AdminDetailLayout vs InlineEditorShell の使い分け

| パターン                             | 適用場面                                         | ページ例                                                    |
| ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| `AdminDetailLayout`                  | 標準の詳細・編集・新規作成ページ                 | customers/[id], spaces/[id]/edit, staff/new                 |
| `InlineEditorShell` + `EditorHeader` | フルスクリーンエディタ（Lexical/コンテンツ編集） | posts/[id], news/[id], terms/[id]/edit, faq/items/[id]/edit |

**禁止**: InlineEditorShell を使うページに AdminDetailLayout をラップすること（二重ヘッダーになる）

---

## 詳細・編集・新規作成ページ標準構造

### 詳細ページ（Server Component + AdminDetailLayout）

詳細ページは `AdminDetailLayout` を使ってヘッダーを統一する:

```tsx
// reservations/[id]/page.tsx (Server Component)
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";

export default async function ReservationDetailPage({ params }) {
  const { id } = await params;
  const reservation = await getReservationById(id);
  if (!reservation) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title={`予約 #${reservation.id.slice(0, 8)}`}
      subtitle={`${reservation.space.name} — ${reservation.customer.name}`}
      actions={
        <>
          <DetailDeleteButton
            itemName={`予約 #${reservation.id.slice(0, 8)}`}
            onDelete={deleteReservation.bind(null, id)}
            redirectTo="/admin/reservations"
            successMessage="予約を削除しました"
          />
          <Button asChild size="sm">
            <Link href={`/admin/reservations/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <DetailSection title="予約情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="スペース" value={reservation.space.name} />
        </div>
      </DetailSection>
    </AdminDetailLayout>
  );
}
```

**`DetailDeleteButton` の `onDelete` は `.bind(null, id)` で渡す**:

Server Component から `'use client'` の `DetailDeleteButton` へ `onDelete` を渡す際、
通常のアロー関数クロージャ `() => deleteAction(id)` は RSC 境界を越えられない（シリアライズ不可）。
Server Action を `.bind()` することで RSC 境界を越えられるバインド済み Server Action を生成する:

```tsx
// NG: 通常クロージャは RSC 境界を越えられない
onDelete={() => deleteReservation(id)}

// OK: .bind(null, id) でバインド済み Server Action を生成
onDelete={deleteReservation.bind(null, id)}
```

**配置ルール**:

| 要素         | 配置場所                                            | 禁止場所              |
| ------------ | --------------------------------------------------- | --------------------- |
| バックボタン | `AdminDetailLayout backHref` — 左上                 | 詳細コンポーネント内  |
| 削除ボタン   | `AdminDetailLayout actions` — 編集ボタンの**左**    | ページ最下部カード    |
| 編集ボタン   | `AdminDetailLayout actions` — 最右                  | 詳細コンポーネント内  |
| タイトル CSS | `text-2xl font-bold tracking-tight text-foreground` | `tracking-tight` 省略 |

### 新規作成ページ（Server Component + AdminDetailLayout）

新規作成ページも `AdminDetailLayout` でヘッダーを統一する（`locations/new` がテンプレート）:

```tsx
// locations/new/page.tsx (Server Component)
export default async function NewLocationPage() {
  return (
    <AdminDetailLayout
      backHref="/admin/locations"
      title="新規ロケーション作成"
      subtitle="新しいロケーションを登録します"
    >
      <LocationForm />
    </AdminDetailLayout>
  );
}
```

**`backLabel` ルール**（ページ種別ごとに固定）:

| ページ種別     | `backHref`             | `backLabel`（省略可否） | 表示テキスト   |
| -------------- | ---------------------- | ----------------------- | -------------- |
| 詳細・新規作成 | `/admin/<resource>`    | 省略可（デフォルト）    | 「一覧に戻る」 |
| 編集           | `/admin/<resource>/id` | `"詳細に戻る"` 必須     | 「詳細に戻る」 |

### 編集ページ（Server Component + AdminDetailLayout）

編集ページも `AdminDetailLayout` でヘッダーを統一する:

```tsx
// customers/[id]/edit/page.tsx (Server Component)
export default async function CustomerEditPage({ params }) {
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/customers/${id}`}
      backLabel="詳細に戻る"
      title="顧客情報を編集"
      subtitle={`${customer.lastName} ${customer.firstName}`}
    >
      <CustomerEditForm customer={customer} />
    </AdminDetailLayout>
  );
}
```

**管理画面 Suspense 内の async Server Component には `connection()` を配置**:

PPR 環境では Suspense 境界ごとに動的判定される。layout の `headers()` 呼び出しは子の Suspense 境界に伝播しない。`new Date()` や uncached データを使う async Server Component には `await connection()` を先頭に配置する（[公式推奨](https://nextjs.org/docs/app/api-reference/functions/connection)）。

```tsx
// OK: Suspense 内の async Server Component に connection()
import { connection } from "next/server";

export async function DashboardStatsSection() {
  await connection();
  const stats = await getDashboardStats(); // 内部で new Date() を使用
  return <StatsCards stats={stats} />;
}

// OK: UI のみの new Date() は Client Component にする
"use client";
export function DashboardHeader() {
  const today = new Date();
  ...
}

// 不要: page.tsx 本体（Suspense の外）には connection() 不要
export default async function AdminPage() {
  const { id } = await params;
  ...
}
```

### 共有コンポーネント一覧

| コンポーネント       | パス                                    | 用途                                |
| -------------------- | --------------------------------------- | ----------------------------------- |
| `AdminDetailLayout`  | `@/admin/components/AdminDetailLayout`  | 詳細・編集ページ統一ヘッダー        |
| `DetailSection`      | `@/admin/components/DetailSection`      | Card ラッパー（セクション区切り）   |
| `DetailField`        | `@/admin/components/DetailField`        | ラベル + 値の行（dt/dd）            |
| `DetailDeleteButton` | `@/admin/components/DetailDeleteButton` | ヘッダー削除ボタン + ダイアログ確認 |

---

## フォームページ（新規作成・編集） 2カラムレイアウト

管理画面フォームは **左1枚（主要情報まとめ）+ 右複数カード** の2カラム構成に統一する:

```tsx
<form className="space-y-6">
  <div className="grid gap-6 lg:grid-cols-2">
    {/* 左: スペース・日時・料金等を1枚のカードにまとめる */}
    <Card>
      <CardHeader>
        <CardTitle>予約情報</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{/* ... */}</CardContent>
    </Card>
    {/* 右: 複数カードに分割してよい */}
    <div className="space-y-6">
      <Card>{/* 顧客情報 */}</Card>
      <Card>{/* 追加設定 */}</Card>
    </div>
  </div>
  <div className="flex justify-end gap-4">{/* キャンセル・送信ボタン */}</div>
</form>
```

**禁止**: 左カラムに小さなカードを複数並べること（「スペース選択」「日時選択」「料金」に分割等）→ 余白が目立ちUX低下

### 編集フォームでの参照エンティティ表示（読み取り専用）

変更不可な外部エンティティ（例: 予約の顧客）は `CustomerSelector` 等のインタラクティブUIではなく、hidden input + アイコン表示を使う:

```tsx
{/* RHF の値を保持しつつ表示は読み取り専用 */}
<input type="hidden" {...register("customerId")} />
<div className="space-y-3">
  <div className="flex items-center gap-2">
    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
    <Link href={`/admin/customers/${entity.id}`} className="font-medium hover:underline">
      {entity.lastName} {entity.firstName}
    </Link>
  </div>
  <div className="flex items-center gap-2">
    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
    <span className="text-sm text-muted-foreground">{entity.email}</span>
  </div>
  {entity.phoneNumber && (
    <div className="flex items-center gap-2">
      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{entity.phoneNumber}</span>
    </div>
  )}
</div>
```

---

## ToggleGroup パターン（セグメント選択）

少数の排他選択肢は `ToggleGroup`（Radix）を使用。生 `<input type="radio">` は禁止。

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/admin/components/ui";

<ToggleGroup
  type="single"
  value={currentValue}
  onValueChange={(v) => {
    if (v) setValue("fieldName", v, { shouldDirty: true });
  }}
>
  <ToggleGroupItem value="sm">小</ToggleGroupItem>
  <ToggleGroupItem value="md">中</ToggleGroupItem>
  <ToggleGroupItem value="lg">大</ToggleGroupItem>
</ToggleGroup>;
```

**`onValueChange` の `if (v)` ガード必須** — Radix ToggleGroup は同じ値を再クリックすると `""` を返す（deselect）。`if (v)` で空文字列を無視する。

**参照実装**: `pages/[slug]/edit/_components/DesignFields.tsx`（ToggleGroup + フラット fieldset + カラーピッカー）

**使い分け:**

| 選択肢数                 | コンポーネント | 例                                      |
| ------------------------ | -------------- | --------------------------------------- |
| 2-6（テキスト/アイコン） | `ToggleGroup`  | 余白サイズ、テキスト配置、コンテナ幅    |
| 2-6（説明付きカード）    | `SelectionBox` | 決済方法、プラン選択                    |
| 7+                       | `Select`       | タイトルサイズ（6段階）、アニメーション |

---

## 設定セクション フォームパターン

**設定ページ間の導線（`SettingsLayout` / `CardDescription`）:**

関連する設定ページへのリンクは `CardDescription` 内または `SettingsLayout description` に `<Link>` で埋め込む。
`SettingsLayout` の `description` は `ReactNode` を受け付ける（例: ナビゲーション管理 ↔ サイト設定レイアウトタブ間の相互リンク）。

**設定セクションのヒント折りたたみ（Accordion）:**

3行以上のヒント・補足リストは Accordion で折りたたむ（デフォルト閉じ）。
1-2行の短いヒントはインライン表示のまま。PermissionsSection / SidebarSection / RobotsTxtSection が実装例。

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

**SubmitButton 配置（右寄せ統一）:**

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

**Switch グループの fieldset パターン:**

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

**スキーマ構成（責務分離）:**

- Server Action スキーマ（`schemas/basic.ts`）: `z.string().nullable()` — サーバーバリデーション用
- フォーム用スキーマ（`schemas/form-schemas-*.ts` + `form-schema-helpers.ts`、barrel は `schemas/index.ts`）: `z.string().max(100)` — クライアントバリデーション用
- `emptyToNull()` で送信時に空文字列 → null 変換

**接続テスト・OAuth ボタンの共存:**

```tsx
// フォーム送信: useFormAction
const { form, isPending, onSubmit } = useFormAction(schema, action, options);
// 接続テスト: 別の useTransition（isPending と競合しない）
const [testPending, startTestTransition] = useTransition();
```

**useFormAction 非適用の例外:**

- CRUD テーブル（CustomApiKeysSection, ICalFeedSection）
- 読み取り専用 UI（PermissionsSection）
- Lexical エディタ（RobotsTxtSection）
- 複雑なネスト配列（BusinessHoursSection — 曜日×時間帯）
- **スペース作成・編集フォーム**（`SpaceEditForm`）— DnD・メディアピッカー・`useFieldArray` 等のため RHF は維持し、送信のみ React 19 **`useActionState` + `FormData` + Server Action**（`submitSpaceFormAction`）へ統一。ペイロード変換は `spaceEditFormDataToSpaceFormPayload`、シリアライズは `@/admin/lib/space-form-data-codec`（`spaceFormSchema` でサーバー再検証）

**禁止:**

- 設定セクションで `useState` + 手動 `onChange` のフォーム管理（`useFormAction` を使用）
- `useRefreshOnSuccess` フック（削除済み、`useFormAction` の `refresh: true` で代替）
