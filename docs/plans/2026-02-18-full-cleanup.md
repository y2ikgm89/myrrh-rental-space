# Full Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 公式最新ベストプラクティスに準拠したクリーンな実装を確立する（破壊的変更許容）

**Architecture:** 依存パッケージ更新（beta/RC → stable含む）、コードパターン監査、全テスト・ビルド検証の順で進める。Lexical 統合・Bun テストパターンは既に完了済みのため対象外。

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Bun, Prisma 7, Lexical 0.40, Tailwind CSS 4, Zod 4, Better Auth 1.4

---

## 事前確認

### Task 0: 現状テスト確認

**Files:**

- Run: `__tests__/`

**Step 1: 全テスト実行**

```bash
cd G:/workspace/work/website/customer/myrrh-rental-space
bun run test 2>&1 | tail -30
```

Expected: 全テストパス。失敗があれば記録して後続タスクで対処。

---

## Phase A: 依存パッケージ調査

### Task 1: TypeScript 6.0 stable 確認

**Step 1: context7 で TypeScript 最新版を調査**

context7 ライブラリ ID: `/microsoft/typescript`
クエリ: "TypeScript 6.0 stable release changelog"

**Step 2: 確認事項**

- TypeScript 6.0 stable がリリースされているか
- beta から stable への移行で変更が必要な API があるか
- `tsconfig.json` の `--stableTypeOrdering` オプションが stable でも有効か

**Step 3: package.json 更新（stable リリース済みの場合）**

Modify: `package.json`

```json
"typescript": "^6.0.0"
```

（beta の場合はそのまま）

```bash
bun install
bun run type-check
```

Expected: 型エラー 0 件

---

### Task 2: isomorphic-dompurify stable 確認

**Step 1: WebSearch で最新版を確認**

検索: "isomorphic-dompurify stable release 2025 2026 npm"

**Step 2: 現状確認**

現在: `isomorphic-dompurify: 3.0.0-rc.2`（リリース候補版）

stable 3.x がリリースされている場合:

Modify: `package.json`

```json
"isomorphic-dompurify": "^3.0.0"
```

**Step 3: 更新後の動作確認**

```bash
bun install
bun run type-check
```

SanitizedHtml.tsx の動作確認:

```bash
grep -n "sanitize" src/shared/components/SanitizedHtml.tsx
```

Expected: named import `import { sanitize } from 'isomorphic-dompurify'` が引き続き動作

---

### Task 3: 全パッケージ最新版調査

**Step 1: 現在の outdated パッケージを確認**

```bash
bun update --dry-run 2>&1 | head -100
```

または

```bash
bun x npm-check-updates 2>&1 | head -100
```

**Step 2: context7 で主要ライブラリの最新版・移行ガイドを確認**

以下を並行確認（context7 + WebSearch）:

| パッケージ                  | 現在             | 調査内容                     |
| --------------------------- | ---------------- | ---------------------------- |
| `zod`                       | 4.3.6            | 最新パッチ版                 |
| `lexical` + `@lexical/*`    | 0.40.0           | 最新版 + Node API 変更       |
| `better-auth`               | 1.4.18           | 最新版 + 破壊的変更          |
| `@prisma/client` + `prisma` | 7.4.0            | 最新版                       |
| `react-hook-form`           | ^7.71.1          | 最新版                       |
| `nuqs`                      | ^2.8.8           | 最新版                       |
| `lucide-react`              | 0.564.0 (pinned) | 最新版（`^` に変更するか）   |
| `eslint`                    | 9.39.2           | ESLint 10 プラグイン対応状況 |

**Step 3: ESLint 10 対応状況の確認（WebSearch）**

```
検索: "eslint-plugin-react eslint 10 support 2026"
検索: "eslint-plugin-import eslint 10 support 2026"
```

ESLint 10 が使用プラグインで対応済みなら更新候補。

---

## Phase B: パッケージ更新実施

### Task 4: Lexical 最新版への更新（変更がある場合）

**Files:**

- Modify: `package.json`
- Potentially modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/**`

**Step 1: Lexical 最新版確認（context7）**

```
context7 Library: /facebook/lexical
Query: "lexical 0.40 to latest migration breaking changes NodeState API"
```

**Step 2: バージョン更新**

```bash
bun update lexical @lexical/react @lexical/rich-text @lexical/list @lexical/link @lexical/table @lexical/code @lexical/headless @lexical/html @lexical/selection @lexical/utils
```

**Step 3: 型チェック・ビルド確認**

```bash
bun run type-check
```

NodeState API (`$config`, `createState`, `$getState`, `$setState`) の変更がある場合はノードファイルを更新。

破壊的変更パターン確認:

```bash
grep -rn "createState\|getState\|setState\|config(" src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/nodes/ --include="*.tsx" | head -20
```

---

### Task 5: その他パッケージ更新

**Step 1: 安全な更新（パッチ・マイナー）**

Task 3 で特定したアップデート対象を更新:

```bash
bun update
```

**Step 2: メジャーアップデート（破壊的変更あり）**

メジャーバージョンアップが必要なものは個別に対応:

```bash
# 例: ESLint 10 が対応完了した場合
bun add -d eslint@^10
bun run lint
```

**Step 3: 型チェック確認**

```bash
bun run type-check
```

エラーがあれば型修正:

- `as` アサーション禁止 → 型ガード使用
- API 変更 → 新 API に移行

---

## Phase C: コードパターン監査

### Task 6: 残存型アサーション確認

**Step 1: 型アサーション `as` の検索（許可された例外を除く）**

```bash
grep -rn " as " src/ --include="*.ts" --include="*.tsx" \
  | grep -v "// as " \
  | grep -v "as const" \
  | grep -v "as unknown as" \
  | grep -v "node_modules" \
  | grep -v "satisfies" \
  | head -50
```

**Step 2: 許可パターンを除外した真の違反を特定**

許可されたパターン（`type-safety.md` 参照）:

- `event.target as HTMLElement`（DOM イベント）
- `as Prisma.InputJsonObject`（Prisma JSON 型制約）
- `as SectionConfig`（union widening、コメント必須）
- `as unknown as ActionSuccess<T>`（TS 6.0 ジェネリック条件型）

これら以外の `as` は違反。`enums.ts` 型ガード・`satisfies`・Zod に置換。

---

### Task 7: マジックストリング・後方互換ハック確認

**Step 1: 文字列リテラルの Prisma enum 使用確認**

```bash
grep -rn '"none"\|"polling"\|"standard"\|"percentage"\|"fixed"' src/ --include="*.ts" --include="*.tsx" | grep -v ".test.ts" | head -20
```

**Step 2: 後方互換ハック確認**

```bash
grep -rn "_old\|_legacy\|// removed\|// deprecated\|// TODO: remove" src/ --include="*.ts" --include="*.tsx" | head -20
```

**Step 3: 不要な再エクスポート確認**

```bash
grep -rn "export type.*= " src/ --include="*.ts" --include="*.tsx" | grep -v "generated" | grep -v "node_modules" | head -20
```

---

### Task 8: デッドコード確認

**Step 1: 未使用インポート確認（lint がキャッチするはず）**

```bash
bun run lint 2>&1 | grep "no-unused"
```

**Step 2: 到達不能コードの確認**

lint が通っていれば基本的に問題なし。型エラーがあれば：

```bash
bun run type-check 2>&1 | grep "unreachable\|never type"
```

---

## Phase D: 最終検証

### Task 9: 全テスト実行

**Step 1: テスト実行**

```bash
bun run test 2>&1 | tail -30
```

Expected: 全テストパス（前回と同じ件数）

**Step 2: 失敗があれば修正**

パッケージ更新による API 変更でテストが壊れた場合は該当テストを修正。
Bun ネイティブパターン（`mock`, `mockReset`）は既に正しい形式なので変更不要。

---

### Task 10: validate + build

**Step 1: validate**

```bash
bun run validate 2>&1
```

Expected: type-check PASS, lint PASS

**Step 2: build**

```bash
bun run build 2>&1 | tail -30
```

Expected: ビルド成功

---

## Phase E: コミット

### Task 11: 変更をコミット

**Step 1: 変更内容を確認**

```bash
git status
git diff --stat
```

**Step 2: ステージング**

```bash
# 新規ファイル
git add src/app/(admin)/admin/(dashboard)/_shared/actions/block-template.ts
git add src/app/(admin)/admin/(dashboard)/_shared/components/SanitizedHtml.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/cta-button-editor/
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/dialogs/
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/internal-plugins/
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/CollapsibleItemNode.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TableOfContentsNode.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/parts/
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/AutoSavePlugin.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/BlockTemplatePlugin.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/CodeBlockPlugin.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FindReplacePlugin.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ImageDropPlugin.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/KeyboardShortcutsPlugin.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/MarkdownExportPlugin.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/TableOfContentsPlugin.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/WordCountPlugin.tsx
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/preview/
git add src/app/(admin)/admin/(dashboard)/_shared/lib/lazy-renderer.ts
git add src/app/(admin)/admin/(dashboard)/_shared/hooks/use-filter-params.ts
git add src/app/(admin)/admin/(dashboard)/_shared/hooks/use-kana-input.ts
git add "src/app/(public)/_shared/actions/news.ts"
git add "src/app/(public)/_shared/actions/post.ts"
git add "src/app/(public)/_shared/components/ArticleDetailHero.tsx"
git add "src/app/(public)/_shared/components/Pagination.tsx"
git add "src/app/(public)/_shared/lib/header-settings.ts"
git add "src/app/(public)/_shared/lib/search-params.ts"
git add "src/app/(public)/about/"
git add "src/app/(public)/faq/"
git add "src/app/(public)/news/"
git add "src/app/(public)/posts/"
git add "src/app/(public)/privacy/"
git add "src/app/(public)/spaces/"
git add "src/app/(public)/terms/"
git add src/instrumentation.ts
git add src/shared/lib/bootstrap.ts
git add src/shared/lib/validations/lexical.ts
git add src/shared/lib/validations/params.ts
git add src/shared/styles/
git add src/shared/types/css.d.ts
git add prisma/migrations/20260212145705_lexical_json_primary/
git add .claude/rules/deployment-patterns.md
git add .claude/rules/turbopack-hmr.md
git add .env.example
git add .gcloudignore
git add docs/plans/2026-02-18-full-cleanup-design.md
git add docs/plans/2026-02-18-full-cleanup.md

# 変更ファイル（既存）
git add -u
```

**Step 3: コミット**

```bash
git commit -m "$(cat <<'EOF'
feat: integrate full Lexical editor expansion and public routes

- Add 10 inspector panels (Collapsible, Embed, Instagram, Layout, PageBreak, PullQuote, Steps, Tabs, X, YouTube)
- Add 8 plugins (AutoSave, BlockTemplate, CodeBlock, FindReplace, ImageDrop, KeyboardShortcuts, MarkdownExport, WordCount)
- Add 2 nodes (CollapsibleItemNode, TableOfContentsNode)
- Add public routes: /posts, /news, /about, /faq, /spaces, /terms, /privacy
- Add ArticleDetailHero, Pagination shared components
- Add block-template Server Actions with withPermission
- Add lazy-renderer for Lexical headless HTML generation
- Add instrumentation.ts + bootstrap.ts for system page guarantee
- Add Lexical JSON primary migration (7 models)
- Update deps: TypeScript stable, isomorphic-dompurify stable

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**Step 4: 確認**

```bash
git status
git log --oneline -3
```

Expected: クリーンな作業ツリー

---

## 参照

- `.claude/rules/type-safety.md` — 型アサーション許可パターン
- `.claude/rules/prisma-patterns.md` — Prisma enum / 型ガード
- `.claude/rules/lexical-patterns.md` — Lexical NodeState API
- `docs/plans/2026-02-18-full-cleanup-design.md` — 設計ドキュメント
