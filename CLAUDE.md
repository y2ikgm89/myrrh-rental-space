# CLAUDE.md

> Myrrh Rental Space - レンタルスペース予約管理システム

## 🔴 必須（違反禁止）

### 禁止

- **型アサーション（`as`）禁止** → `.claude/rules/type-safety.md`
- **後方互換性ハック禁止** → 不要コード完全削除
- **検証なしの完了報告禁止** → 必ず検証コマンド実行
- **曖昧な要件の推測実装禁止** → `AskUserQuestion`で確認
- **ハードコードカラー禁止** → `gray-*`等禁止、テーマ変数使用 → `.claude/rules/tailwind-patterns.md`

### 検証（完了報告前に必須）

| タイミング | コマンド |
|-----------|---------|
| 作業中 | `bun run type-check` |
| 完了報告前 | `bun run validate` |
| コミット/PR前 | `bun run validate && bun run build` |

### 詳細ルール

#### 常時ロード（全作業共通）

- `.claude/rules/type-safety.md` - 型安全ルール
- `.claude/rules/implementation-quality.md` - 実装品質ルール
- `.claude/rules/test-quality.md` - テスト品質ルール
- `.claude/rules/react-patterns.md` - React 19.2 / React Compiler
- `.claude/rules/server-actions.md` - Next.js 16 Server Actions / キャッシュ
- `.claude/rules/auth-patterns.md` - Better Auth 1.4 / RBAC
- `.claude/rules/prisma-patterns.md` - Prisma 7 / JSON型安全
- `.claude/rules/zod-patterns.md` - Zod 4 バリデーション
- `.claude/rules/nuqs-patterns.md` - nuqs URL状態管理
- `.claude/rules/tailwind-patterns.md` - Tailwind CSS 4 / CSS-first設定

#### 条件付きロード（対象ファイル作業時のみ）

| ルール | 対象パス |
|--------|---------|
| `anti-ai-design.md` - Anti-AI デザイン強制 | `src/app/(public*)/**` |
| `project-design-config.md` - プロジェクト固有デザイン値 | `src/app/(public*)/**` |
| `design-system-memory.md` - デザイン記憶プロトコル | `src/app/(public*)/**` |
| `gsap-patterns.md` - GSAP / ScrollTrigger / Lenis | `src/app/(public*)/**` |
| `visual-effects-patterns.md` - エフェクトアーキテクチャ | `src/app/(public*)/**` |
| `threejs-patterns.md` - Three.js / R3F | `src/app/(public*)/**` |
| `pixijs-patterns.md` - PixiJS v8 | `src/app/(public*)/**` |
| `lexical-patterns.md` - Lexical 0.40 エディタ | `src/app/(admin)/**/lexical/**` |
| `seo-patterns.md` - SEO / 構造化データ / NAP | `src/app/(public*)/**/seo/**`, `**/layouts/**` |
| `ui-ux-patterns.md` - UI/UX スキル使用ガイドライン | `src/app/(public*\|admin)/**` |

> 詳細リファレンス: `docs/reference/claude-rules/` に配置（必要時に参照）

---

## 🟡 ワークフロー

**superpowersが自動発動** — 特別な操作不要

> **セッション継続時**: `docs/plans/README.md` を確認して進行中タスクを把握

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
                  ↑ 全工程でsuperpowersが自動介入
```

### 自動発動スキル（主要）

| スキル | 発動タイミング |
|--------|----------------|
| `brainstorming` | 機能追加・設計時 |
| `frontend-design` | フロントエンドUI実装時 |
| `test-driven-development` | 実装時 |
| `verification-before-completion` | 完了報告前（**常に必須**） |
| `finishing-a-development-branch` | ブランチ完了時 |

> 他: `writing-plans`, `executing-plans`, `systematic-debugging`, `requesting-code-review`, `receiving-code-review` も自動発動

### ツール使い分け

- **コードベース調査**: `serena`（LSPベース深い分析）, `code-explorer`（広範な探索）
- **MCP**: `serena`, `context7`, `playwright` 推奨。`WebSearch`, `WebFetch` 必要時
- **ui-ux-pro-max**: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> --stack nextjs`
  - ドメイン: `product`, `style`, `typography`, `color`, `landing`, `chart`, `ux`
- **ドキュメント更新**: `docs/plans/NNN-title.md` → `docs/plans/README.md` → `docs/requirements/`（必要時） → `docs/architecture/`（設計変更時）

### 手動コマンド（必要時のみ）

`/superpowers:brainstorm`, `/superpowers:write-plan`, `/superpowers:execute-plan`, `/superpowers:using-git-worktrees`, `/ui-ux-pro-max`, `/frontend-design`, `/parallax-section`, `code-explorer`, `code-simplifier`

---

## 🟢 プロジェクト情報

### 技術スタック

| 技術 | バージョン | 備考 |
|------|-----------|------|
| Next.js | 16.1.6 | `'use cache'`, `updateTag`, PPR対応 |
| React | 19.2.4 | React Compiler 1.0, `<Activity>`, `useEffectEvent` |
| TypeScript | 5.9.3 | TS 7.0 (Go native) プレビュー利用可 |
| Bun | 1.3.x | Bun.SQL, HTML直接実行 |
| Prisma | 7.3.0 | 型生成98%削減, mapped enums |
| PostgreSQL | - | Supabase経由 |
| Better Auth | 1.4.18 | RBAC, Auth.js統合 |
| Tailwind CSS | 4.1.18 | CSS-first設定, @theme |
| Zod | 4.3.6 | `{ error: }` パラメータ, z.fromJSONSchema() |
| nuqs | 2.8.8 | createSearchParamsCache, Zod 4統合 |
| Lexical | 0.40.0 | React 19対応, Node transforms, mergeRegister本体移動 |
| GSAP | 3.14.2 | ScrollTrigger, @gsap/react 2.1 |
| Three.js | 0.182.0 | @react-three/fiber 9.5, @react-three/drei 10.7 |
| PixiJS | 8.16.0 | 2D WebGLレンダラー |
| Lenis | 1.3.17 | スムーススクロール |

### 構造

**Multiple Root Layouts アーキテクチャ（Next.js 16 推奨パターン）**

```
src/
├── app/
│   ├── (admin)/                          # 管理画面ルートグループ
│   │   ├── layout.tsx                    # Admin Root Layout (html/body)
│   │   ├── _styles/admin.css             # 管理画面専用テーマ（固定）
│   │   └── admin/(dashboard)/_shared/    # 管理画面共有コンポーネント
│   │
│   └── (public)/                         # 公開ページルートグループ
│       ├── layout.tsx                    # Public Root Layout (html/body)
│       ├── _styles/public.css            # 公開ページテーマ（AI生成対象）
│       ├── [slug]/page.tsx               # セクションベースページ（統一ルート）
│       └── _shared/                      # 公開ページ共有コンポーネント
│
└── shared/                               # 両方で共有（CSS変数非依存）
```

| パス | 用途 |
|------|------|
| `src/app/(admin)/_styles/admin.css` | 管理画面専用テーマ |
| `src/app/(public)/_styles/public.css` | 公開ページテーマ |
| `src/app/(admin)/admin/(dashboard)/_shared/` | 管理画面専用コンポーネント |
| `src/app/(public)/_shared/` | 公開ページ専用コンポーネント |
| `src/app/(public)/[slug]/` | 統一ページルート（セクションシステム） |
| `src/app/(public-*)/` | 追加の公開ページルートグループ |
| `src/shared/` | 共有（CSS変数に依存しないコード） |
| `docs/{requirements,architecture,plans}/` | ドキュメント |

**公開ページURL構造**:
- `/` - ホームページ
- `/faq`, `/about`, `/contact`, `/spaces`, `/reservation`, `/privacy`, `/terms` - 専用ページ
- `/news`, `/news/[slug]` - ニュース
- `/posts`, `/posts/[slug]` - ブログ
- `/spaces/[slug]` - スペース詳細
- `/[slug]` - カスタムページ（DBで管理）

**注意**: 公開ページ ↔ 管理画面の遷移はフルページリロード（異なるRoot Layout間の仕様）

### エイリアス

`@/admin/*`, `@/public/*`, `@/shared/*`

### コマンド

```bash
bun dev                    # 開発サーバー
bun run test               # テスト
bun run test:all           # Unit + Integration 並列テスト
bun run validate           # type-check + lint 並列検証
bun run validate && bun run build  # 完全検証
bunx --bun prisma migrate dev --name <name>  # マイグレーション
bun run db:generate        # Prismaスキーマ再生成
```

### コーディング規約

- Server Components優先、Server Actions
- Zodバリデーション必須
- 命名: コンポーネント`PascalCase.tsx`、その他`kebab-case.ts`
- コミット: `<type>(<scope>): <subject>`
