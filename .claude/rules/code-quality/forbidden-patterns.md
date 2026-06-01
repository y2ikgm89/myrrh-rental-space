---
description: コード品質 — 禁止事項 (形骸化実装 / 過剰抽象 / 後方互換ハック / デッドコード / ドメインコマンド共通ロジック helper / SSoT 違反 sign)
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# Code Quality 禁止事項

> 形骸化実装 / 過剰抽象化 / 後方互換ハック / デッドコード / 共通ロジック helper / SSoT 違反 sign（Dead column / 改行 split / Twin queries drift）。

## 禁止事項

### 1. 形骸化実装禁止

```typescript
// NG: 空の関数
async function syncCalendar() {
  // TODO: implement
}

// NG: エラー握りつぶし
try {
  await save(data);
} catch {
  /* ignore */
}

// NG: 常に成功を返す
export async function deleteItem(id: string) {
  return { success: true }; // 実際の削除処理がない
}

// OK: executeAdminMutationResult パターンで完全な実装
export async function deleteItem(id: string) {
  return executeAdminMutationResult({
    resource: "item",
    action: "delete",
    resourceId: id,
    execute: async () => {
      const item = await prisma.item.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!item) throw new DomainError("アイテムが見つかりません", "NOT_FOUND");

      await prisma.item.delete({ where: { id } });
      return { id };
    },
    afterSuccess: () => updateTag(CACHE_TAGS.ITEMS),
  });
}
```

### 2. 過剰な抽象化禁止

```typescript
// NG: 1回しか使わないユーティリティ
function formatSingleDate(date: Date): string {
  return date.toLocaleDateString("ja-JP");
}

// NG: 将来の拡張のための過剰設計
// 理由: 使われないインターフェースはメンテナンスコストだけが増大する
interface PluginSystem {
  register(plugin: Plugin): void;
  unregister(name: string): void;
  // ... 使われないインターフェース
}

// OK: 必要最小限。同じパターンが3箇所以上で出現してから抽象化を検討
const formatted = date.toLocaleDateString("ja-JP");
```

### 3. 後方互換ハック禁止

```typescript
// NG: 未使用変数のリネーム
const _oldFunction = () => {}; // 削除すべき

// NG: 削除コメント
// removed: export function legacyHelper() { ... }

// NG: 不要な re-export
export type { OldType as NewType }; // 型エイリアスは不要（prisma-patterns.md 参照）

// OK: 不要なコードは完全削除。参照元も更新
// 削除前: export function legacyHelper() { ... }
// 削除後: ファイルを削除し、参照元で直接実装を使用
```

### 4. デッドコード禁止

```typescript
// NG: 到達不能コード
function getValue(type: 'a' | 'b') {
  if (type === 'a') return 1
  if (type === 'b') return 2
  return 0  // 到達不能

// NG: 使われないインポート
import { unused } from '@/shared/lib/utils'

// OK: 使われないコードは削除
function getValue(type: 'a' | 'b') {
  if (type === 'a') return 1
  return 2  // type === 'b' のみ残り得る
}
```

### 5. ドメインコマンドの共通ロジックはヘルパー関数に抽出

重複チェック・顧客統計更新・ペイロード構築など、複数コマンドで共有するロジックはヘルパー関数に抽出する:

```typescript
// NG: 同じ統計更新ロジックが create/update/cancel に散在
await tx.customer.update({
  where: { id: customerId },
  data: {
    totalReservations: { increment: 1 },
    lastReservationAt: new Date(),
  },
});

// OK: ヘルパー関数に抽出
await updateCustomerStats(tx, customerId, "increment");
```

### 6. SSoT 違反 sign（コードスメル検出）

以下の sign は構造的問題の表れ。新規コードに持ち込まない / 検出時はリファクタを優先する:

#### Dead column sign

- **検出**: フォームヒントに「上記の項目から自動生成されません」「手動で入力してください」
- **構造**: 構造化フィールド（`postalCode` + `prefecture` + `city` 等）が既にあるのに display 用カラム（`Settings.address` 等）を並走
- **対処**: 構造化フィールドから派生関数（`formatXxxAddress(entity)`）に一本化し、display 用カラムを destructive migration で削除
- **業界標準**: Stripe / Shopify / Google Address Validation API
- **実例**: `Settings.address` 削除（migration `20260501033054_drop_settings_address`）

#### 改行 split sign

- **検出**: 公開側で `value.split("\n")` / `\r\n+` 等の改行 split 配列展開している `String? @db.Text` カラム
- **構造**: 入力が `Textarea`（改行区切り plain text）/ 公開描画が配列の semantic gap
- **対処**: データ層を `Json @default("[]")` 配列化 + conform `form.insert/remove` + dnd-kit 入力 UI に揃える
- **業界標準**: Eventbrite / connpass の構造化アクセス入力、shadcn / Linear / Stripe Dashboard の構造化リスト編集
- **実例**: `Location.access String?` → `Location.accessLines Jsonb` 配列化（migration `20260501040959_location_access_to_jsonb_array`）+ `LocationForm.tsx` に `AccessLinesField` 導入

#### Twin queries drift sign

- **検出**: 同 model に対する複数の `'use cache'` / 公開 fetch helper があり、片方のみ publication filter 持ち
- **silent leak**: `getPublicPage(slug)` が `where: { isPublished: true, isActive: true }` を持つのに `getPageSeo(slug)` が `{ slug }` だけ → draft 本文は 404 でも metadata（OGP / `<meta>` tag）は公開ページに流出
- **対処**: 全 helper に同 filter を伝播。新規 SEO/metadata query 追加時は対応する content query の `where` を grep + 同期
- **実例**: 2026-05-07 修正、`isPublished: true, isActive: true` を `getPageSeo` に追加

### 7. boolean state update に「DB 読込反転」action 禁止

```typescript
// NG: SELECT → flip → UPDATE は race window + ロジック分散
export async function toggleXxxActive(id: string) {
  const cur = await prisma.xxx.findUnique({
    where: { id },
    select: { isActive: true },
  });
  await prisma.xxx.update({
    where: { id },
    data: { isActive: !cur.isActive },
  });
}

// OK: UI 側が `!current` 計算、domain は単一 UPDATE
// 業界標準: Stripe / Shopify Admin / GitHub API
export async function updateXxxActive(id: string, isActive: boolean) {
  await prisma.xxx.update({ where: { id }, data: { isActive } });
}
```

- **canonical 命名**: `update<Resource>Published(id, isPublished)` / `update<Resource>Active(id, isActive)`
- `PublishSwitch.onToggle: (id, bool) => Promise<MutationResult<T>>` 契約と整合（`frontend/admin-ui-patterns.md` §Gotchas 参照）
- 8 resource 統一済: Space / Location / Page / FAQ / News / Terms / Review (Published) + SpaceCategory (Active)
- **FK 紐づきガード**: 非アクティブ化で参照整合性が壊れる resource（`SpaceCategory._count.spaces > 0` 等）は domain command 内で `DomainError("CONFLICT")` early throw（`updateSpaceCategoryActive` が参照実装）
- ActionDropdown 経由の旧「公開/非公開にする」「有効化/無効化」menu は PublishSwitch 配線時に削除（責務単一化）
- **Coupon は `CouponStateToggle` 専用 component を使用** — PublishSwitch.label の binary published/unpublished prop を派生 5 状態（active/inactive/expired/limitReached/notStarted）に流用する API abuse 回避のため専用化（PR #155）
- **多状態 (3+ states) status は `<XxxStatusSelect>` inline Select pattern** — Reservation / Post / Event canonical（PR #159 / #161）。ActionDropdown 経由の publish/cancel/archive menu 復活禁止（状態変更は inline Select で完結）

### 8. 並び替え可能リソースの「表示順」整数を手動入力させない

D&D 並び替え（dnd-kit `reorderXxx`）を持つ admin リソースのフォームに `order` 数値入力を置くのは冗長 + ソート整数のユーザー露出（"0 始まり" の混乱源）。**order はシステム管理に一本化**する。業界標準（Notion / Linear / Sanity / Shopify）はいずれもソート整数を UI に露出せず D&D + 自動採番のみ。

```typescript
// NG: フォーム / コマンド入力契約に order を持たせ、手動数値入力させる
const itemFormSchema = z.object({
  order: z.number().int().min(0).default(0) /* ... */,
});
type ItemCommandInput = { order: number /* ... */ };
await prisma.item.update({ data: { order: input.order /* ... */ } }); // update で位置が動く

// OK: order はシステム管理（フォーム / CommandInput から完全削除）
// create — 末尾に自動採番
order: ((maxOrder._max.order ?? 0) + 1,
  // reorder（D&D が SSoT） — index で 0 始まり再採番
  await tx.item.update({ where: { id }, data: { order: index } }));
// update — order を変更しない（位置は reorder のみが変更）
await prisma.item.update({
  data: {
    /* order を含めない */
  },
});
```

- **3 経路の責務分離**: create=末尾自動採番 / reorder=D&D `reorderXxx(orderedIds)` が SSoT / update=order 不変
- **フォーム schema・CommandInput 契約から `order` を完全削除**（手動入力 UI も削除）。後方互換で optional に残さない
- `order Int @default(0)` カラムは維持（create で明示設定、update で省略）するため**マイグレーション不要**
- **reorder action は 2 形態**: ① `reorderXxx(orderedIds: string[])` — index で 0 始まり再採番（list が単一ページ・絞り込みなしのとき。FAQ / PostCategory / Terms）/ ② `updateXxxOrder(items: { id; sortOrder }[])` — 呼び出し側が sortOrder を明示（pagination/filter 付き list で `sortOrder = pageOffset + index` を渡す。SpaceCategory / Location）。どちらも interactive transaction（pg deprecation 回避）。read-only 詳細画面でも sort 整数を `DetailField` 等で露出しない（`LocationDetail` の「並び順」表示を削除、PR #404）
- **判定**: 当該リソースに D&D 並び替え（`*Sortable*` / `reorderXxx`）があるなら手動 order 入力は不要 → 削除。D&D が無い list は D&D 追加が第一選択（手動 order 入力の存続は最終手段、`frontend/admin-ui/tables/sortable-bulk.md` 参照）。reorder backend が既存なら UI 配線のみ、無ければ `reorderXxxCommand` + Server Action を新規追加する
- **canonical 実装（全 5 リソース適用完了、フォローアップ候補なし）**:
  - FAQ 項目 / カテゴリ — `reorderFaqItems` / `reorderFaqCategories` + Dialog form（PR #397）
  - PostCategory — `updatePostCategoryOrder` + `TaxonomyEditor` / `CategoryManager`（PR #400）
  - SpaceCategory — `updateSpaceCategoryOrder` + `CategoryTable` D&D + filter/pagination guard（PR #401）
  - Location — `updateLocationOrder` + `LocationTable` D&D + filter/pagination guard（PR #402）
  - Terms — `reorderTerms` / `reorderTermsCommand`（新規）+ `TermsTable` D&D（PR #403）

**監査 grep**（再発検出、いずれもゼロ件期待）:

```bash
# フォームの手動 order 数値入力残存
grep -rnE 'getInputProps\(fields\.(order|sortOrder|footerOrder)' src/app/\(admin\)
# read-only 詳細での sort 整数露出（DetailField label / 一覧の order 列）
grep -rnE 'label="(並び順|表示順)"' src/app/\(admin\) --include="*.tsx"
```
