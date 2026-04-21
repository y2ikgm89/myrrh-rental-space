# 技術スタック

最終更新: 2026-04-11

## コア

| 技術       | バージョン | 用途                                       |
| ---------- | ---------- | ------------------------------------------ |
| Next.js    | 16.2.3     | App Router, PPR, `proxy.ts`, Metadata API  |
| React      | 19.2.5     | Server / Client Components, React Compiler |
| TypeScript | 6.0.2      | strict type-checking, `erasableSyntaxOnly` |
| Bun        | 1.3.11     | package manager, test runner, app runtime  |

## データと認証

| 技術                 | バージョン | 用途                                                           |
| -------------------- | ---------- | -------------------------------------------------------------- |
| Prisma               | 7.7.0      | ORM, WASM client, `createAppPrismaClient` で `$extends` 共通化 |
| PostgreSQL           | 16         | 本番 DB（Cloud Run から接続）                                  |
| `@prisma/adapter-pg` | 7.7.0      | Prisma driver adapter（seed / `prisma.ts` で必須）             |
| Better Auth          | 1.6.2      | session / RBAC                                                 |
| Zod                  | 4.3.6      | 入出力検証                                                     |

## UI と体験

| 技術         | バージョン | 用途                               |
| ------------ | ---------- | ---------------------------------- |
| Tailwind CSS | 4.2.2      | styling, theme tokens              |
| GSAP         | 3.14.2     | scroll / timeline animation        |
| Lenis        | 1.3.21     | smooth scroll（`bun.lock` 解決版） |
| nuqs         | 2.8.9      | search params state                |
| Lexical      | 0.43.0     | admin rich text editor             |

## 実装上の判断

### Prisma generated output

- 出力先は `generated/prisma/*`
- 生成物は git 管理しない
- `src/` 配下には置かない
- アプリからは `src/shared/db/*` 経由で参照する
- **`createAppPrismaClient`**（`src/shared/db/create-app-prisma-client.ts`）が `$extends` の単一ソース。`prisma.ts` と `prisma/seed.ts` の両方で適用し、Better Auth には拡張前 **`basePrisma`** のみ渡す（`ARCHITECTURE.md` §DB 境界）

### Proxy

- `src/proxy.ts` は auth / security 専用
- 公開 permalink 解決や Prisma クエリは持たない
- admin gate token は `ADMIN_LOGIN_TOKEN` を署名鍵にするが、本検証は Route Handler 側で行う
- `/api/admin/login-tokens/authorize` が署名検証 + DB消費 + `admin-gate` cookie 発行を担う

### 公開レンダリング

- 静的 shell は `src/app/(public)/layout.tsx`（LenisProvider / MobileNav 等の軽量 shell）
- 視覚効果はページ単位で GSAP / CSS（[AGENTS.md の Animation 節](../../AGENTS.md)）。旧 `ExperienceShell` 集約パターンは廃止
- preview は専用 route で分離
- public route group は domain query 経由でデータ取得し、route から `prisma` を直接 import しない

### キャッシュ

- 基本は `'use cache'` + `cacheLife()` + `cacheTag()`
- permalink 設定に依存する query は `CACHE_TAGS.PERMALINK` を併用
- 更新直後の整合性は `updateTag()`
- admin/private query は cross-request cache を使わず、毎回認可境界を通す

### 管理画面データアクセス

- Server Component read: `@/admin/queries/*`
- Client Component read: `/admin/api/*`
- Mutation: `@/admin/actions/*`

### Self-hosting

- Bun ランタイムは Docker / Cloud Run 上で継続利用
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` は Secret Manager 正本で Cloud Build の build secret と Cloud Run runtime secret の両方に同じ値を渡す
- shared cache 導入前は Cloud Run `max-instances=1` を基準に運用する

## 補足

- TypeScript は 6 系（rc）を使用。`erasableSyntaxOnly` 等の制約は `type-safety.md` を参照
- Prisma は Bun runtime で使用するが、Edge Runtime 対応は前提にしない
- **Three.js / PixiJS** は未使用（削除済み）。再導入しない
- 管理画面は Lexical と Better Auth を中心にした Node/Bun runtime 前提
