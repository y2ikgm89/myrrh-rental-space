# AGENTS.md

> This document follows the [AGENTS.md format](https://agents.md/) and is optimized for GPT-5.3 Codex.
>
> **Communication Language**: ユーザー向けの応答は必ず日本語で行うこと。

## Project overview

レンタルスペースの予約・運営管理システム。公開サイトと管理画面を Next.js 16 の Multiple Root Layouts で分離した構成。

- 公開系: `src/app/(public)/...`（デザイン重視、スクロール演出あり）
- 管理系: `src/app/(admin)/admin/(dashboard)/...`（実務向け UI、Lexical エディタ）
- 共通: `src/shared/...`（CSS 依存を持たない共通ロジック）

### Tech stack

下記バージョンは `package.json` / `bun.lock` で現在解決されている実ランタイムに合わせる。

| 技術         | バージョン         | 備考                                                 |
| ------------ | ------------------ | ---------------------------------------------------- |
| Next.js      | 16.1.6             | `'use cache'`, `updateTag`, PPR対応                  |
| React        | 19.2.4             | React Compiler 1.0, `<Activity>`, `useEffectEvent`   |
| TypeScript   | 6.0.1-rc           | `package.json` の解決版に合わせる（`erasableSyntaxOnly` 等） |
| Bun          | 1.3.10             | Bun.SQL, HTML直接実行（`packageManager` 準拠）       |
| Prisma       | 7.5.0              | 型生成98%削減, mapped enums                         |
| PostgreSQL   | -                  | Supabase経由                                         |
| Better Auth  | 1.5.5              | RBAC, Auth.js統合                                    |
| Tailwind CSS | 4.2.1              | CSS-first設定, @theme                                |
| Zod          | 4.3.6              | `{ error: }` パラメータ, z.fromJSONSchema()          |
| nuqs         | 2.8.9              | createSearchParamsCache, Zod 4統合                   |
| Lexical      | 0.41.0             | React 19対応, Node transforms, mergeRegister本体移動 |
| GSAP         | 3.14.2             | ScrollTrigger, @gsap/react 2.1                       |
| Three.js     | 0.183.2            | @react-three/fiber 9.5, @react-three/drei 10.7       |
| PixiJS       | 8.17.1             | 2D WebGLレンダラー                                   |
| Lenis        | 1.3.18             | スムーススクロール                                   |

### Project structure

```
src/
├── app/
│   ├── (admin)/                          # 管理画面ルートグループ
│   │   ├── layout.tsx                    # Admin Root Layout (html/body)
│   │   ├── _styles/admin.css             # 管理画面専用テーマ（固定）
│   │   └── admin/(dashboard)/_shared/    # 管理画面共有コンポーネント
│   │
│   └── (public)/                         # 公開ページルートグループ
│       ├── layout.tsx                    # Public Root Layout (html/body, 軽量 shell)
│       ├── page.tsx                      # ホームページ
│       ├── [...segments]/page.tsx        # カスタムページ / ルート直下 slug fallback
│       ├── posts/[...segments]/page.tsx  # 投稿 permalink 解決
│       ├── _styles/public.css            # 公開ページテーマ（AI生成対象）
│       └── _shared/                      # 公開ページ共有コンポーネント
│
└── shared/                               # 両方で共有（CSS変数非依存）
```

**公開ページURL構造**:

- `/` - ホームページ
- `/faq`, `/about`, `/contact`, `/spaces`, `/reservation`, `/privacy`, `/terms` - 専用ページ
- `/news`, `/news/[slug]`, `/news/preview/[slug]` - ニュース
- `/posts`, `/posts/[...segments]`, `/posts/preview/[slug]` - ブログ
- `/spaces/[slug]` - スペース詳細
- `/terms/[slug]` - 規約詳細
- `/[...segments]` - カスタムページ（DB管理）と、投稿 prefix 無効時のルート直下 fallback

Path aliases: `@/admin/*`, `@/public/*`, `@/shared/*`

補足:

- 公開ページの preview は `posts/preview/[slug]`, `news/preview/[slug]` の専用 route で扱う
- 公開 route から `@/shared/db/prisma` を直接 import しない。取得ロジックは `src/shared/domain/*` を正本にする

## Setup commands

```bash
# 依存関係
bun install

# 環境変数ファイル作成 (PowerShell)
Copy-Item .env.example .env.local
# 環境変数ファイル作成 (bash/zsh)
cp .env.example .env.local

# DB 起動 (Docker)
docker compose up -d db
docker compose ps

# マイグレーション / Prisma Client
bunx --bun prisma migrate dev
bun run db:generate

# 開発サーバー
bun run dev

# 検証
bun run type-check
bun run lint
bun run validate
bun run test
bun run test:all
bun run build
```

- `bun run build` は `SKIP_ENV_VALIDATION=true` で実行される（開発・既定 CI 向け）。本番デプロイ前に `.env` の充足確認をしたい場合は `bun run build:strict` を使う。

## Testing instructions

```bash
# 全テスト
bun run test

# 単体/統合のみ
bun run test:unit
bun run test:integration

# 個別ファイル
bun run test __tests__/unit/lib/foo.test.ts

# 監視 / カバレッジ
bun run test:watch
bun run test:coverage

# E2E
bun run e2e
```

- 作業完了前の最低ライン: `bun run validate`
- PR 作成前の必須ライン: `bun run validate && bun run build`（本番相当の env 検証が必要なら `build:strict` を追加）
- 仕様変更・不具合修正では、該当テストの追加/更新をセットで実施すること

## Additional instructions

### Implementation philosophy

- 公式ドキュメント準拠を最優先し、依存関係は安定版を前提に実装する
- 後方互換ハックは追加しない。不要な旧コードは削除する
- 「とりあえず通す」実装を禁止し、型安全・検証可能性を優先する

### Required coding rules

- Server Components をデフォルトとし、必要時のみ Client Components (`'use client'`) を使う
- 入出力は Zod で検証する（client/server 両方）。エラーメッセージは `{ error: 'msg' }` 形式（Zod 4）
- 型アサーション (`as`) は禁止。型ガード・`satisfies`・Zod の `safeParse` を使う
- `noUncheckedIndexedAccess` 有効: 配列/Recordアクセスは `T | undefined` を返す。ガード句必須
- React Compiler 前提: 手動 `useMemo`/`useCallback` は外部ライブラリ要件がある場合のみ
- React Hook Form は `watch()` ではなく `useWatch()` を使う
- `forwardRef` 禁止（React 19 では ref は通常の prop として渡す）
- Tailwind CSS 4: `@theme` とセマンティックトークンを使用し、`gray-*`/`blue-*` 等のハードコード色を避ける
- Bun Test を使用。Jest API はほぼ互換だが `bun:test` から import する
- エラーは握りつぶさない: `safeFetch` パターンを使い、`logger` でログを残す
- 命名規則: コンポーネントは `PascalCase.tsx`、ユーティリティ/バリデーションは `kebab-case.ts`
- インポートはエイリアス優先: `@/admin/*`, `@/public/*`, `@/shared/*`

### Rule files reference

全作業共通で適用するルール:

| ルール                      | 内容                                              |
| --------------------------- | ------------------------------------------------- |
| `type-safety.md`            | 型安全ルール、`as` 禁止、noUncheckedIndexedAccess |
| `implementation-quality.md` | 実装品質ルール、デッドコード禁止                  |
| `test-quality.md`           | Bun Test / Playwright E2E パターン                |
| `bun-patterns.md`           | Bun Test / モック / ランタイム固有パターン        |
| `error-handling.md`         | エラーハンドリング / safeFetch / logger           |
| `react-patterns.md`         | React 19.2 / React Compiler                       |
| `server-actions.md`         | Next.js 16 Server Actions / キャッシュ            |
| `auth-patterns.md`          | Better Auth 1.5 / RBAC                            |
| `prisma-patterns.md`        | Prisma 7 / JSON型安全                             |
| `zod-patterns.md`           | Zod 4 バリデーション                              |
| `nuqs-patterns.md`          | nuqs URL状態管理                                  |
| `tailwind-patterns.md`      | Tailwind CSS 4 / CSS-first設定                    |
| `turbopack-hmr.md`          | Turbopack HMR エラー対処（開発時）                |

条件付きルール（対象パスのみ）:

| ルール                       | 対象パス                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `anti-ai-design.md`          | `src/app/(public*)/**`                                                                  |
| `project-design-config.md`   | `src/app/(public*)/**`                                                                  |
| `design-system-memory.md`    | `src/app/(public*)/**`                                                                  |
| `gsap-patterns.md`           | `src/app/(public*)/**`                                                                  |
| `visual-effects-patterns.md` | `src/app/(public*)/**`                                                                  |
| `threejs-patterns.md`        | `src/app/(public*)/**`                                                                  |
| `pixijs-patterns.md`         | `src/app/(public*)/**`                                                                  |
| `accessibility.md`           | `src/app/(public*)/**`, `src/app/(admin)/**`                                            |
| `lexical-patterns.md`        | `src/app/(admin)/**/lexical/**`                                                         |
| `seo-patterns.md`            | `src/app/(public*)/**/seo/**`, `**/layouts/**`                                          |
| `ui-ux-patterns.md`          | `src/app/(public*\|admin)/**`                                                           |
| `deployment-patterns.md`     | `Dockerfile`, `cloudbuild.yaml`, `.dockerignore`, `.gcloudignore`, `docs/operations/**` |

詳細ルールは `docs/reference/codex-rules/` に配置。

### Architecture boundaries

- ルートレイアウト間（Public ↔ Admin）遷移はフルリロード前提
- UI/CSS の責務を跨いだ共通化はしない（共通化は `src/shared` のみ）
- 管理画面専用実装は `@/admin/*` に閉じる
- 公開画面専用実装は `@/public/*` に閉じる
- `src/app/*` から DB client / generated Prisma model を直接参照しない
- 業務ロジックと read model は `src/shared/domain/*`、Prisma 境界は `src/shared/db/*` に閉じ込める
- Prisma 生成物は `generated/prisma/*` に出力し、git 管理しない。必要な生成は `db:generate` と各検証スクリプト側で行う
- 公開側の新規データ取得は `src/shared/domain/*` または `src/app/(public)/_shared/data/*` を使い、`_shared/actions` に新しい DB query を増やさない
- 管理画面の read は Server Component から `@/admin/queries/*`、client から必要時のみ `/admin/api/*` を使う
- `@/admin/actions/*` は mutation 専用とし、read 用 entrypoint を再導入しない
- `proxy.ts` は coarse gate として扱い、認可の正本は admin query / Route Handler 側に置く

### Data, auth, and security constraints

- Prisma は Edge Runtime 非対応。API Routes / Server Actions は Node.js/Bun ランタイムで実装
- Better Auth の Prisma adapter は `src/shared/db/better-auth-adapter.ts` に隔離し、app/lib 層から直接組み立てない
- Better Auth は `src/shared/lib/auth.ts` の静的 `auth` export を正本にし、Google OAuth provider 設定は env / Secret Manager で管理する
- auth のために DB 管理の provider 設定や `getAuth()` / `resetAuthInstance()` のような動的 bootstrap を再導入しない
- 権限制御が必要な管理系 Server Action では `checkPermission()` / `checkAdminAuth()` を必須化
- 管理画面の private query / Route Handler は fail-closed を前提に `verifyAdminSession` と権限確認を入口で行う
- 監査対象操作は `logAction()` を必ず残す
- 秘密情報は `.env.local`（開発）と Secret Manager（本番）で管理し、ハードコードしない
- JSON/JSON-LD は必ずサニタイズ・バリデーションする

### Caching rules

- データ取得は `'use cache'` + `cacheTag()` を基本とする
- 更新直後の整合性が必要な操作は `updateTag()` を使う（read-your-own-writes）
- 遅延再検証でよい場合は `revalidateTag()` を使う
- キャッシュタグ文字列は直書きせず、`@/shared/lib/constants/cache.ts` の `CACHE_TAGS` を使用

### Animation and visual effects

- Reduced Motion 対応は `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` を使う
- 視覚効果は段階的フォールバックを維持する: L1 CSS → L2 GSAP → L3 Three.js → L4 PixiJS
- GPU 性能差を考慮し、常に下位レベルへの退避経路を用意する
- `src/app/(public)/layout.tsx` は軽量 shell を保ち、Lenis / Scroll orchestration / VisualEffectsProvider / PerformanceMonitor は `ExperienceShell` で opt-in する
- `src/app/(public)/layout.tsx` に `NuqsAdapter` を置かず、URL state provider は必要な subtree だけで opt-in する

### Delivery checklist for agents

変更を返す前に以下を確認すること。

1. 要件に対して不要な後方互換コード・デッドコードを残していない
2. 追加/変更した入出力が Zod で検証されている
3. 影響範囲に応じてテストを更新し、最低 `bun run validate` を通している
4. アーキテクチャ変更を伴う場合は `docs/architecture/` と `docs/requirements/` を更新している

### Instruction file operation

- サブディレクトリ固有ルールが必要な場合は、対象ディレクトリ直下に `AGENTS.override.md` を置く
- `AGENTS.override.md` があるディレクトリでは、同階層の `AGENTS.md` より override を優先する前提で運用する
- 指示が競合する場合は、ユーザーの直接指示を最優先とする

### Codex instruction topology

- Codex の一次情報はリポジトリルートの `AGENTS.md` とし、全体方針・不変条件・禁止事項だけを書く
- ディレクトリ固有の制約は `AGENTS.override.md` に閉じ込め、ルート `AGENTS.md` へ逆流させない
- `docs/reference/codex-rules/*.md` は詳細リファレンスとして扱い、`AGENTS.md` には要約だけを置く
- `docs/architecture/*` と `docs/reference/codex-rules/*` を現行の正本とし、`docs/plans/*` は履歴資料として扱う
- `.agents/skills/<skill-name>/SKILL.md` は繰り返し実行する手順だけを書く。ポリシーや世界観は `AGENTS.md` / `codex-rules` 側に寄せる
- Claude 用の `.claude/*` は維持してよいが、Codex では正本として扱わない。Codex 向け説明から `.claude/*` を参照しない
- 暗黙の memory API やツール固有状態に依存せず、永続化が必要な判断は `docs/reference/` や `docs/architecture/` に明示的に残す
- 追加基準の詳細は `docs/reference/codex-rules/instruction-topology.md` を参照する

### Codex skill operation

- Codex 用スキルはリポジトリ直下の `.agents/skills/<skill-name>/SKILL.md` に配置する
- `SKILL.md` の frontmatter は `name` と `description` のみを使用する
- ルールの一次情報は `AGENTS.md` / `AGENTS.override.md` とし、詳細資料は `docs/reference/` に置く
- `.claude/rules` と `.claude/skills` は Codex の参照対象にしない（後方互換レイヤーは作らない）
- 1 skill = 1 workflow を原則とし、複数の unrelated task をまとめた巨大スキルは作らない
- `description` には「いつ使うか」「何をしないか」が分かる境界を書く
- skill には入力、手順、使用コマンド、完了条件だけを書く。一般論や重複ルールは `codex-rules` へ寄せる
- `SKILL.md` 本体は短く保ち、詳細なバリアントや API メモは `reference/` か `docs/reference/` に逃がす
- スクリプトやテンプレートを使う skill は、まず skill ディレクトリ直下の `scripts/` / `reference/` / `assets/` を再利用する
- リポジトリ前提で既に満たしている環境構築手順や、Codex で使えない API / `.claude/*` 参照は書かない
- 追加 workflow と監査 / modernize workflow は同じ skill に混ぜず、必要なら別 skill に分ける
- 追加・改修方針の詳細は `.agents/skills/README.md` を参照する

### Codex delegation stance

- このリポジトリでは、Codex 向けの責務分離は `AGENTS.md` / `AGENTS.override.md` / `.agents/skills` で表現する
- Claude Code 用 sub-agent は `.claude/agents/` に維持してよいが、Codex 用に疑似 sub-agent を増やさない
- Codex 側で別責務が必要になった場合も、まずは skill 化または `AGENTS.override.md` 化を優先する

### Claude Code sub-agents (`.claude/agents/`)

Claude Code 専用サブエージェント（Codex からは参照しない）:

| エージェント        | モデル  | 役割                                                         |
| ------------------- | ------- | ------------------------------------------------------------ |
| `project-reviewer`  | inherit | コードレビュー専門。20ルール準拠チェック。書き込みツール禁止 |
| `design-memory`     | sonnet  | デザイン決定の記憶・参照。公開ページUIに特化                 |
| `codebase-explorer` | haiku   | 高速コードベース探索。ファイル位置・シンボル追跡             |
| `verification`      | haiku   | ビルド/型チェック/lint検証。破壊的コマンドブロック済み       |

## Additional documentation

- `docs/architecture/` : アーキテクチャ、DB 設計、キャッシュ戦略
- `docs/requirements/` : 機能要件
- `docs/plans/` : 実装計画
- `docs/reference/` : 詳細ルール
- `docs/reference/codex-rules/instruction-topology.md` : Codex 向け instruction / skill / override の責務整理
- `.agents/skills/README.md` : Codex スキルの索引と作成基準
