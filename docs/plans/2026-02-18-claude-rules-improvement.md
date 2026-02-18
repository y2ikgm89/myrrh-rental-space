# Claude Rules 改善 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `.claude/rules/` ファイルに `paths:` フロントマターを追加し、詳細実装例を `docs/reference/claude-rules/` に分離することで、常時ロードコンテキストを ~78% 削減する。

**Architecture:** 9ファイルに YAML フロントマターを追加して条件付きロードに変換。`react-patterns.md`（792行）と `bun-patterns.md`（656行）の詳細実装例を既存の `docs/reference/claude-rules/` パターンに従って分離する。

**Tech Stack:** Markdown / YAML フロントマター / Claude Code `paths:` ルール

---

### Task 1: react-api-reference.md 新規作成

**Files:**
- Create: `docs/reference/claude-rules/react-api-reference.md`

**Step 1: ファイルを作成**

以下の内容で `docs/reference/claude-rules/react-api-reference.md` を作成する。
コンテンツは `.claude/rules/react-patterns.md` の以下セクションをコピー:
- § コンパイル問題の診断フロー（lines 219–235）
- § React Compiler 制限事項（lines 237–298）
- § React 19.2 新機能（lines 332–749: useEffectEvent / useOptimistic / useActionState / useFormStatus / Activity / use() / ViewTransition / Fragment refs / Resource Preloading）
- § Server Components / Server Actions パターン（lines 707–749）

ファイル先頭に以下のヘッダーを付ける:

```markdown
# React API 詳細リファレンス

> このファイルは `.claude/rules/react-patterns.md` の詳細セクション。
> コア原則とルールは `.claude/rules/react-patterns.md` を参照。
```

**Step 2: ファイルが正しく作成されたことを確認**

```bash
wc -l docs/reference/claude-rules/react-api-reference.md
```

Expected: 440〜480行

**Step 3: コミット（まだしない — Task 2 と一緒にコミット）**

---

### Task 2: react-patterns.md 削減 + リンク追加

**Files:**
- Modify: `.claude/rules/react-patterns.md`

**Step 1: paths: フロントマターを先頭に追加**

ファイルの先頭（`# React パターンルール` の前）に追加:

```yaml
---
paths:
  - src/**
---

```

**Step 2: § コンパイル問題の診断フロー を削除**

lines 219–235（`### コンパイル問題の診断フロー` から次の `###` の前まで）を削除。

**Step 3: § React Compiler 制限事項 を削除**

lines 237–298（`### React Compiler 制限事項（コンパイルをスキップする条件）` から `### React Hook Form` の前まで）を削除。

**Step 4: § React 19.2 新機能 セクション全体を削除**

`## React 19.2 新機能`（元 line 332）から `## Server Components / Server Actions パターン` の終わり（元 line 749）までを削除。

**Step 5: § 禁止事項 の直前に詳細リファレンスリンクを追加**

`## 禁止事項` の直前に追記:

```markdown
> **詳細リファレンス（React 19.2 新API / Compiler 制限事項）**: `docs/reference/claude-rules/react-api-reference.md`

---

```

**Step 6: § 参考 リンクを Compiler 関連のみに整理**

`## 参考` セクションを以下に置き換え（React 19.2 API リンクは reference ファイルに移動済みのため省略）:

```markdown
## 参考

- [React 19 リリースノート](https://react.dev/blog/2024/12/05/react-19)
- [React Compiler 1.0 リリースノート](https://react.dev/blog/2025/10/07/react-compiler-1)
- [ref as a prop（forwardRef 廃止）](https://react.dev/blog/2024/04/25/react-19#ref-as-a-prop)
- [React Compiler — インストール](https://react.dev/learn/react-compiler/installation)
- [React Compiler — 段階的採用](https://react.dev/learn/react-compiler/incremental-adoption)
- [React Compiler — デバッグ](https://react.dev/learn/react-compiler/debugging)
- ['use no memo' ディレクティブ](https://react.dev/reference/react-compiler/directives/use-no-memo)
- [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks)
- [React Hook Form useWatch](https://react-hook-form.com/docs/usewatch)
```

**Step 7: 行数を確認**

```bash
wc -l .claude/rules/react-patterns.md
```

Expected: 310〜360行

**Step 8: docs/reference/codex-rules/react-patterns.md を同期**

`.claude/rules/react-patterns.md` の最新内容を `docs/reference/codex-rules/react-patterns.md` にコピー（ミラーファイル）。

**Step 9: コミット**

```bash
git add .claude/rules/react-patterns.md docs/reference/claude-rules/react-api-reference.md docs/reference/codex-rules/react-patterns.md
git commit -m "refactor(rules): move React 19.2 API details to reference, add paths: frontmatter"
```

---

### Task 3: bun-test-reference.md 新規作成

**Files:**
- Create: `docs/reference/claude-rules/bun-test-reference.md`

**Step 1: ファイルを作成**

以下のヘッダーで `docs/reference/claude-rules/bun-test-reference.md` を作成する。
コンテンツは `.claude/rules/bun-patterns.md` の以下セクションをコピー:
- § 戻り値の設定（`fn.mockResolvedValueOnce` 等の詳細 API）
- § Prisma モック（`createMockPrismaClient` 詳細実装例）
- § 認証モック（`createMockUser`, `setMockSession` 詳細実装例）
- § Next.js API モック（`mock.module` 全パターン）
- § グローバル API のモック（`fetch`, `console` 詳細）
- § Bun ランタイム固有機能（`Bun.file`, `Bun.write`, `Bun.env`）

```markdown
# Bun Test 詳細リファレンス

> このファイルは `.claude/rules/bun-patterns.md` の詳細セクション。
> コア原則とルールは `.claude/rules/bun-patterns.md` を参照。
```

**Step 2: ファイルが正しく作成されたことを確認**

```bash
wc -l docs/reference/claude-rules/bun-test-reference.md
```

Expected: 250〜320行

**Step 3: コミット（Task 4 と一緒にコミット）**

---

### Task 4: bun-patterns.md 削減 + リンク追加

**Files:**
- Modify: `.claude/rules/bun-patterns.md`

**Step 1: paths: フロントマターを先頭に追加**

```yaml
---
paths:
  - __tests__/**
  - e2e/**
---

```

**Step 2: 以下のセクションを削除**

- § 戻り値の設定（`fn.mockResolvedValueOnce` 詳細リスト）
- § Prisma モック（内部実装詳細の部分のみ — `createMockPrismaClient` の内部コード）
- § 認証モック（内部実装詳細の部分のみ）
- § Next.js API モック（詳細実装）
- § グローバル API のモック
- § Bun ランタイム固有機能

**Step 3: § Server Actions テスト の後に詳細リファレンスリンクを追加**

```markdown
> **詳細リファレンス（Prisma/Auth/Next.js モック詳細・Bun 固有機能）**: `docs/reference/claude-rules/bun-test-reference.md`

---

```

**Step 4: 行数を確認**

```bash
wc -l .claude/rules/bun-patterns.md
```

Expected: 270〜320行

**Step 5: docs/reference/codex-rules/bun-patterns.md を同期**

**Step 6: コミット**

```bash
git add .claude/rules/bun-patterns.md docs/reference/claude-rules/bun-test-reference.md docs/reference/codex-rules/bun-patterns.md
git commit -m "refactor(rules): move Bun mock details to reference, add paths: frontmatter"
```

---

### Task 5: 残り7ファイルに paths: フロントマター追加

**Files:**
- Modify: `.claude/rules/server-actions.md`
- Modify: `.claude/rules/zod-patterns.md`
- Modify: `.claude/rules/nuqs-patterns.md`
- Modify: `.claude/rules/prisma-patterns.md`
- Modify: `.claude/rules/test-quality.md`
- Modify: `.claude/rules/auth-patterns.md`
- Modify: `.claude/rules/tailwind-patterns.md`

**Step 1: server-actions.md 先頭に追加**

```yaml
---
paths:
  - src/app/**
  - src/shared/**
---

```

**Step 2: zod-patterns.md 先頭に追加**

```yaml
---
paths:
  - src/**
---

```

**Step 3: nuqs-patterns.md 先頭に追加**

```yaml
---
paths:
  - src/app/**
---

```

**Step 4: prisma-patterns.md 先頭に追加**

```yaml
---
paths:
  - src/**
---

```

**Step 5: test-quality.md 先頭に追加**

```yaml
---
paths:
  - __tests__/**
  - e2e/**
---

```

**Step 6: auth-patterns.md 先頭に追加**

```yaml
---
paths:
  - src/app/**
  - src/shared/**
---

```

**Step 7: tailwind-patterns.md 先頭に追加**

```yaml
---
paths:
  - src/**
---

```

**Step 8: 全7ファイルのフロントマターを確認**

```bash
head -5 .claude/rules/server-actions.md .claude/rules/zod-patterns.md .claude/rules/nuqs-patterns.md .claude/rules/prisma-patterns.md .claude/rules/test-quality.md .claude/rules/auth-patterns.md .claude/rules/tailwind-patterns.md
```

Expected: 全ファイルに `---` + `paths:` が表示される

**Step 9: docs/reference/codex-rules/ のミラーを一括更新**

変更した7ファイルを `docs/reference/codex-rules/` にコピー:

```bash
cp .claude/rules/server-actions.md docs/reference/codex-rules/server-actions.md
cp .claude/rules/zod-patterns.md docs/reference/codex-rules/zod-patterns.md
cp .claude/rules/nuqs-patterns.md docs/reference/codex-rules/nuqs-patterns.md
cp .claude/rules/prisma-patterns.md docs/reference/codex-rules/prisma-patterns.md
cp .claude/rules/test-quality.md docs/reference/codex-rules/test-quality.md
cp .claude/rules/auth-patterns.md docs/reference/codex-rules/auth-patterns.md
cp .claude/rules/tailwind-patterns.md docs/reference/codex-rules/tailwind-patterns.md
```

**Step 10: コミット**

```bash
git add .claude/rules/server-actions.md .claude/rules/zod-patterns.md .claude/rules/nuqs-patterns.md .claude/rules/prisma-patterns.md .claude/rules/test-quality.md .claude/rules/auth-patterns.md .claude/rules/tailwind-patterns.md docs/reference/codex-rules/
git commit -m "refactor(rules): add paths: frontmatter to 7 conditional rule files"
```

---

### Task 6: 設計ドキュメントのコミット

**Files:**
- Commit: `docs/plans/2026-02-18-claude-rules-improvement-design.md`
- Commit: `docs/plans/2026-02-18-claude-rules-improvement.md`

**Step 1: コミット**

```bash
git add docs/plans/2026-02-18-claude-rules-improvement-design.md docs/plans/2026-02-18-claude-rules-improvement.md
git commit -m "docs: add claude rules improvement design doc and implementation plan"
```

---

## 完了確認

全タスク完了後に以下を確認:

```bash
# 常時ロードファイルの確認（paths: がないファイル = 常時ロード）
grep -L "^paths:" .claude/rules/*.md
```

Expected: `error-handling.md`, `implementation-quality.md`, `server-only-patterns.md`, `type-safety.md` の4ファイルのみ

```bash
# 条件付きロードファイルの確認
grep -l "^paths:" .claude/rules/*.md | wc -l
```

Expected: 9（react-patterns, server-actions, zod-patterns, nuqs-patterns, prisma-patterns, bun-patterns, test-quality, auth-patterns, tailwind-patterns）
