---
paths:
  - src/shared/db/**
  - src/**/actions/**/*.ts
  - src/**/queries/**/*.ts
  - src/app/api/**
  - prisma/**
---

# Prisma パターンルール

> Prisma 7.5 / WASM エンジン（`engineType = "client"` + `runtime = "bun"`）/ PostgreSQL（`package.json` の `prisma` と一致）

## Better Auth との境界

- **アプリ本体**: `src/shared/db/prisma.ts` の **`prisma`**（**`createAppPrismaClient`** 適用済み）。
- **Better Auth の `prismaAdapter`**: 同ファイルの **`prismaForBetterAuth`**（拡張前クライアント）だけを `src/shared/db/better-auth-adapter.ts` 経由で渡す。アダプターに拡張済みクライアントを渡さない。
- 認証設定側では **`experimental.joins: true`** を維持（Prisma アダプター公式推奨）。理由は `.claude/rules/auth-patterns.md` の「Prisma アダプター + Prisma 7」を参照。

## Prisma クライアントの組み立て（拡張の単一ソース）

[`$extends`](https://www.prisma.io/docs/orm/prisma-client/client-extensions) の **result 拡張**は **`src/shared/db/create-app-prisma-client.ts`** にのみ書く。

- **`createAppPrismaClient`** — seed と `prisma.ts` の両方で呼ぶ。戻り値型 **`AppPrismaClient`** を domain の「seed からも使うコマンド」の引数に使う。
- **`prisma/seed.ts`** — 素の `new PrismaClient({ adapter })` に続けて **`createAppPrismaClient(...)`** を適用。`@/shared/db/prisma` は import しない（`server-only`）。
- **ログ** — 共有コマンドが `@/shared/lib/errors/logger` を import すると seed が落ちる。**スクリプト可能なコードパスでは `@/shared/lib/errors/logger-core`** を使う。
- **マイグレーション** — 開発は `bunx --bun prisma migrate dev --name <snake_case>`、本番は `migrate deploy`。[Baselining](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining) は公式手順に従う。

## PageContent（Page-First）

PostgreSQL の UUID 主キーは **native `uuid` + Prisma `String @db.Uuid`**（[Prisma スキーマ reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference#uuid)）。

- 主キー: `String @id @default(uuid()) @db.Uuid`（DB 既定は `gen_random_uuid()`。`uuid-ossp` は不要）
- 取得・`cacheTag` は **`pageKey`** を正とする（`id` は内部用）
- 使っていない `updatedBy` 等の列は置かない。監査が必要なら `User` FK を付けて追加

## Enum パターン（Prisma 7 mapped enums）

### 1. Prisma enum 定数を使用（文字列リテラル禁止）

Prisma 7 の `@map` enum は TypeScript 側で `as const` オブジェクトとして生成される。
**文字列リテラルではなく enum 定数を使用すること**:

```typescript
import { DiscountType, CalendarSyncMethod } from '@/shared/generated/prisma/client'

// NG: 文字列リテラル比較
if (space.discountType === 'none') { ... }
const defaultValue = 'polling'

// OK: Prisma enum 定数
if (space.discountType === DiscountType.none) { ... }
const defaultValue = CalendarSyncMethod.polling
```

**注意**: `@map` enum の TS 値はスキーマメンバー名（例: `post_name`）。DB マッピング値（例: `post-name`）ではない。

**Prisma 7 既知バグ（v7.2.0〜）**: mapped enum 値を Prisma Client 操作に渡すとランタイムエラーが発生する場合がある（[#28591](https://github.com/prisma/prisma/issues/28591)）。修正が出るまでは本コードベースの既存パターンに従い、enum 定数を使用し続ける。

### 2. 型ガードは enums.ts に集約（Single Source of Truth）

全 Prisma enum の型ガード（`isValid*`）とデフォルト値取得（`getValid*`）は `enums.ts` に一元化。
**ローカルファイルに型ガードを定義しない**:

```typescript
// NG: ローカルファイルに型ガードを定義
const VALID_TYPES = new Set<string>(Object.values(DiscountType))
function isDiscountType(value: unknown): value is DiscountType { ... }

// OK: enums.ts から import
import { isValidDiscountType, getValidDiscountType } from '@/shared/lib/validations/enums'

// 使用例（SelectionBox / Select の onChange）
onChange={(value) => {
  if (isValidDiscountType(value)) setDiscountType(value)
}}

// 使用例（デフォルト値付きパース — DB 値やフォーム初期値に最適）
const type = getValidDiscountType(rawValue)                       // デフォルト: DiscountType.none
const type = getValidDiscountType(rawValue, DiscountType.percentage)  // カスタムデフォルト
```

内部実装（参考）— `Set` による O(1) ルックアップ:

```typescript
// enums.ts 内部（編集禁止。パターン参照のみ）
const VALID_DISCOUNT_TYPES = new Set<string>(Object.values(DiscountType));

export function isValidDiscountType(value: unknown): value is DiscountType {
  return typeof value === "string" && VALID_DISCOUNT_TYPES.has(value);
}
```

### 3. Prisma enum を直接使用（型エイリアス不要）

型エイリアスによる間接参照は不要。Prisma enum を直接使用する:

```typescript
// NG: 型エイリアス（削除済み。追加禁止）
export type SpaceDiscountType = DiscountType;

// OK: Prisma enum を直接使用
import { DiscountType } from "@/shared/generated/prisma/client";
type Foo = { discountType: DiscountType };
```

### 4. SelectItem 値に enum 定数を使用

```tsx
// NG:
<SelectItem value="polling">ポーリング</SelectItem>

// OK:
<SelectItem value={CalendarSyncMethod.polling}>ポーリング</SelectItem>
```

### 5. 禁止事項（enum 関連）

| 禁止                                                               | 代替                                              |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| `'none'`, `'polling'` 等の文字列リテラル比較                       | `DiscountType.none`, `CalendarSyncMethod.polling` |
| `new Set(['none', 'percentage', 'fixed'])`                         | `enums.ts` の `isValid*` / `getValid*` を使用     |
| `export type Foo = 'a' \| 'b'`（Prisma enum と同じ値）             | Prisma enum を直接使用                            |
| `.default('none')` （Zod スキーマ）                                | `.default(DiscountType.none)`                     |
| ローカルファイルに `isValid*` / `new Set(Object.values(...))` 定義 | `enums.ts` から import                            |
| `export type Foo = PrismaEnum`（不要な型エイリアス）               | Prisma enum を直接使用                            |
| `z.nativeEnum(DiscountType)` （Zod 4 非推奨）                      | `z.enum(DiscountType)`                            |

### 6. 配置規則（enum 関連）

| ファイル                            | 内容                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `@/shared/generated/prisma/client`  | Prisma 生成 enum 定数（自動生成、編集禁止）                                                      |
| `@/shared/lib/validations/enums.ts` | 全 enum の型ガード（`isValid*`）、デフォルト値取得（`getValid*`）、re-export、フィルターヘルパー |
| 各ドメインファイル                  | enum 定数の import のみ。型ガードは `enums.ts` から import                                       |

### 7. Enum 拡張時のチェックリスト

新しい enum 値を追加した場合、以下を **すべて** 確認すること:

- Badge コンポーネント（ステータス表示）
- Filter / Select の選択肢
- Calendar 色マッピング
- Zod schema（`z.enum()`）
- 統計クエリ（`count({ where: { status } })`）
- カレンダー同期ロジック
- `prisma/seed.ts`

### 8. Customer / Inquiry フィールド追加時のチェックリスト

モデルにフィールドを追加した場合、以下を **すべて** 確認すること:

- `types.ts`（型定義）
- `queries.ts`（全 `select` 句）
- `customer-queries.ts`（顧客マイページ用 `select` 句 — 一覧用 `LIST_SELECT` と詳細用 `DETAIL_SELECT` の両方）
- 管理画面 Form / Detail / Table コンポーネント
- マイページ詳細・一覧コンポーネント（props 型の同期）
- メール `types` / テンプレート
- `prisma/seed.ts`
- テスト
- カレンダー同期（予約関連のみ）
- ドメインコマンドの `CUSTOMER_SELECT` 定数

---

## JSON フィールドの型安全化

### Zod スキーマによるランタイムバリデーション

`Prisma.JsonValue` は `unknown` 相当のため、ランタイムで Zod 検証を行う。
全パース関数は `@/shared/lib/json-validators.ts` に集約:

```typescript
import {
  parseStringArray,
  parseBusinessHours,
} from "@/shared/lib/json-validators";

// string[] へのパース（失敗時は空配列を返す）
const imageUrls = parseStringArray(space.imageUrls); // string[]
const facilities = parseStringArray(space.facilities); // string[]
const tags = parseStringArray(post.tags); // string[]

// 複雑な JSON フィールドのパース（失敗時は null を返す）
const businessHours = parseBusinessHours(settings.businessHours); // BusinessHours | null
```

### 複雑な JSON フィールド（Zod スキーマ + 型推論）

Zod スキーマから型を推論し、パース関数を提供:

```typescript
// @/shared/lib/json-validators.ts
const businessTimeSlotSchema = z.object({
  openTime: z.string(),
  closeTime: z.string(),
});

const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(businessTimeSlotSchema),
});

const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
});

// 型は Zod スキーマから推論（手動型定義禁止）
export type BusinessTimeSlot = z.infer<typeof businessTimeSlotSchema>;
export type BusinessHoursDay = z.infer<typeof businessHoursDaySchema>;
export type BusinessHours = z.infer<typeof businessHoursSchema>;

export function parseBusinessHours(value: unknown): BusinessHours | null {
  const result = businessHoursSchema.safeParse(value);
  return result.success ? result.data : null;
}
```

### React 19 シリアライゼーション（toPlainObject / toPlainArray）

Prisma オブジェクトは Symbol プロパティ（`$Enums` 等）を含むため、Server Component → Client Component への props 渡し時に React 19 のシリアライゼーションエラーが発生する。
`toPlainObject()` / `toPlainArray()` でプレーンオブジェクトに変換してから渡す:

```typescript
import { toPlainObject, toPlainArray } from '@/shared/lib/serialize'

// Server Component → Client Component（単体）
const settings = await prisma.settings.findFirst({ select: { ... } })
return toPlainObject(settings)  // Symbol プロパティを除去

// Server Component → Client Component（配列）
const items = await prisma.post.findMany({ ... })
return toPlainArray(items)
```

**注意**: `safeFetch` + `'use cache'` で取得した公開データは同様に `toPlainObject()` でラップする（`server-actions.md` §公開データ取得パターン 参照）。

### Date フィールドの Server→Client 境界シリアライゼーション

React 19 は Server Component → Client Component へ props を渡す際に `Date` を ISO 8601 文字列に変換する（[公式: Serializable types](https://react.dev/reference/rsc/use-client#serializable-types)）。`toPlainObject()` も `JSON.parse(JSON.stringify())` で同様に変換する。

**`toPlainObject()` は型の嘘**: 戻り値型は `T` のままだが、実態は日付フィールドが `string` になっている。

#### Client Component に渡す型は `string` で宣言する

```typescript
// NG: Client Component に渡す型で Date を宣言
export type ReservationWithRelations = {
  startTime: Date; // runtime では string になる → クラッシュ
  endTime: Date;
};

// OK: 実態に合わせて string で宣言
export type ReservationWithRelations = {
  /** toPlainObject() / React 19 シリアライズ済み ISO 8601 文字列 */
  startTime: string;
  /** toPlainObject() / React 19 シリアライズ済み ISO 8601 文字列 */
  endTime: string;
};
```

#### Server Action 側で明示的に `.toISOString()` 変換する

```typescript
// NG: toPlainObject に型変換を委ねる（型チェックエラー）
const formatted: ReservationWithRelations[] = toPlainArray(reservations);

// OK: 明示的にシリアライズして型と実態を一致させる
const formatted: ReservationWithRelations[] = reservations.map((r) => ({
  ...r,
  startTime: r.startTime.toISOString(),
  endTime: r.endTime.toISOString(),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
}));
```

> **注（重要）**: `{ ...prismaObj }` の JavaScript スプレッドは**トップレベルの** Symbol キーのみ除外する（シャローコピー）。`include` で取得したネストされた Prisma オブジェクト（`space`、`customer`、`coupon` 等）は依然 Symbol プロパティ（`nodejs.util.inspect.custom` 等）を保持する → React 19 シリアライゼーションエラー。**ネストされたリレーションを含む場合は `toPlainObject()` が必須。**

#### Client Component では `new Date()` でラップして date-fns に渡す

```typescript
// NG: string に date-fns を直接適用 → TypeError
format(event.startTime, "HH:mm");
isSameDay(event.startTime, day);
event.startTime.getTime();

// OK: new Date() でパースしてから適用
format(new Date(event.startTime), "HH:mm");
isSameDay(new Date(event.startTime), day);
new Date(event.startTime).getTime();

// OK: ISO 8601 UTC 文字列のソートは localeCompare() で代替（辞書順 = 時系列順）
events.sort((a, b) => a.startTime.localeCompare(b.startTime));
```

**適用範囲**: Server→Client 境界を越えるデータのみ。Server Component 内のみで完結する処理は `Date` のままで問題ない。

### ISO 8601 文字列と `Date` の直接比較は常に false

```typescript
// NG: 文字列と Date の直接比較 → NaN 比較になり常に false
const now = new Date()
if (coupon.validUntil > now) { ... }  // false（文字列 > Date は NaN）
if (coupon.validFrom < now) { ... }   // false（文字列 < Date は NaN）

// OK: new Date() でラップしてから比較
if (new Date(coupon.validUntil) > now) { ... }
if (new Date(coupon.validFrom) < now) { ... }
```

`getCouponStatus` 等のステータス判定で文字列日付と現在時刻を比較する場合に起きやすい。Client Component に ISO 8601 文字列として渡された日付フィールドは必ず `new Date(field)` でラップすること。

### JSON フィールド配置規則

| ファイル                          | 内容                                      |
| --------------------------------- | ----------------------------------------- |
| `@/shared/lib/json-validators.ts` | Zod スキーマ、型推論、パース関数          |
| `@/shared/lib/serialize.ts`       | `toPlainObject`、`toPlainArray`、`keysOf` |

---

## Decimal 自動変換（$extends）

`createAppPrismaClient` の `$extends`（アプリ・seed で共通）により、対象モデルの Decimal が **結果として** `number` になる。
**手動で `Number()` を呼び出す必要はない**:

```typescript
// NG: 手動変換（不要）
const price = Number(space.pricePerHour);

// OK: $extends が自動変換済み
const price = space.pricePerHour; // number 型
```

**例外**: 集計結果（`_sum`, `_avg` 等）は `$extends` が効かないため、手動で `Number()` を使用:

```typescript
// 集計結果のみ手動変換が必要
const totalRevenue = await prisma.reservation.aggregate({
  _sum: { totalPrice: true },
});
const total = Number(totalRevenue._sum.totalPrice ?? 0);
```

### 対象モデルと型エクスポート

`prisma.ts` から `ConvertDecimalFields<T>` 適用済みの型をエクスポート済み:

```typescript
import type {
  Space,
  Reservation,
  Customer,
  Settings,
  Coupon,
} from "@/shared/db/prisma";

// これらの型は Decimal が number に変換済み
const space: Space = await prisma.space.findUniqueOrThrow({ where: { id } });
space.pricePerHour; // number（Decimal ではない）
```

---

## Lexical JSON Primary パターン

7 モデル（Post, PostVersion, News, NewsVersion, TermsVersion, Section, FaqItem）が以下の構成を持つ:

```prisma
contentHtml String  @db.Text @map("content")  // HTML キャッシュ（公開表示用）
contentJson Json?                              // Lexical EditorState JSON（プライマリ）
```

### Server Actions での保存パターン

Editor の `onChange` は JSON 文字列を返す。Server Actions で `renderEditorStateToHtmlLazy()` を使い HTML を生成し、DB に同時保存する:

```typescript
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";

export async function updatePost(id: string, data: PostInput) {
  // contentJson（プライマリ）と contentHtml（キャッシュ）を同時保存
  const contentJson = JSON.parse(data.contentJson) as Prisma.InputJsonObject;
  const contentHtml = await renderEditorStateToHtmlLazy(data.contentJson);

  await prisma.post.update({
    where: { id },
    data: { contentJson, contentHtml },
  });
}
```

### lazy-renderer が必須な理由

`renderEditorStateToHtml` は Lexical headless editor を使用する。Server Actions でトップレベル import するとビルド時に `createContext is not a function` エラーが発生する。
`lazy-renderer.ts` の動的 import パターンが必須:

```typescript
// NG: トップレベル import（ビルドエラー）
import { renderEditorStateToHtml } from "@/admin/components/editor/lexical/preview/headless-renderer";

// OK: lazy-renderer 経由の動的 import
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
const html = await renderEditorStateToHtmlLazy(jsonString);
```

### 公開表示でのレンダリング

公開ページでは `contentHtml` を直接使用（再レンダリング不要）:

```typescript
// 公開ページコンポーネント
import { SanitizedHtml } from '@/shared/components/SanitizedHtml'

export function PostContent({ post }: { post: Post }) {
  return <SanitizedHtml html={post.contentHtml} />
}
```

管理画面の LexicalEditor は `contentJson`（EditorState JSON）のみを初期化に使用する。`contentHtml` は公開表示用の生成キャッシュであり、エディタ復元には使わない。

---

## クエリパターン

### Select 句で型を限定

```typescript
// OK: 必要なフィールドのみ取得
const post = await prisma.post.findUnique({
  where: { id },
  select: {
    id: true,
    title: true,
    contentHtml: true,
  },
});

// NG: 全フィールド取得（パフォーマンス低下・不要なデータ転送）
const post = await prisma.post.findUnique({ where: { id } });
```

### Include vs Select

```typescript
// OK: リレーションの一部フィールドのみ（推奨）
const post = await prisma.post.findUnique({
  where: { id },
  select: {
    id: true,
    title: true,
    author: {
      select: { name: true },
    },
  },
});
```

**⚠️ `include` と top-level `select` は同時使用不可**。`include: { _count }` や `include: { relation }` を含む findMany を explicit select に変換する場合、リレーションを `select` 内でネストする:

```typescript
// NG: include + select を同時使用（Prisma エラー）
prisma.postCategory.findMany({
  select: { id: true, name: true },
  include: { _count: { select: { posts: true } } }, // ← エラー
});

// OK: select 内でネスト
prisma.postCategory.findMany({
  select: {
    id: true,
    name: true,
    _count: { select: { posts: true } }, // ← ネストして解決
    author: { select: { id: true, name: true, email: true } },
  },
});
```

### List クエリ専用型（Omit パターン）

list クエリで重いフィールド（`contentHtml` / `contentJson` 等）を除外する場合、`Omit` で list 専用型を派生させる。
**select 変換後はコンポーネントの prop 型も更新が必要**（`bun run type-check` で洗い出せる）:

```typescript
// validations/post.ts — 重いフィールドを除いた list 専用型
export type PostListData = Omit<PostData, "contentHtml" | "contentJson">;

export type GetPostsResult = {
  posts: PostListData[]; // PostData[] から変更
  total: number;
  // ...
};

// PostTable.tsx — 受け取る prop 型も更新する
type PostTableProps = {
  posts: PostListData[]; // PostData[] → PostListData[]
};
```

### トランザクション

```typescript
// バッチトランザクション（複数操作の原子性）
const [post, auditLog] = await prisma.$transaction([
  prisma.post.create({ data: postData }),
  prisma.auditLog.create({ data: auditData }),
]);

// インタラクティブトランザクション（依存関係あり）
await prisma.$transaction(async (tx) => {
  const post = await tx.post.create({ data: postData });
  await tx.postTag.createMany({
    data: tags.map((tagId) => ({ postId: post.id, tagId })),
  });
  return post;
});
```

---

## 禁止事項

1. **型アサーション禁止**
   - `value as string[]` → `parseStringArray(value)`
   - `value as DiscountType` → `isValidDiscountType(value)` または `getValidDiscountType(value)`

2. **raw クエリの乱用禁止**
   - Prisma Client で表現できるクエリは Client を使用
   - `prisma.$queryRaw` は Prisma で表現不可能な場合のみ

3. **N+1 クエリ禁止**
   - ループ内でクエリを発行しない
   - `include` / `select` でまとめて取得

4. **手動 `Number()` 変換禁止（集計以外）**
   - `$extends` が自動変換済み。手動の `Number(space.pricePerHour)` は不要

5. **Prisma オブジェクトの直接 return 禁止（読み取り系 Actions）**
   - `return prismaObj` → NG（React 19 シリアライゼーションエラー）
   - `return prismaArray` → NG
   - `toPlainArray(prismaArray)` のみ（日付マッピングなし）→ NG（戻り値型に `date: string` がある場合、TypeScript 型エラー）
   - **OK**: `return toPlainObject({ ...obj, createdAt: obj.createdAt.toISOString(), updatedAt: obj.updatedAt.toISOString() })` — **`createdAt/updatedAt` だけでなく全ての `Date` フィールド**（`validFrom`, `validUntil`, `startTime`, `endTime`, `publishedAt` 等）も明示的に `.toISOString()` で変換すること。変換漏れがあると型は `Date` でも実態は `string` になりランタイムクラッシュする
   - **OK**: `return toPlainArray(array.map(item => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })))`

6. **`renderEditorStateToHtml` のトップレベル import 禁止**
   - `renderEditorStateToHtmlLazy()` を使用（ビルドエラー回避）

7. **`'use cache'` 関数で `safeFetch()` を `await` なし・`toPlainObject()` なしで return 禁止**
   - `return safeFetch({...})` → `const result = await safeFetch({...}); return toPlainObject(result)`
   - Prisma モデルの narrow `select` でも Symbol プロパティは残る → `toPlainObject` 必須
   - 詳細と例 → `server-actions.md` §公開データ取得パターン

---

## ファイル配置

| パス                                      | 内容                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `@/shared/generated/prisma/client`        | Prisma 生成クライアント・enum（自動生成、編集禁止）                        |
| `@/shared/db/create-app-prisma-client.ts` | `$extends` 正本・`AppPrismaClient`                                         |
| `@/shared/db/prisma.ts`                   | `server-only` シングルトン・`prisma` インスタンス・Decimal 変換型          |
| `@/shared/db/prisma-input-json.ts`        | Prisma `InputJson` ヘルパー（seed / 共有コマンド向け、`server-only` なし） |
| `@generated/prisma/enums`                 | Prisma enum 定数（直接 import）                                            |
| `@generated/prisma/client`                | `Prisma` 名前空間・`PrismaClient`（直接 import）                           |
| `@/shared/lib/json-validators.ts`         | JSON フィールド Zod スキーマ・型・パース関数                               |
| `@/shared/lib/serialize.ts`               | `toPlainObject`、`toPlainArray`、`keysOf`                                  |
| `@/shared/lib/validations/enums.ts`       | 全 enum 型ガード（`isValid*`）・デフォルト値取得（`getValid*`）・re-export |
| `@/shared/lib/errors/logger-core.ts`      | スクリプト可能な `logError`                                                |
| `@/shared/lib/errors/logger.ts`           | Next Server 専用（`server-only` + `logger-core` re-export）                |
| `@/admin/lib/lazy-renderer.ts`            | `renderEditorStateToHtmlLazy`（動的 import ラッパー）                      |

## Gotchas

- **`PrismaPg` adapter 必須** — `scripts/` は Next.js ランタイム外のため `new PrismaClient()` 単独で WASM エンジンが初期化できず `PrismaClientInitializationError`。`new PrismaPg({ connectionString: databaseUrl })` → `new PrismaClient({ adapter })` の順で初期化
- **`import type Prisma` はランタイムで使えない** — `Prisma.JsonNull` / `Prisma.InputJsonValue` 等の実値を使う場合は `import { Prisma } from "@generated/prisma/client"` （`type` キーワードなし）
- **nullable JSON update は `Prisma.InputJsonValue`（`JsonValue` 禁止）** — `data: { field: content as Prisma.JsonValue }` は型エラー。`content as Prisma.InputJsonValue` を使う
