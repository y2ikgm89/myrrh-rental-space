# `.claude/rules/` 公式準拠リファクタリング Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Claude Code 公式ドキュメントの `.claude/rules/` ベストプラクティスに完全準拠し、条件付きルールを `paths:` フロントマターで制御・サブディレクトリで整理する。

**Architecture:**

- 公式仕様: `.claude/rules/*.md` は全て自動ロード。条件付きロードは `paths:` YAML フロントマターで制御。
- 実装方針: 12 個の条件付きルールに `paths:` 追加 → `frontend/` / `ops/` サブディレクトリへ移動 → CLAUDE.md 簡略化。
- 副作用なし: `bun run validate` でコンパイル・lint エラーなし（`.claude/rules/` は TS に影響しない）。

**Tech Stack:** Claude Code `.claude/rules/` YAML frontmatter、glob patterns、git mv

---

## 背景: 公式仕様

公式ドキュメント (https://code.claude.com/docs/en/memory#modular-rules-with-claude/rules/) より:

- **全 `.md` ファイルが自動ロード** — `.claude/rules/` 内はサブディレクトリ含め再帰的に発見
- **`paths:` フロントマター** — 条件付きロードの公式機構。指定パターンのファイル作業時のみ適用
- **サブディレクトリ整理** — `frontend/`、`backend/` 等のサブディレクトリ推奨
- CLAUDE.md の明示的列挙は不要（自動検出のため）

---

## 最終ディレクトリ構造

```
.claude/rules/
├── type-safety.md              # 常時ロード（paths なし）
├── implementation-quality.md   # 常時ロード
├── test-quality.md             # 常時ロード
├── bun-patterns.md             # 常時ロード
├── error-handling.md           # 常時ロード
├── react-patterns.md           # 常時ロード
├── server-actions.md           # 常時ロード
├── auth-patterns.md            # 常時ロード
├── prisma-patterns.md          # 常時ロード
├── zod-patterns.md             # 常時ロード
├── nuqs-patterns.md            # 常時ロード
├── tailwind-patterns.md        # 常時ロード
├── frontend/                   # paths: フロントマター付き（条件付きロード）
│   ├── anti-ai-design.md       # src/app/(public)/**
│   ├── project-design-config.md
│   ├── design-system-memory.md
│   ├── gsap-patterns.md
│   ├── visual-effects-patterns.md
│   ├── threejs-patterns.md
│   ├── pixijs-patterns.md
│   ├── accessibility.md        # public + admin
│   ├── ui-ux-patterns.md       # public + admin
│   ├── seo-patterns.md
│   └── lexical-patterns.md     # src/app/(admin)/**/lexical/**
└── ops/                        # paths: フロントマター付き（条件付きロード）
    └── deployment-patterns.md  # Dockerfile, cloudbuild.yaml 等
```

---

## paths: フロントマター定義一覧

| ファイル                              | paths: パターン                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `frontend/anti-ai-design.md`          | `src/app/(public)/**`, `src/app/(public-*)/**`                                          |
| `frontend/project-design-config.md`   | `src/app/(public)/**`, `src/app/(public-*)/**`                                          |
| `frontend/design-system-memory.md`    | `src/app/(public)/**`, `src/app/(public-*)/**`                                          |
| `frontend/gsap-patterns.md`           | `src/app/(public)/**`, `src/app/(public-*)/**`                                          |
| `frontend/visual-effects-patterns.md` | `src/app/(public)/**`, `src/app/(public-*)/**`                                          |
| `frontend/threejs-patterns.md`        | `src/app/(public)/**`, `src/app/(public-*)/**`                                          |
| `frontend/pixijs-patterns.md`         | `src/app/(public)/**`, `src/app/(public-*)/**`                                          |
| `frontend/accessibility.md`           | `src/app/(public)/**`, `src/app/(public-*)/**`, `src/app/(admin)/**`                    |
| `frontend/ui-ux-patterns.md`          | `src/app/(public)/**`, `src/app/(public-*)/**`, `src/app/(admin)/**`                    |
| `frontend/seo-patterns.md`            | `src/app/(public)/**`, `src/app/(public-*)/**`                                          |
| `frontend/lexical-patterns.md`        | `src/app/(admin)/**/lexical/**`                                                         |
| `ops/deployment-patterns.md`          | `Dockerfile`, `cloudbuild.yaml`, `.dockerignore`, `.gcloudignore`, `docs/operations/**` |

---

## Task 1: `frontend/` サブディレクトリへ移動 + `paths:` フロントマター追加

**Files:**

- Create dir: `.claude/rules/frontend/`
- Move + edit: `.claude/rules/anti-ai-design.md` → `.claude/rules/frontend/anti-ai-design.md`
- Move + edit: `.claude/rules/project-design-config.md` → `.claude/rules/frontend/project-design-config.md`
- Move + edit: `.claude/rules/design-system-memory.md` → `.claude/rules/frontend/design-system-memory.md`
- Move + edit: `.claude/rules/gsap-patterns.md` → `.claude/rules/frontend/gsap-patterns.md`
- Move + edit: `.claude/rules/visual-effects-patterns.md` → `.claude/rules/frontend/visual-effects-patterns.md`
- Move + edit: `.claude/rules/threejs-patterns.md` → `.claude/rules/frontend/threejs-patterns.md`
- Move + edit: `.claude/rules/pixijs-patterns.md` → `.claude/rules/frontend/pixijs-patterns.md`
- Move + edit: `.claude/rules/accessibility.md` → `.claude/rules/frontend/accessibility.md`
- Move + edit: `.claude/rules/ui-ux-patterns.md` → `.claude/rules/frontend/ui-ux-patterns.md`
- Move + edit: `.claude/rules/seo-patterns.md` → `.claude/rules/frontend/seo-patterns.md`
- Move + edit: `.claude/rules/lexical-patterns.md` → `.claude/rules/frontend/lexical-patterns.md`

**Step 1: 公開ページ専用ルール（7ファイル）にフロントマターを追加してgit mvで移動**

各ファイルの先頭に以下を追加してから `git mv` で移動する。

`anti-ai-design.md`, `project-design-config.md`, `design-system-memory.md`,
`gsap-patterns.md`, `visual-effects-patterns.md`, `threejs-patterns.md`, `pixijs-patterns.md` の先頭に追加:

```markdown
---
paths:
  - "src/app/(public)/**"
  - "src/app/(public-*)/**"
---
```

**Step 2: 公開ページ + 管理画面共通ルール（2ファイル）にフロントマターを追加**

`accessibility.md`, `ui-ux-patterns.md` の先頭に追加:

```markdown
---
paths:
  - "src/app/(public)/**"
  - "src/app/(public-*)/**"
  - "src/app/(admin)/**"
---
```

**Step 3: SEOルールにフロントマターを追加**

`seo-patterns.md` の先頭に追加:

```markdown
---
paths:
  - "src/app/(public)/**"
  - "src/app/(public-*)/**"
---
```

**Step 4: Lexicalルールにフロントマターを追加**

`lexical-patterns.md` の先頭に追加:

```markdown
---
paths:
  - "src/app/(admin)/**/lexical/**"
---
```

**Step 5: git mv で frontend/ サブディレクトリへ移動（11ファイル一括）**

```bash
cd G:/workspace/work/website/customer/myrrh-rental-space
mkdir -p .claude/rules/frontend
git mv .claude/rules/anti-ai-design.md .claude/rules/frontend/
git mv .claude/rules/project-design-config.md .claude/rules/frontend/
git mv .claude/rules/design-system-memory.md .claude/rules/frontend/
git mv .claude/rules/gsap-patterns.md .claude/rules/frontend/
git mv .claude/rules/visual-effects-patterns.md .claude/rules/frontend/
git mv .claude/rules/threejs-patterns.md .claude/rules/frontend/
git mv .claude/rules/pixijs-patterns.md .claude/rules/frontend/
git mv .claude/rules/accessibility.md .claude/rules/frontend/
git mv .claude/rules/ui-ux-patterns.md .claude/rules/frontend/
git mv .claude/rules/seo-patterns.md .claude/rules/frontend/
git mv .claude/rules/lexical-patterns.md .claude/rules/frontend/
```

**Step 6: git status で確認**

```bash
git status
```

期待出力:

```
renamed: .claude/rules/anti-ai-design.md -> .claude/rules/frontend/anti-ai-design.md
renamed: .claude/rules/accessibility.md -> .claude/rules/frontend/accessibility.md
... (11 files renamed)
```

**Step 7: commit**

```bash
git commit -m "refactor(claude): add paths: frontmatter and move 11 rules to frontend/ subdir

公式ベストプラクティス準拠: paths: フロントマターで条件付きロードを実装。
対象ファイル作業時のみルールが適用されるようになる。

- 7ルール: src/app/(public)/** 限定
- 2ルール: src/app/(public)/** + src/app/(admin)/** 共通
- 1ルール: src/app/(public)/** (SEO)
- 1ルール: src/app/(admin)/**/lexical/** (Lexical)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: `ops/` サブディレクトリへ移動 + `paths:` フロントマター追加

**Files:**

- Create dir: `.claude/rules/ops/`
- Move + edit: `.claude/rules/deployment-patterns.md` → `.claude/rules/ops/deployment-patterns.md`

**Step 1: deployment-patterns.md の先頭にフロントマターを追加**

`.claude/rules/deployment-patterns.md` の先頭に追加:

```markdown
---
paths:
  - "Dockerfile"
  - "cloudbuild.yaml"
  - ".dockerignore"
  - ".gcloudignore"
  - "docs/operations/**"
---
```

**Step 2: git mv で ops/ サブディレクトリへ移動**

```bash
mkdir -p .claude/rules/ops
git mv .claude/rules/deployment-patterns.md .claude/rules/ops/
```

**Step 3: commit**

```bash
git commit -m "refactor(claude): add paths: frontmatter and move deployment-patterns to ops/ subdir

デプロイ関連ファイル作業時のみ適用される条件付きルールに変更。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: CLAUDE.md の簡略化

**Files:**

- Modify: `CLAUDE.md`

公式ドキュメントより、ルールの列挙は不要（Claude Code が自動検出）。
`常時ロード` / `条件付きロード` セクションを削除し、アーキテクチャ説明に置き換える。

**Step 1: CLAUDE.md の `### 詳細ルール` セクションを以下に置き換える**

削除対象（現在のセクション、lines 約 23-56）:

```markdown
### 詳細ルール

#### 常時ロード（全作業共通）

- `.claude/rules/type-safety.md` - 型安全ルール
  （中略 13行）

#### 条件付きロード（対象ファイル作業時のみ）

| ルール | 対象パス |
（中略 14行）

> 詳細リファレンス: `docs/reference/codex-rules/` に配置（必要時に参照）
```

置き換え後:

```markdown
### 詳細ルール

ルールは `.claude/rules/` ディレクトリで管理。Claude Code が自動ロード（再帰的）:

| ディレクトリ                  | ロード条件                | 内容                                              |
| ----------------------------- | ------------------------- | ------------------------------------------------- |
| `.claude/rules/*.md`          | **常時**                  | 型安全・実装品質・Server Actions 等（全作業共通） |
| `.claude/rules/frontend/*.md` | **`src/app/**` 作業時\*\* | UI・アニメーション・アクセシビリティ・SEO 等      |
| `.claude/rules/ops/*.md`      | **`Dockerfile` 等作業時** | Docker / Cloud Run / Cloud Build                  |

> 詳細リファレンス: `docs/reference/codex-rules/` に配置（必要時に参照）
```

**Step 2: 編集後の CLAUDE.md を確認**

変更後の `### 詳細ルール` セクションが正しく置き換わっていることを目視確認。

**Step 3: commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): simplify rules section in CLAUDE.md

paths: フロントマターで条件付きロードが実装されたため、
CLAUDE.md の明示的ルール列挙を削除し、アーキテクチャ説明に置き換え。

公式ドキュメント準拠: https://code.claude.com/docs/en/memory#modular-rules-with-claude/rules/

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: `docs/reference/codex-rules/` の参照更新

**Files:**

- Modify: `docs/reference/codex-rules/accessibility.md` — ヘッダーに移動先メモ追加
- Modify: `docs/reference/codex-rules/deployment-patterns.md` — 同上
- Modify: `docs/reference/codex-rules/README.md` (存在する場合) — 構造更新

**Step 1: 移動した各ファイルの参照先ドキュメントにメモを追加**

`docs/reference/codex-rules/accessibility.md` のヘッダー注記を確認・更新:

```markdown
# アクセシビリティ（a11y）ルール

> **配置**: `.claude/rules/frontend/accessibility.md`（`paths:` フロントマター付き — public・admin 作業時に自動適用）
> WCAG 2.2 AA / React 19 / GSAP prefers-reduced-motion / SkipLink / AriaLiveRegion 対応
```

全条件付きルール（12ファイル）の `docs/reference/codex-rules/*.md` に同様の注記を追加。

**Step 2: commit**

```bash
git add docs/reference/codex-rules/
git commit -m "docs: update codex-rules references to reflect new subdirectory structure

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: 最終検証とまとめ commit

**Step 1: ディレクトリ構造を確認**

```bash
find .claude/rules -name "*.md" | sort
```

期待出力:

```
.claude/rules/auth-patterns.md
.claude/rules/bun-patterns.md
.claude/rules/error-handling.md
.claude/rules/frontend/accessibility.md
.claude/rules/frontend/anti-ai-design.md
.claude/rules/frontend/design-system-memory.md
.claude/rules/frontend/gsap-patterns.md
.claude/rules/frontend/lexical-patterns.md
.claude/rules/frontend/pixijs-patterns.md
.claude/rules/frontend/project-design-config.md
.claude/rules/frontend/seo-patterns.md
.claude/rules/frontend/threejs-patterns.md
.claude/rules/frontend/ui-ux-patterns.md
.claude/rules/frontend/visual-effects-patterns.md
.claude/rules/implementation-quality.md
.claude/rules/nuqs-patterns.md
.claude/rules/ops/deployment-patterns.md
.claude/rules/prisma-patterns.md
.claude/rules/react-patterns.md
.claude/rules/server-actions.md
.claude/rules/tailwind-patterns.md
.claude/rules/test-quality.md
.claude/rules/type-safety.md
.claude/rules/zod-patterns.md
```

**Step 2: 各 frontend/ ファイルの先頭 5 行を確認（frontmatter が正しい）**

```bash
head -6 .claude/rules/frontend/anti-ai-design.md
head -6 .claude/rules/frontend/accessibility.md
head -7 .claude/rules/frontend/lexical-patterns.md
head -6 .claude/rules/ops/deployment-patterns.md
```

期待出力（anti-ai-design.md）:

```yaml
---
paths:
  - "src/app/(public)/**"
  - "src/app/(public-*)/**"
---
```

**Step 3: `bun run validate` で型チェック + lint**

```bash
cd G:/workspace/work/website/customer/myrrh-rental-space
bun run validate
```

期待出力: `type-check: PASS`, `lint: PASS`

（`.claude/rules/` の変更は TypeScript コードに影響しないため必ずパスするはずだが、念のため確認）

**Step 4: MEMORY.md を更新**

`~/.claude/projects/.../memory/MEMORY.md` の `カスタムサブエージェント` セクション下に追記:

```markdown
## .claude/rules/ 公式準拠アーキテクチャ（完了済み）

- **常時ロード**: `.claude/rules/*.md`（ルートレベル、12ファイル）
- **条件付きロード**: `.claude/rules/frontend/*.md`（11ファイル、`paths:` フロントマター付き）
- **条件付きロード**: `.claude/rules/ops/*.md`（1ファイル、`paths:` フロントマター付き）
- CLAUDE.md の明示的ルール列挙は削除済み。Claude Code が自動検出。
```

---

## 変更サマリー

| 指標                       | 変更前                       | 変更後                                  |
| -------------------------- | ---------------------------- | --------------------------------------- |
| 常時ロードルール           | 13ファイル（全ロード）       | **12ファイル**（本当に常時）            |
| 条件付きルール             | 12ファイル（実際は全ロード） | **12ファイル**（paths: で真の条件付き） |
| CLAUDE.md ルールセクション | 35行（明示的列挙）           | **5行**（アーキテクチャ説明のみ）       |
| 公式準拠                   | 部分的                       | **完全準拠**                            |
