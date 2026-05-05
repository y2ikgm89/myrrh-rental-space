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

**禁止**: `[id]/page.tsx` に detail と edit form を同居させる hybrid pattern — 詳細は `[id]/page.tsx`（`AdminDetailLayout` + 編集ボタン → `/edit`）、編集は `[id]/edit/page.tsx`（`AdminDetailLayout backLabel="詳細に戻る"` + Form）に必ず分離。編集成功時のリダイレクトは詳細ページ（`/admin/<resource>/${id}`）。参照実装: customers / coupons

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

### Relation FK address フィールドと supplement フィールドの SSoT 原則

Event の `addressDetail` のように、**relation 経由で取得できる住所**と**supplement 用 free input** を併存させる場合:

- **住所の SSoT は relation の FK 先**（例: `Location.address`）
- **supplement field は補足情報専用**（フロア・入口案内・補足説明など）
- **address を supplement field に自動入力しない** — データ重複・ドリフト・公開ページの二重表示を引き起こす
- 公開側は `formatXxxAddress({ relation, supplement })` ヘルパーで結合

ユーザーへの可視化が必要な場合は **relation の住所を read-only でプレビュー表示**（編集不可）。Eventbrite / Peatix / connpass 全て同パターン。参照実装: `Event.addressDetail` ↔ `Location.address` + `formatEventAddress`。

### Edit + Live Preview 2-column パターン（カード内部）

SEO 設定・OGP・テンプレート編集等のライブプレビューが必要なフォームは、**カード内部**を `lg:grid-cols-2` で「フォーム左 / プレビュー右」に分割し、プレビューに `lg:sticky lg:top-6` を適用する。Sanity Studio / Mailchimp / Stripe Dashboard / Webflow CMS の canonical pattern。

```tsx
<Card>
  <CardHeader>
    <CardTitle>基本SEO設定</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">{/* form fields */}</div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">プレビュー</p>
        <div className="lg:sticky lg:top-6">
          <SerpPreview ... />
        </div>
      </div>
    </div>
  </CardContent>
</Card>
```

- **冗長 thumbnail 禁止** — プレビュー右カラムが画像を表示するため、フォーム側に小型 thumbnail を併置しない（SSoT 違反）
- **「左1枚 + 右複数カード」とは別パターン** — あちらは inter-card layout、こちらは intra-card layout
- 参照実装: `pages/[slug]/_seo/_components/PageSeoForm.tsx`（基本SEO + OGP の 2 カード）

---

## 親子 FK カスケード Select パターン

親 FK を選ぶと子 FK の選択肢が親に属するものだけにフィルタされる UI（Location → Space、Category → SubCategory 等）:

```tsx
const watchedLocationId = useWatch({ control: form.control, name: "locationId" });
const watchedSpaceId = useWatch({ control: form.control, name: "spaceId" });
const spacesInLocation = watchedLocationId
  ? spaces.filter((s) => s.locationId === watchedLocationId)
  : [];

// 親変更: 子が新親に属さなければ clear
const handleLocationChange = (value: string) => {
  const nextLocationId = value === LOCATION_NONE_VALUE ? null : value;
  form.setValue("locationId", nextLocationId, { shouldDirty: true });
  const currentSpaceId = form.getValues("spaceId");
  if (currentSpaceId) {
    const currentSpace = spaces.find((s) => s.id === currentSpaceId);
    if (!currentSpace || currentSpace.locationId !== nextLocationId) {
      form.setValue("spaceId", null, { shouldDirty: true });
    }
  }
};

// 子選択: 親未設定なら子の parent を auto-set
const handleSpaceChange = (value: string) => {
  const nextSpaceId = value === SPACE_NONE_VALUE ? null : value;
  form.setValue("spaceId", nextSpaceId, { shouldDirty: true });
  if (nextSpaceId) {
    const selected = spaces.find((s) => s.id === nextSpaceId);
    if (selected && form.getValues("locationId") !== selected.locationId) {
      form.setValue("locationId", selected.locationId, { shouldDirty: true });
    }
  }
};

// 子 Select は常時表示 + 状態別 disabled が業界標準（下記「子 Select の表示ストラテジ」参照）
<SpaceSelect options={spacesInLocation} disabled={!hasLocationSelected || ...} />
```

**ルール**:

- sentinel 値は親専用・子専用それぞれ定義（`LOCATION_NONE_VALUE = "__none__"` / `SPACE_NONE_VALUE = "__none__"`）、Radix Select の `value=""` 予約回避
- domain query は `getChildOptions` で `parentId: true` を select に含める（フィルタに必要）
- 子 Select のプレースホルダーは親の options に応じて動的（`"この会場に登録スペースがありません"` 等）
- 参照実装: `events/_components/EventForm.tsx`（Location → Space、`handleLocationChange` / `handleSpaceChange`）

### 子 Select の表示ストラテジ（常時表示 + 状態別プレースホルダー推奨）

子 Select を**条件付き表示**（親選択時に出現）にするか**常時表示**（disabled + プレースホルダー切替）にするかの判断:

| パターン                                    | 利点                                     | 欠点                                        |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| 条件付き表示（`{hasParent && <Select />}`） | 不要 UI 非表示で簡潔                     | 機能の発見性が低い、軽微なレイアウトシフト  |
| **常時表示 + disabled**（推奨）             | 機能の存在が一目で分かる、レイアウト安定 | disabled 時のプレースホルダー文言設計が必要 |

**業界標準は常時表示**（Eventbrite / OpenTable / Stripe Tax / connpass 全て同パターン）。disabled 状態のプレースホルダーは 3 段階で制御:

```tsx
<Select disabled={isPending || !hasParent || childOptions.length === 0}>
  <SelectTrigger>
    <SelectValue
      placeholder={
        !hasParent
          ? "先に親を選択してください"
          : childOptions.length === 0
            ? "親に紐づく子がありません"
            : "子を選択"
      }
    />
  </SelectTrigger>
</Select>
```

参照実装: `events/_components/EventForm.tsx`（会場 → スペースカスケード、`grid grid-cols-1 sm:grid-cols-2` で横並び化）

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

## 複合 widget を `<FormControl>` 配下に置くときの aria 注入パターン

shadcn `<FormControl>` は Radix `Slot` で子 1 個に `id` / `aria-describedby` / `aria-invalid` を注入する。**フォーカス可能要素を持たない複合 widget**（MediaPicker / DnD list / カラースウォッチ群 等）を `<FormControl>` 配下に置く場合、これら 3 props を **シグネチャに追加して primary トリガーボタンに forward** すること。root `<div>` に渡されると `<FormMessage>` の error ID と紐づかず、SR にエラーが伝わらない silent a11y bug になる。

```tsx
// NG: aria 注入を捨てる（root <div> に届くだけで primary トリガーに伝わらない）
function MyComplexField({ value, onChange }: Props) {
  return (
    <div>
      <Button onClick={openPicker}>選択</Button>
    </div>
  );
}

// OK: id / aria-describedby / aria-invalid をシグネチャ受領 → primary トリガーに forward
interface MyComplexFieldProps {
  value: string;
  onChange: (v: string) => void;
  // shadcn FormControl が Slot 経由で注入する 3 props
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

function MyComplexField({
  value,
  onChange,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: MyComplexFieldProps) {
  return (
    <div>
      <Button
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onClick={openPicker}
      >
        選択
      </Button>
    </div>
  );
}
```

参照実装: `MediaPickerField`(`@/admin/components/media-picker`)。Radix `Slot` は子 Component の関数 props にもマージするため、root JSX 要素ではなくコンポーネント関数引数で受け取れる。

**caveat（button 系コンポーネントの場合）**: primary トリガーが `<button>` のときは `aria-invalid` を forward しない（`jsx-a11y/role-supports-aria-props` が button role での `aria-invalid` を非対応として警告 + ARIA 1.1 まで `aria-invalid` は input 系限定）。エラーメッセージは `aria-describedby` の FormMessage ID 経由で SR に十分伝わるため、`aria-invalid` 受け取り自体を省略する（`MediaPickerField` がこの方針）。

## Switch / Checkbox の補足説明は `<FormDescription>` 必須

`<p className="text-xs text-muted-foreground">` は `<FormControl>` の `aria-describedby` に紐づかない。`<FormDescription>` は `formDescriptionId` を自動付与してコントロールと接続するため、SR が補足を読み上げる。

```tsx
// NG: <p> は aria-describedby に紐づかない
<FormItem>
  <FormControl><Switch ... /></FormControl>
  <p className="text-xs text-muted-foreground">補足説明</p>
</FormItem>

// OK: FormDescription（id 自動付与 + FormControl の aria-describedby に接続）
<FormItem>
  <FormControl><Switch ... /></FormControl>
  <FormDescription className="text-xs">補足説明</FormDescription>
</FormItem>
```

---

## Destructive アクションの強調レベル基準

業界標準（Material 3 / Apple HIG / GitHub Primer / Bootstrap / WordPress / Stripe / Sanity / Notion / Figma 等横断）:

| 強調レベル                             | variant / className 例                                                            | 採用文脈                                                |
| -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Filled red**（最強調）               | `variant="destructive"`（赤背景白文字）                                           | **確認モーダル / Danger Zone のみ**。インラインでは過剰 |
| **Outline destructive**（中強調）      | `variant="outline" + border-destructive text-destructive hover:bg-destructive/10` | インライン破壊的アクション（変更ボタンと並ぶ削除等）    |
| **Ghost / link destructive**（弱強調） | `variant="ghost"` + `text-destructive` / link スタイル                            | フォーム state の clear 等、実質的に破壊的でない        |

**判断基準**: 操作が DB に即時反映で不可逆 → Filled。フォーム state のみ・保存前 reset で undo 可能 → Outline 以下。

**Outline destructive 推奨実装**（参照: `MediaPickerField`）:

- `border-destructive`（フル不透明度、隣接する `border-input` outline ボタンと濃度を揃える）
- `text-destructive` + `hover:bg-destructive/10`
- `focus-visible:ring-destructive`（base `ring-ring` を上書き、destructive context の keyboard 経路でも伝達）
- `active:bg-destructive/15`（base `active:scale-[0.98]` と組み合わせ押下感）

## 画像 picker UI のアスペクト比別配置パターン

- **大きい画像（cover / logo / OGP / 幅 200px+）**: 画像下にボタン横並び（業界全社標準: WordPress / Stripe / Notion / Webflow / Sanity）
- **小サムネ（avatar 等、幅 ~64px）**: 画像右横にボタン（Slack / Linear avatar 等の限定パターン）
- **hover overlay（画像内重ね）**: タッチデバイスでアクセス不可のため**インライン文脈では避ける**。常時表示の画像下ボタンが業界標準（GitHub README 画像 / Slack プロフィール画像）
- **fieldset で囲む場合の幅制約**: `sm:grid-cols-2` 内で fieldset 内幅 ≈ 288px。wide (240px) / logo (240px) は画像右横に置く余裕なし、square (128px) のみ理論上可能だが 4 つの一貫性が崩れるため画像下に統一

## `<fieldset>` cardinality 1 の許容

HTML5 仕様 "a set of form controls" は cardinality 1 でも違反ではない（MDN の "single field では通常不要" は推奨であって禁止ではない）。**視覚対称化のために単一 form control を `<fieldset>` で囲んでよい**。fieldset 内で `FormLabel` が legend と冗長になる場合は `sr-only` で残す（`htmlFor` 接続維持のため省略は禁止）。

参照実装: `BasicInfoSection.tsx` のファビコン / OGP fieldset（cardinality 1）と ヘッダー / フッターロゴ fieldset（cardinality 2: 画像 + Switch）

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
