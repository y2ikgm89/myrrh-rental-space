---
description: 管理フォームの 2 カラムレイアウト + 参照エンティティ表示 + Relation FK + 親子 FK カスケード Select
paths:
  - src/app/(admin)/**/*Form.tsx
  - src/app/(admin)/**/*Fields.tsx
  - src/app/(admin)/**/_seo/**
---

# 2 カラムフォーム + Relation 表示 + 親子 FK カスケード

> 「左 1 枚 + 右複数カード」レイアウト + 編集フォームでの参照表示 + Relation FK 原則 + Edit Live Preview + 親子 FK カスケード Select。

## フォームページ 2 カラムレイアウト

管理画面フォームは **左 1 枚（主要情報まとめ）+ 右複数カード** の 2 カラム構成に統一する:

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

**禁止**: 左カラムに小さなカードを複数並べること（「スペース選択」「日時選択」「料金」に分割等）→ 余白が目立ち UX 低下

## 編集フォームでの参照エンティティ表示（読み取り専用）

変更不可な外部エンティティ（例: 予約の顧客）は `CustomerSelector` 等のインタラクティブ UI ではなく、hidden input + アイコン表示を使う:

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

## Relation FK address フィールドと supplement フィールドの SSoT 原則

Event の `addressDetail` のように、**relation 経由で取得できる住所**と**supplement 用 free input** を併存させる場合:

- **住所の SSoT は relation の FK 先**（例: `Location.address`）
- **supplement field は補足情報専用**（フロア・入口案内・補足説明など）
- **address を supplement field に自動入力しない** — データ重複・ドリフト・公開ページの二重表示を引き起こす
- 公開側は `formatXxxAddress({ relation, supplement })` ヘルパーで結合

ユーザーへの可視化が必要な場合は **relation の住所を read-only でプレビュー表示**（編集不可）。Eventbrite / Peatix / connpass 全て同パターン。参照実装: `Event.addressDetail` ↔ `Location.address` + `formatEventAddress`。

## Edit + Live Preview 2-column パターン（カード内部）

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
- **「左 1 枚 + 右複数カード」とは別パターン** — あちらは inter-card layout、こちらは intra-card layout
- 参照実装: `pages/[slug]/_seo/_components/PageSeoForm.tsx`（基本 SEO + OGP の 2 カード）

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

// 子 Select は常時表示 + 状態別 disabled が業界標準
<SpaceSelect options={spacesInLocation} disabled={!hasLocationSelected || ...} />
```

**ルール**:

- sentinel 値は親専用・子専用それぞれ定義（`LOCATION_NONE_VALUE = "__none__"` / `SPACE_NONE_VALUE = "__none__"`）、Radix Select の `value=""` 予約回避
- domain query は `getChildOptions` で `parentId: true` を select に含める（フィルタに必要）
- 子 Select のプレースホルダーは親の options に応じて動的（`"この会場に登録スペースがありません"` 等）
- 参照実装: `events/_components/EventForm.tsx`（Location → Space、`handleLocationChange` / `handleSpaceChange`）

## 子 Select の表示ストラテジ（常時表示 + 状態別プレースホルダー推奨）

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
