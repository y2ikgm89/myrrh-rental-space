---
paths:
  - src/shared/db/**
  - src/**/actions/**/*.ts
  - src/**/queries/**/*.ts
  - src/app/api/**
  - prisma/**
---

# Prisma パターンルール

> Prisma 7 / WASM エンジン（`engineType = "client"` + `runtime = "bun"`）/ PostgreSQL（`package.json` の `prisma` と一致）

## Better Auth との境界

- **アプリ本体**: `src/shared/db/prisma.ts` の **`prisma`**（**`createAppPrismaClient`** 適用済み）。
- **Better Auth の `prismaAdapter`**: 同ファイルの **`basePrisma`**（拡張前クライアント）だけを `src/shared/db/better-auth-adapter.ts` 経由で渡す。アダプターに拡張済みクライアントを渡さない。
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

## 禁止事項

1. **型アサーション禁止**
   - `value as string[]` → `parseStringArray(value)`（→ `prisma-patterns/json-fields.md`）
   - `value as DiscountType` → `isValidDiscountType(value)` または `getValidDiscountType(value)`（→ `prisma-patterns/enums.md`）

2. **raw クエリの乱用禁止**
   - Prisma Client で表現できるクエリは Client を使用
   - `prisma.$queryRaw` は Prisma で表現不可能な場合のみ

3. **N+1 クエリ禁止**
   - ループ内でクエリを発行しない
   - `include` / `select` でまとめて取得（→ `prisma-patterns/queries.md`）

4. **手動 `Number()` 変換禁止（集計以外）**
   - `$extends` が自動変換済み。手動の `Number(space.pricePerHour)` は不要

5. **`prisma.$transaction([...])` 配列形式禁止**
   - ESLint `no-restricted-syntax` で error
   - 代替: `Promise.all([...])`（独立クエリ）または `prisma.$transaction(async (tx) => { ... })`（原子性必須）
   - 詳細: `prisma-patterns/queries.md` §トランザクション

6. **Prisma オブジェクトの直接 return 禁止（読み取り系 Actions）**
   - `return prismaObj` → NG（React 19 シリアライゼーションエラー）
   - `return prismaArray` → NG
   - `toPlainArray(prismaArray)` のみ（日付マッピングなし）→ NG（戻り値型に `date: string` がある場合、TypeScript 型エラー）
   - **OK**: `return toPlainObject({ ...obj, createdAt: obj.createdAt.toISOString(), updatedAt: obj.updatedAt.toISOString() })` — **`createdAt/updatedAt` だけでなく全ての `Date` フィールド**（`validFrom`, `validUntil`, `startTime`, `endTime`, `publishedAt` 等）も明示的に `.toISOString()` で変換すること。変換漏れがあると型は `Date` でも実態は `string` になりランタイムクラッシュする
   - **OK**: `return toPlainArray(array.map(item => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })))`

7. **`renderEditorStateToHtml` のトップレベル import 禁止**
   - `renderEditorStateToHtmlLazy()` を使用（ビルドエラー回避、→ `prisma-patterns/lexical-storage.md`）

8. **`'use cache'` 関数で `safeFetch()` を `await` なし・`toPlainObject()` なしで return 禁止**
   - `return safeFetch({...})` → `const result = await safeFetch({...}); return toPlainObject(result)`
   - Prisma モデルの narrow `select` でも Symbol プロパティは残る → `toPlainObject` 必須
   - 詳細と例 → `server-actions/implementation.md` §公開データ取得パターン

## ファイル配置

| パス                                      | 内容                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/shared/generated/prisma/client`        | Prisma 生成クライアント・enum（自動生成、編集禁止）                                                                                                                 |
| `@/shared/db/create-app-prisma-client.ts` | `$extends` 正本・`AppPrismaClient`                                                                                                                                  |
| `@/shared/db/prisma.ts`                   | `server-only` シングルトン・`prisma` インスタンス・Decimal 変換型                                                                                                   |
| `@/shared/db/prisma-input-json.ts`        | Prisma `InputJson` ヘルパー（seed / 共有コマンド向け、`server-only` なし）                                                                                          |
| `@generated/prisma/enums`                 | Prisma enum 定数（client-safe・gateway 経由で値再 export）                                                                                                          |
| `@generated/prisma/browser`               | client-safe な `Prisma` 名前空間 **型のみ**（gateway が type-only re-export 用に使用）                                                                              |
| `@generated/prisma/client`                | server-only な `Prisma` 名前空間 **値**（`JsonNull` / `DbNull` / `join` / `sql` / `raw`）・`PrismaClient` クラス（`shared/db/` / `shared/domain/` のみ直接 import） |
| `@/shared/lib/json-validators.ts`         | JSON フィールド Zod スキーマ・型・パース関数                                                                                                                        |
| `@/shared/lib/serialize.ts`               | `toPlainObject`、`toPlainArray`、`keysOf`                                                                                                                           |
| `@/shared/lib/validations/enums.ts`       | 全 enum 型ガード（`isValid*`）・デフォルト値取得（`getValid*`）・re-export                                                                                          |
| `@/shared/lib/errors/logger-core.ts`      | スクリプト可能な `logError`                                                                                                                                         |
| `@/shared/lib/errors/logger.ts`           | Next Server 専用（`server-only` + `logger-core` re-export）                                                                                                         |
| `@/admin/lib/lazy-renderer.ts`            | `renderEditorStateToHtmlLazy`（動的 import ラッパー）                                                                                                               |

## Gotchas

- **`prisma.$transaction([...])` 配列形式は pg deprecation を誘発するため禁止** — `@prisma/adapter-pg` + `pg` driver adapter 構成で、pinned PoolClient 上に `BEGIN + N queries + COMMIT` が積まれる瞬間に `pg/lib/client.js` の `_queryQueue.length > 0` チェックが発火し `Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0` を emit する。独立クエリは `Promise.all`、原子性必須は interactive transaction `prisma.$transaction(async (tx) => { ... })` を使う。ESLint `no-restricted-syntax` で error 検出。例外: `prisma/seed.ts` の一括 `deleteMany`（実行回数限定・原子性必須）
- **`PrismaPg` adapter 必須** — `scripts/` は Next.js ランタイム外のため `new PrismaClient()` 単独で WASM エンジンが初期化できず `PrismaClientInitializationError`。`new PrismaPg({ connectionString: databaseUrl })` → `new PrismaClient({ adapter })` の順で初期化
- **`PrismaPg` は接続設定オブジェクトを渡す（Prisma 7 公式推奨）** — `new PrismaPg({ connectionString, max, connectionTimeoutMillis, idleTimeoutMillis })` の config 渡しが公式 README / Prisma 7 サンプルの canonical 形式。`pg.Pool` の生成・dispose は adapter-pg が内部管理する。adapter factory の `connect()` は config 渡しだと内部で `new pg.Pool()` を生成するが、`connect()` 自体は PrismaClient 1 インスタンスのライフタイムにつき 1 回しか呼ばれない（client engine が `connected` state で memoize する公式仕様）。PrismaClient を globalThis singleton で保持していれば Pool も実質 1 インスタンスに収束する。外部 `pg.Pool` を `new Pool()` で生成して `PrismaPg` に渡す旧パターンは廃止 — アプリに不要な `pg` 直接依存が生まれ dual-instance リスクを招くため。`src/shared/db/prisma.ts` が参照実装
- **Prisma 7 の `pg Pool` v7 デフォルト（idle 10s / connect 0s）は Cloud Run で早期切断** — コールドスタート直後に接続が切れる。公式の v6 互換推奨値 `connectionTimeoutMillis: 5_000` / `idleTimeoutMillis: 300_000` を明示指定する（`src/shared/db/prisma.ts` 参照実装）
- **Prisma Client singleton は `declare global { var __myrrhPrismaGlobalStore: GlobalStore | undefined }` + `(globalThis.__myrrhPrismaGlobalStore ??= {})` ambient global パターン** — `globalThis as unknown as { prisma?: PrismaClient }` cast は `type-safety/assertion-bans.md` §1-7 許可例外外の silent debt のため 2026-05-18 に廃止。**`declare global` で type-safe な ambient declaration を作り `??=` で空 store を遅延初期化**する canonical (TypeScript / Next.js / Prisma の 1 つの公式バリアント)。store には PrismaClient のみ保持する（`pg.Pool` は adapter-pg 内部管理に委譲済）。R2 S3Client (`src/shared/lib/r2/client.ts`) も同パターン (`__myrrhR2GlobalStore`)。新規 server-only singleton 追加時は `declare global` + project prefix (`__myrrh<Service>GlobalStore`) で命名衝突を回避する（`src/shared/db/prisma.ts` 参照実装）
- **Prisma `log` 設定は本番 `["error"]` / dev `["warn", "error"]` に統一** — `"query"` は dev でも出力量が多くノイズになる。本番で `"warn"` / `"info"` を有効にするとログコスト増（Cloud Logging 料金）
- **`import type Prisma` はランタイムで使えない** — `Prisma.JsonNull` / `Prisma.DbNull` 等の **runtime sentinel 値** を使う場合は `import { Prisma } from "@generated/prisma/client"` を使用（`type` キーワードなし）。**型のみ**（`Prisma.InputJsonValue` / `Prisma.WhereInput` 等）はゲートウェイ `@/shared/lib/validations/enums/prisma-types` から `import type { Prisma }` で取得可能
- **gateway 経由で `Prisma` を値として import 禁止** — gateway は `export type { Prisma } from "@generated/prisma/browser"` で型のみ提供する。`generated/prisma/browser.ts` と `generated/prisma/client.ts` は内部で**異なる runtime モジュール**（`runtime/index-browser` vs `runtime/client`）を参照しており、`Prisma.JsonNull` 等の sentinel は両者で**異なるオブジェクト参照**になる。Prisma client は identity 比較で sentinel を判定するため、gateway 経由（browser 由来）の `JsonNull` を渡すと識別されず通常の null 扱いとなるサイレントバグを引き起こす。`architecture-boundaries.test.ts` で gateway の値 re-export を禁止
- **`Prisma.JsonNull` / `Prisma.DbNull` / `Prisma.{join,sql,raw}` runtime sentinel を使うファイルは `shared/db/` / `shared/domain/` 配下必須** — `shared/lib/` に置くと `architecture-boundaries.test.ts` の "generated Prisma import は shared/db の外に残さない" test で fail する silent debt の温床。新規ファイル作成時は (1) Prisma runtime sentinel 使用 / (2) `prisma.<model>.<crud>()` 直接呼出 のいずれかが必要なら `shared/domain/<feature>/` 配下に置く（canonical 移動 recipe: 本体を `shared/domain/` に移し、`shared/lib/` の barrel index は新 path から re-export して caller API を不変保つ）
- **nullable JSON update は `Prisma.InputJsonValue`（`JsonValue` 禁止）** — `data: { field: content as Prisma.JsonValue }` は型エラー。**`as Prisma.InputJsonValue` cast も禁止** (2026-05-17 PR #109 で src/ 12 cast → 0 構造解消済、2026-05-18 PR #133 で `prisma/seed.ts` 10 cast も helper 化 → プロジェクト全体 0 達成)。代わりに `asPrismaInputJsonValue(value, msg)` (既パース済オブジェクト用) または `parsePrismaInputJson(json, msg)` (string→parse 用) を `@/shared/db/prisma-input-json` 経由で使用。両 helper は `isPrismaInputJsonValue` type guard + `DomainError("VALIDATION")` throw で runtime narrow する。検出 grep: `grep -rnE "as Prisma\.InputJson" src/ prisma/` で 0 件維持
- **状態遷移の atomic claim は `updateMany({ where: { status: { not: TARGET } } })` + `count` 判定** — Stripe webhook / 並行配信が起こりうる context で `findUnique → update` の 2 ステップ idempotency は race window が残り、後続副作用（メール / 監査ログ / cache invalidate）が二重実行される silent bug を生む。PostgreSQL 単一 UPDATE は atomic のため WHERE 条件で排他制御し `count > 0` を claim 成否として副作用を gate する。relation 込みデータが必要な場合は claim 成功後に `findUniqueOrThrow` で再取得。`claimReservationAsPaid` / `claimReservationAsFailed` / `claimReservationAsRefunded` (`@/shared/domain/reservations/payment-queries`) が canonical 参照実装、Stripe webhook (`/api/webhooks/stripe`) で利用
- **`pg` / `@types/pg` をアプリの直接依存にしない** — Prisma 7 では `@prisma/adapter-pg` が `pg` / `@types/pg` を regular dependency としてバンドルする。アプリは config-object 形式（`new PrismaPg({ connectionString })`）で adapter を生成し `pg` を直接 import しないため、`package.json` の `dependencies` / `devDependencies` に `pg` / `@types/pg` を列挙しない。直接依存を持つと adapter-pg バンドル版との二重解決（`Client.connect()` 戻り値型の非互換 / runtime dual-instance）を招く。consumer が adapter-pg 1 つに一本化されていれば衝突は構造的に発生しない
- **`pg` は `overrides` で単一バージョンに固定（bun lockfile staleness 対策）**: アプリが `pg` を直接 import しなくなったため dual-instance の主因（2 consumer の version split）は構造的に解消済。ただし bun は lockfile に古い `pg` 解決を残し、`@prisma/adapter-pg` の dep 範囲（`^8.16.3`）内でも transitive `pg` を最新へ更新しない / `node_modules/@prisma/adapter-pg/node_modules/pg` に nested 解決する staleness がある。`package.json` の `overrides: { "pg": "^8.21.0" }` で全 `pg` 解決を単一バージョンに強制する。`pg` を上げる際はこの override を更新して `bun install`、`node_modules/@prisma/adapter-pg/node_modules` に nested `pg` が無いこと（`grep '"pg": \["pg@'` で lockfile が単一エントリ）を確認する
- **`node_modules/@prisma/client/` が空になる（runtime ファイル消失）** — worktree の install や branch 切替後に `@prisma/client/runtime/client.d.ts` 等が消えることがある。generated client は `@prisma/client/runtime/client` を import するため型推論が崩壊し、`bun run type-check` で Prisma 型が `never` に解決される大量エラーが発生する。`skipLibCheck: true` のため silent fail で `any` フォールバック。**復旧**: `bun install @prisma/client` を単独実行（1 コマンド、1-2 秒）。再発時は同じ対処で復旧。根本原因は bun の workspace hoist の不安定性で、`bun.lock` 変更なしで復旧するため commit 不要
- **複数パッケージ同時空化は systemic な bun install 中断 — canonical full reinstall** — `@prisma/client` 単独ではなく `pg` / `@aws-sdk/client-s3` / `jsdom` 等が同時に空化 + `node_modules/.old-<hex>/` staging 残骸が大量（bun の rename-on-install 中間ディレクトリで、install 完了前に中断されると残る）の場合は単発 `bun install <pkg>` では整合性が取り戻せない。`bun run dev` が `Module not found: Can't resolve '@prisma/client/runtime/client'` / `'pg'` で exit 1 する。検出: `find node_modules -maxdepth 2 -type d -empty`。復旧: `python3 -c "import shutil; shutil.rmtree('node_modules', ignore_errors=True); shutil.rmtree('.next', ignore_errors=True)"` + `bun install --force`（bun.lock 遵守で全パッケージをキャッシュ無視して再ダウンロード、実測 41s / 1193 packages）
- **Prisma JSON フィールド（`Json @db.JsonB`）はランタイムで既にパース済みオブジェクト** — `post.contentJson` は `string` ではなく `JsonValue`（= ランタイム上は object / array / primitive）。JSON 文字列が必要な場合は `JSON.stringify(contentJson)`、走査する helper 関数は **`unknown` 受付 + 内部で `typeof === "string"` 分岐**により「既パース済み or 文字列」両対応にすると Prisma レイヤーの変更（`toPlainObject` 等）に強い。`@/shared/lib/lexical/extract-headings` が参照実装
- **日次集計 SQL は `AT TIME ZONE 'Asia/Tokyo'` + `TO_CHAR` で JST 化必須** — `DATE("createdAt")` は UTC 基準のため Cloud Run 環境で JST 日付境界が 1 日ずれる silent bug（22:00 JST = 13:00 UTC は同日扱いだが、08:00 JST = 23:00 前日 UTC は前日扱いになる）。`TO_CHAR("createdAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')` で JST 文字列を生成し `GROUP BY` する。窓境界の `oldestDate` も `new Date(\`${todayJstStr}T00:00:00+09:00\`)` で JST midnight 基準で計算（`getReservationChartData` 参照実装）
