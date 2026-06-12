---
description: Prisma クライアント組立・初期化・環境（Better Auth 境界 / $extends 単一ソース / PageContent / pg adapter / singleton / ファイル配置）
paths:
  - src/shared/db/**
  - prisma/schema.prisma
  - prisma/seed.ts
---

# Prisma クライアント組立・環境

> Prisma 7 / WASM エンジン（`engineType = "client"` + `runtime = "bun"`）/ PostgreSQL（`package.json` の `prisma` と一致）。
> クエリ・Prisma 結果の扱い（select / include / Decimal / 禁止事項）は → `prisma-patterns/queries.md`、migration は → `prisma-patterns/migrations.md`。

## Better Auth との境界

- **アプリ本体**: `src/shared/db/prisma.ts` の **`prisma`**（**`createAppPrismaClient`** 適用済み）。
- **Better Auth の `prismaAdapter`**: 同ファイルの **`basePrisma`**（拡張前クライアント）だけを `src/shared/db/better-auth-adapter.ts` 経由で渡す。アダプターに拡張済みクライアントを渡さない。
- better-auth `prismaAdapter` は **`{ provider: "postgresql" }` のみ指定**する。`experimental.joins` 等の追加 option は better-auth ^1.6.11 の型定義に存在しない（旧版由来の stale 記述を 2026-05-30 監査で除去）。拡張前 `basePrisma` を渡す原則は上記のとおり。

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

## ファイル配置

| パス                                              | 内容                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@generated/prisma/client`                        | Prisma 生成クライアント・enum（自動生成、編集禁止）                                                                                                                 |
| `@/shared/db/create-app-prisma-client.ts`         | `$extends` 正本・`AppPrismaClient`                                                                                                                                  |
| `@/shared/db/prisma.ts`                           | `server-only` シングルトン・`prisma` インスタンス・Decimal 変換型                                                                                                   |
| `@/shared/db/prisma-input-json.ts`                | Prisma `InputJson` ヘルパー（seed / 共有コマンド向け、`server-only` なし）                                                                                          |
| `@generated/prisma/enums`                         | Prisma enum 定数（client-safe・gateway 経由で値再 export）                                                                                                          |
| `@generated/prisma/browser`                       | client-safe な `Prisma` 名前空間 **型のみ**（gateway が type-only re-export 用に使用）                                                                              |
| `@generated/prisma/client`                        | server-only な `Prisma` 名前空間 **値**（`JsonNull` / `DbNull` / `join` / `sql` / `raw`）・`PrismaClient` クラス（`shared/db/` / `shared/domain/` のみ直接 import） |
| `@/shared/lib/json-validators.ts`                 | JSON フィールド Zod スキーマ・型・パース関数                                                                                                                        |
| `@/shared/lib/serialize.ts`                       | `toPlainObject`、`toPlainArray`、`keysOf`                                                                                                                           |
| `@/shared/lib/validations/enums/{guards,helpers}` | enum 型ガード（`isValid*`、guards）・デフォルト値取得（`getValid*`、helpers）                                                                                       |
| `@/shared/lib/errors/logger-core.ts`              | スクリプト可能な `logError`                                                                                                                                         |
| `@/shared/lib/errors/logger.ts`                   | Next Server 専用（`server-only` + `logger-core` re-export）                                                                                                         |
| `@/admin/lib/lazy-renderer.ts`                    | `renderEditorStateToHtmlLazy`（動的 import ラッパー）                                                                                                               |

## Gotchas

- **`PrismaPg` adapter 必須** — `scripts/` は Next.js ランタイム外のため `new PrismaClient()` 単独で WASM エンジンが初期化できず `PrismaClientInitializationError`。`new PrismaPg({ connectionString: databaseUrl })` → `new PrismaClient({ adapter })` の順で初期化
- **`PrismaPg` は接続設定オブジェクトを渡す（Prisma 7 公式推奨）** — `new PrismaPg({ connectionString, max, connectionTimeoutMillis, idleTimeoutMillis })` の config 渡しが公式 README / Prisma 7 サンプルの canonical 形式。`pg.Pool` の生成・dispose は adapter-pg が内部管理する。adapter factory の `connect()` は config 渡しだと内部で `new pg.Pool()` を生成するが、`connect()` 自体は PrismaClient 1 インスタンスのライフタイムにつき 1 回しか呼ばれない（client engine が `connected` state で memoize する公式仕様）。PrismaClient を globalThis singleton で保持していれば Pool も実質 1 インスタンスに収束する。外部 `pg.Pool` を `new Pool()` で生成して `PrismaPg` に渡す旧パターンは廃止 — アプリに不要な `pg` 直接依存が生まれ dual-instance リスクを招くため。`src/shared/db/prisma.ts` が参照実装
- **Prisma 7 の `pg Pool` v7 デフォルト（idle 10s / connect 0s）は Cloud Run で早期切断** — コールドスタート直後に接続が切れる。公式の v6 互換推奨値 `connectionTimeoutMillis: 5_000` / `idleTimeoutMillis: 300_000` を明示指定する（`src/shared/db/prisma.ts` 参照実装）
- **Prisma Client singleton は `declare global { var __myrrhPrismaGlobalStore: GlobalStore | undefined }` + `(globalThis.__myrrhPrismaGlobalStore ??= {})` ambient global パターン** — `globalThis as unknown as { prisma?: PrismaClient }` cast は `type-safety/assertion-bans.md` §1-7 許可例外外の silent debt のため 2026-05-18 に廃止。**`declare global` で type-safe な ambient declaration を作り `??=` で空 store を遅延初期化**する canonical (TypeScript / Next.js / Prisma の 1 つの公式バリアント)。store には PrismaClient のみ保持する（`pg.Pool` は adapter-pg 内部管理に委譲済）。R2 S3Client (`src/shared/lib/r2/client.ts`) も同パターン (`__myrrhR2GlobalStore`)。新規 server-only singleton 追加時は `declare global` + project prefix (`__myrrh<Service>GlobalStore`) で命名衝突を回避する（`src/shared/db/prisma.ts` 参照実装）
- **Prisma `log` 設定は本番 `["error"]` / dev `["warn", "error"]` に統一** — `"query"` は dev でも出力量が多くノイズになる。本番で `"warn"` / `"info"` を有効にするとログコスト増（Cloud Logging 料金）
- **`import type Prisma` はランタイムで使えない** — `Prisma.JsonNull` / `Prisma.DbNull` 等の **runtime sentinel 値** を使う場合は `import { Prisma } from "@generated/prisma/client"` を使用（`type` キーワードなし）。**型のみ**（`Prisma.InputJsonValue` / `Prisma.WhereInput` 等）はゲートウェイ `@/shared/lib/validations/enums/prisma-types` から `import type { Prisma }` で取得可能
- **gateway 経由で `Prisma` を値として import 禁止** — gateway は `export type { Prisma } from "@generated/prisma/browser"` で型のみ提供する。`generated/prisma/browser.ts` と `generated/prisma/client.ts` は内部で**異なる runtime モジュール**（`runtime/index-browser` vs `runtime/client`）を参照しており、`Prisma.JsonNull` 等の sentinel は両者で**異なるオブジェクト参照**になる。Prisma client は identity 比較で sentinel を判定するため、gateway 経由（browser 由来）の `JsonNull` を渡すと識別されず通常の null 扱いとなるサイレントバグを引き起こす。`architecture-boundaries.test.ts` で gateway の値 re-export を禁止
- **`Prisma.JsonNull` / `Prisma.DbNull` / `Prisma.{join,sql,raw}` runtime sentinel を使うファイルは `shared/db/` / `shared/domain/` 配下必須** — `shared/lib/` に置くと `architecture-boundaries.test.ts` の "generated Prisma import は shared/db の外に残さない" test で fail する silent debt の温床。新規ファイル作成時は (1) Prisma runtime sentinel 使用 / (2) `prisma.<model>.<crud>()` 直接呼出 のいずれかが必要なら `shared/domain/<feature>/` 配下に置く（canonical 移動 recipe: 本体を `shared/domain/` に移し、`shared/lib/` の barrel index は新 path から re-export して caller API を不変保つ）
- **`node_modules/@prisma/client/` が空になる（runtime ファイル消失）** — worktree の install や branch 切替後に `@prisma/client/runtime/client.d.ts` 等が消えることがある。generated client は `@prisma/client/runtime/client` を import するため型推論が崩壊し、`bun run type-check` で Prisma 型が `never` に解決される大量エラーが発生する。`skipLibCheck: true` のため silent fail で `any` フォールバック。**復旧**: `bun install @prisma/client` を単独実行（1 コマンド、1-2 秒）。再発時は同じ対処で復旧。根本原因は bun の workspace hoist の不安定性で、`bun.lock` 変更なしで復旧するため commit 不要
- **複数パッケージ同時空化は systemic な bun install 中断 — canonical full reinstall** — `@prisma/client` 単独ではなく `pg` / `@aws-sdk/client-s3` / `jsdom` 等が同時に空化 + `node_modules/.old-<hex>/` staging 残骸が大量（bun の rename-on-install 中間ディレクトリで、install 完了前に中断されると残る）の場合は単発 `bun install <pkg>` では整合性が取り戻せない。`bun run dev` が `Module not found: Can't resolve '@prisma/client/runtime/client'` / `'pg'` で exit 1 する。検出: `find node_modules -maxdepth 2 -type d -empty`。復旧: `python3 -c "import shutil; shutil.rmtree('node_modules', ignore_errors=True); shutil.rmtree('.next', ignore_errors=True)"` + `bun install --force`（bun.lock 遵守で全パッケージをキャッシュ無視して再ダウンロード、実測 41s / 1193 packages）
