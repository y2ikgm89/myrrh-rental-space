# 技術スタック — 実装上の判断

> このドキュメントは採用技術の **「なぜ」** を説明する（Diátaxis: explanation）。
>
> **バージョンの SSoT**: リポジトリルートの [`package.json`](../../package.json)（semver 範囲）と [`bun.lock`](../../bun.lock)（解決済み確定版）。採用機能の列挙は [`AGENTS.md`](../../AGENTS.md#tech-stack)。

## Prisma generated output

- 出力先は `generated/prisma/*`、git 管理しない
- `src/` 配下に置かない
- アプリからは `src/shared/db/*` 経由でのみ参照
- `createAppPrismaClient` (`src/shared/db/create-app-prisma-client.ts`) が `$extends` の単一ソース。`prisma.ts` と `prisma/seed.ts` の両方で適用し、Better Auth には拡張前の `basePrisma` のみ渡す

## Proxy

- `src/proxy.ts` は auth / security 専用
- 公開 permalink 解決や Prisma クエリは持たない
- admin gate token は `ADMIN_LOGIN_TOKEN` を署名鍵にするが、本検証は Route Handler 側で行う
- `/api/admin/login-tokens/authorize` が署名検証 + DB 消費 + `admin-gate` cookie 発行を担う

## 公開レンダリング

- 静的 shell は `src/app/(public)/layout.tsx`（LenisProvider / MobileNav 等の軽量 shell）
- 視覚効果はページ単位で GSAP / CSS。旧 `ExperienceShell` 集約パターンは廃止
- preview は `src/app/(public)/preview/{posts,news,pages}/` 配下で `(public)` root layout を共有（admin auth は `verifyAdminSession()` で明示）
- public route group は domain query 経由でデータ取得し、route から `prisma` を直接 import しない

## キャッシュ

- 基本は `'use cache'` + `cacheLife()` + `cacheTag()`
- permalink 設定に依存する query は `CACHE_TAGS.PERMALINK` を併用
- 更新直後の整合性は `updateTag()`
- admin/private query は cross-request cache を使わず、毎回認可境界を通す
- 実装パターンは [`AGENTS.md`](../../AGENTS.md) の Data, Auth, Security 節と Claude Code 用の `.claude/rules/server-actions/use-cache.md` を参照

## 管理画面データアクセス

- Server Component read: `@/admin/queries/*`
- Client Component read: `/admin/api/*`
- Mutation: `@/admin/actions/*`

## Self-hosting

- Bun ランタイムは Docker / Cloud Run 上で継続利用
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` は Secret Manager 正本で Cloud Build の build secret と Cloud Run runtime secret の両方に同じ値を渡す
- shared cache 導入前は Cloud Run `max-instances=1` を基準に運用する

## TypeScript / ランタイム制約

- Prisma は Bun runtime で使用するが、Edge Runtime 対応は前提にしない
- **Three.js / PixiJS** は未使用（削除済み）。再導入しない
- 管理画面は Lexical と Better Auth を中心にした Node/Bun runtime 前提

## TypeScript バージョン方針

- `tsconfig` の `erasableSyntaxOnly` / `verbatimModuleSyntax` など TS 6 前提の設定は現行の major に追従する。
- メジャー・アップデート時は [TypeScript Release Notes](https://devblogs.microsoft.com/typescript/) と [Next.js の TypeScript 範囲](https://nextjs.org/docs/app/building-your-application/configuring/typescript) を確認 → `bun add -d typescript@...` で更新 → `bun run validate && bun run test:all && bun run build` を通す。
- セマバー範囲内の更新は `bun update` でよい。作業後は `bun run validate` を必ず通す。Codex は `AGENTS.md` + `.agents/skills/project-validation`、Claude Code は `.claude/skills/upgrade-deps` が入口。
