# Spec: Space.facilities を構造化アイコン付きに変更

> **Snapshot: 2026-05-08** — 設計案、実装は別セッション

## 背景

`Space.facilities` は現在 `Json @default("[]")` の `string[]`（例: `["Wi-Fi", "駐車場", "エアコン"]`）として保存されている。公開ページ `/spaces/[slug]` で**テキストのみのリスト表示**となっており、業界標準の Airbnb / Booking.com / Expedia などの listing 詳細ページが**設備リストに必ず icon 付き**である UX に劣後している。

WCAG 1.4.1 / NN/g icon ガイドラインに沿って、icon は補助役として text と併記する形で実装する。

## 業界 reference

- Airbnb listing detail（"What this place offers" セクション）— 各設備に icon + label
- Booking.com property detail（"Most popular facilities" セクション）— 同上
- Eventbrite venue page — 同上
- NN/g Menu Design Checklist Guideline 10「icon は supplementary signals only、text label が primary」

## 設計

### Schema 変更

**前**:

```prisma
model Space {
  facilities Json @default("[]")  // string[] (例: ["Wi-Fi", "駐車場"])
}
```

**後**:

```prisma
model Space {
  /// 構造化された設備リスト。Airbnb / Booking.com 標準パターン。
  /// JSON 配列 `{ name: string; iconName: string }[]`。
  /// `iconName` は `@/shared/lib/icon-curation` の curation 識別子（空文字 = icon なし許容、UI で選択推奨）。
  facilities Json @default("[]")
}
```

スキーマ自体は `Json` のまま。中身の object 構造に migrate。

### Migration（data-preserving）

非対話環境で実行する手書き migration:

```sql
-- prisma/migrations/<timestamp>_space_facilities_to_object_array/migration.sql
-- 既存 string[] を { name: string; iconName: "" }[] に変換（icon 未指定でスタート）
UPDATE spaces
SET facilities = COALESCE(
  (
    SELECT jsonb_agg(jsonb_build_object('name', value, 'iconName', ''))
    FROM jsonb_array_elements_text(facilities)
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof(facilities) = 'array'
  AND (
    -- 空配列や既に object 化されているレコードは無視
    jsonb_array_length(facilities) > 0
    AND jsonb_typeof(facilities -> 0) = 'string'
  );
```

実行手順（CLAUDE.md `git-migration.md` §Prisma 7.8 CLI 手順）:

1. `python3 -c "import os; os.makedirs('prisma/migrations/<ts>_space_facilities_to_object_array', exist_ok=True)"`
2. `python3 -c "open(...).write(sql)"` で SQL 書き出し（PreToolUse 保護回避）
3. `bunx --bun prisma db execute --file <path>`
4. `bunx --bun prisma migrate resolve --applied <name>`
5. `bun run db:generate`

### json-validators の SSoT 拡張

`src/shared/lib/json-validators.ts` に `parseFacilities` を追加:

```typescript
const facilityItemSchema = z.object({
  name: z.string().min(1).max(50),
  iconName: z.string().max(64), // 空文字許容（icon 未指定）
});

export const facilitiesSchema = z
  .array(facilityItemSchema)
  .refine((arr) => new Set(arr.map((f) => f.name)).size === arr.length, {
    error: "同じ名前の設備を複数登録することはできません",
  });

export type FacilityItem = z.infer<typeof facilityItemSchema>;

export function parseFacilities(value: unknown): FacilityItem[] {
  const result = facilitiesSchema.safeParse(value);
  return result.success ? result.data : [];
}
```

`parseStringArray(space.facilities)` の使用箇所を `parseFacilities(space.facilities)` に置換。

### Admin UI 変更

#### 1. Schema (`@/admin/lib/validations/space.ts`)

`facilitiesSchema` を `useFieldArray` 互換の object 配列に拡張:

```typescript
const facilitiesSchema = z
  .array(
    z.object({
      name: z.string().min(1, { error: "設備名は必須" }).max(50),
      iconName: z.string().max(64),
    }),
  )
  .refine((arr) => new Set(arr.map((f) => f.name)).size === arr.length, {
    error: "同じ名前の設備を複数登録することはできません",
  });
```

#### 2. SpaceEditForm

`useFieldArray` の name path を `facilities` のまま、各 field を object 化:

```typescript
const { fields, append, remove, move } = useFieldArray({
  control,
  name: "facilities", // 型: { name: string; iconName: string }[]
});

// 編集時の初期値: DB の object[] をそのまま渡す
facilities: space.facilities.map((f) => ({ name: f.name, iconName: f.iconName })),

// 新規時のデフォルト: []
facilities: [],
```

#### 3. details-tab-panel.tsx

設備配列の各行に `<Input>` (name) + `<IconPickerField>` (iconName) を配置:

```tsx
{
  facilityFields.map((field, index) => (
    <div key={field.id} className="flex items-start gap-2">
      <Input
        placeholder="設備名（例: Wi-Fi）"
        {...register(`facilities.${index}.name`)}
      />
      <Controller
        control={control}
        name={`facilities.${index}.iconName`}
        render={({ field: f }) => (
          <IconPickerField
            value={f.value ?? ""}
            onChange={(name) => f.onChange(name)}
          />
        )}
      />
      <Button onClick={() => removeFacility(index)}>削除</Button>
    </div>
  ));
}
```

#### 4. space-form-data-codec.ts

FormData encoding/decoding を object 化:

```typescript
// encode: object[] → FormData
for (const facility of payload.facilities) {
  fd.append("facilities[]", JSON.stringify(facility));
}

// decode: FormData → object[]
const facilities = formData
  .getAll("facilities[]")
  .map((value) => JSON.parse(String(value)) as FacilityItem);
```

または各 facility を `name` / `iconName` を別々に append/getAll する pattern も可。

#### 5. SpaceDetail.tsx

詳細画面の表示で `<CuratedIcon>` 描画:

```tsx
{
  facilities.length > 0 && (
    <ul className="flex flex-wrap gap-2">
      {facilities.map((facility) => (
        <li key={facility.name} className="flex items-center gap-1.5">
          {facility.iconName ? (
            <CuratedIcon name={facility.iconName} className="h-4 w-4" />
          ) : null}
          <span>{facility.name}</span>
        </li>
      ))}
    </ul>
  );
}
```

### Public 描画変更

#### 1. space-info.tsx

公開スペース詳細で grid layout に変更:

```tsx
const facilities: readonly FacilityItem[] = parseFacilities(space.facilities);

{
  facilities.length > 0 ? (
    <div>
      <Heading level={3}>設備</Heading>
      <ul className="@container mt-4">
        <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @3xl:grid-cols-3">
          {facilities.map((f) => (
            <li
              key={f.name}
              className="flex items-center gap-3 border border-border p-4"
            >
              {f.iconName ? (
                <CuratedIcon
                  name={f.iconName}
                  className="h-5 w-5 shrink-0 text-accent"
                />
              ) : (
                <span className="h-5 w-5 shrink-0" /> // spacer for alignment
              )}
              <span className="text-sm">{f.name}</span>
            </li>
          ))}
        </div>
      </ul>
    </div>
  ) : null;
}
```

`@container` + `@md:grid-cols-2 @3xl:grid-cols-3` で Container Queries 採用（CLAUDE.md `tailwind-patterns/container-queries.md` 準拠）。

#### 2. space-detail-dialog.tsx (`reservation/`)

予約フローのスペース詳細 Dialog でも同 pattern。

### Seed 更新

`prisma/seed.ts` の sample facilities を object 配列に:

```typescript
facilities: [
  { name: "Wi-Fi", iconName: "IconWifi" },
  { name: "駐車場", iconName: "IconParking" },
  { name: "エアコン", iconName: "IconAirConditioning" },
  { name: "コーヒー", iconName: "IconCoffee" },
];
```

### テスト fixture 更新

- `__tests__/integration/actions/admin/space.test.ts`
- `__tests__/unit/lib/json-validators.test.ts`（新 schema の正常系/異常系）
- E2E `e2e/admin/space-edit.spec.ts`

## 影響範囲（14 ファイル）

| #   | ファイル                                                                                          | 変更内容                                                               |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | `prisma/schema.prisma`                                                                            | facilities 型コメント更新                                              |
| 2   | `prisma/migrations/<ts>_space_facilities_to_object_array/migration.sql`                           | 新規作成                                                               |
| 3   | `src/shared/lib/json-validators.ts`                                                               | `parseFacilities` 追加、`parseStringArray` の facilities 利用箇所 grep |
| 4   | `src/shared/domain/spaces/queries.ts`                                                             | facilities mapping を `parseFacilities` に変更                         |
| 5   | `src/shared/domain/spaces/public-queries.ts`                                                      | 同上                                                                   |
| 6   | `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts`                              | `facilitiesSchema` を object 配列に拡張                                |
| 7   | `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/schema.ts`                  | `useFieldArray` 互換の object 化                                       |
| 8   | `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/SpaceEditForm.tsx`          | facilities 初期値と useFieldArray 配線                                 |
| 9   | `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/tabs/details-tab-panel.tsx` | name + IconPickerField の 2-field 行 UI                                |
| 10  | `src/app/(admin)/admin/(dashboard)/_shared/lib/space-form-data-codec.ts`                          | encode/decode を object 化                                             |
| 11  | `src/app/(admin)/admin/(dashboard)/spaces/[id]/_components/SpaceDetail.tsx`                       | `<CuratedIcon>` 表示                                                   |
| 12  | `src/app/(public)/spaces/[slug]/_components/space-info.tsx`                                       | grid layout + `<CuratedIcon>` 描画                                     |
| 13  | `src/app/(public)/reservation/_components/space-detail-dialog.tsx`                                | 同上                                                                   |
| 14  | `prisma/seed.ts`                                                                                  | sample facilities を object 配列に                                     |
| 15  | `__tests__/**/space*.test.ts`                                                                     | テスト fixture 更新                                                    |

## Risk

- **Migration 失敗**: 既存データの mapping が壊れた場合、本番表示が空になる可能性。事前に staging で migration を実行して検証必須
- **Prisma JSON 型の Array.isArray 判定**: 既に object 化されたレコードを再度 string → object 変換しないようガード（migration の `WHERE` 句で対応済み）
- **互換性**: 既存の `parseStringArray` を使う他モデル（`Post.tags` 等）は影響なし、facilities のみ置換

## Rollback 戦略

- migration は `iconName: ""` で空 icon を入れるだけなので、`facilities` は object 化されているが render に影響しない（公開側で icon 不在は spacer で対応）
- 万一全面 rollback が必要なら、逆方向 SQL で object → string への戻し migration 可能

## 完了基準

- [ ] DB migration 適用済み
- [ ] `parseFacilities` SSoT 確立
- [ ] admin SpaceEditForm で `useFieldArray` + IconPickerField 動作
- [ ] 管理画面詳細ページで `<CuratedIcon>` 表示
- [ ] 公開 `/spaces/[slug]` で grid + icon 描画
- [ ] 公開 `/reservation` の Dialog でも同等表示
- [ ] seed.ts 更新済み、`bun prisma/seed.ts` 2 連続実行で idempotency
- [ ] E2E + integration test 全 pass
- [ ] `bun run validate && bun run build` EXIT=0

## 業界調査の参考リンク

- Airbnb listing detail "What this place offers"（2026-05-08 時点で bot ブロック、UI スクリーンショット参考）
- Booking.com property detail "Facilities of property"
- NN/g Menu Design Checklist Guideline 10
- WCAG 2.2 SC 1.4.1 Use of Color

## 別セッションで実装する理由

- 14 ファイル変更 + migration の影響範囲広大
- 既存データの安全な mapping に staging 検証が必要
- 公開描画の grid layout レイアウト判断に UX レビュー余地あり
- subagent-driven-development または executing-plans skill 経由で chunk 化推奨

## 次セッション起動コマンド

```
docs/superpowers/specs/2026-05-08-space-facilities-structured.md を読み、
writing-plans skill で実装 plan を作成、
subagent-driven-development で実行
```
