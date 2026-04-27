# Skills `paths:` Field Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 11 path-bound skill の SKILL.md frontmatter に公式 `paths:` field を追加し、対象パス外編集時の auto-activate を抑止して description budget の context 節約を行う。

**Architecture:** Claude Code Skills 公式仕様（[skills docs](https://code.claude.com/docs/en/skills)）の `paths:` field を path-bound skill 11 件に追加。`paths:` 設定時は **マッチするファイルを開いている時のみ auto-activate**（user invocation `/skill` は引き続き可能）。既存 `.claude/rules/**/*.md` で採用済みの YAML list 形式（unquoted glob）に揃える。description / when_to_use 合算 1,536 char × ~20 skill ≒ 30KB の常時ロードから path-bound 分を除外し context 節約。

**Tech Stack:** YAML frontmatter (Claude Code Skills spec)

---

## Decision Matrix

### `paths:` を追加する 11 skill（path-bound）

| Bundle | Skill                     | `paths:` (YAML list)                                                                                                                                             |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | `prisma-migration`        | `prisma/schema.prisma`                                                                                                                                           |
| A      | `seed-audit`              | `prisma/seed.ts`, `prisma/schema.prisma`                                                                                                                         |
| B      | `cache-audit`             | `src/**/actions.ts`, `src/**/mutations.ts`, `src/**/queries.ts`, `src/**/api/**/route.ts`                                                                        |
| B      | `split-action-file`       | `src/**/actions.ts`, `src/**/mutations.ts`, `src/**/queries.ts`                                                                                                  |
| B      | `use-server-audit`        | `src/**/actions.ts`, `src/**/mutations.ts`, `src/**/queries.ts`, `src/**/server-actions/**`                                                                      |
| C      | `lexical-audit`           | `src/**/lexical/**`                                                                                                                                              |
| C      | `lexical-node`            | `src/**/lexical/nodes/**`                                                                                                                                        |
| C      | `lexical-plugin`          | `src/**/lexical/plugins/*Plugin.tsx`                                                                                                                             |
| C      | `lexical-toolbar`         | `src/**/lexical/plugins/toolbar/**`                                                                                                                              |
| D      | `audit-settings-sections` | `src/app/(admin)/admin/(dashboard)/settings/_components/sections/**`                                                                                             |
| D      | `adr-drift-audit`         | `docs/architecture/decisions/**`, `bunfig.toml`, `playwright.config.ts`, `.gitignore`, `package.json`, `cloudbuild.yaml`, `lefthook.yml`, `.github/workflows/**` |

### `paths:` を追加しない 21 skill（justification を残す）

| 理由                                                                                       | 該当 skills                                                                                                 |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `disable-model-invocation: true`（auto-activation 元から無効、`paths:` は意味を持たない）  | `adr-create`, `create-section-type`, `worktree-bootstrap`                                                   |
| 意図ベース invocation（新規リソース追加系。"Prisma enum を追加して" 等の自然言語 trigger） | `add-prisma-enum`, `add-settings-field`, `create-admin-page`, `create-page-content`, `create-server-action` |
| Error 状況 invocation（"動かない" "デプロイ失敗" 等の言語 trigger）                        | `cloud-run-debug`, `google-calendar-debug`, `instagram-debug`, `stripe-debug`, `turbopack-hmr`              |
| 全プロジェクト横断監査（path 限定すると検出取りこぼしリスク）                              | `ssot-audit`, `integration-audit`, `memory-staleness-audit`                                                 |
| Frontend 設計 / UX 意図ベース（特定 path に紐づかない design intent）                      | `frontend-design`, `parallax-section`, `ui-ux-pro-max`                                                      |
| Intent-based meta-skill（依存更新 / verify subagent 等）                                   | `upgrade-deps`, `verify-subagent-report`                                                                    |

---

## File Structure

修正対象（11 ファイル、各 frontmatter のみ）:

```
.claude/skills/
├── prisma-migration/SKILL.md          (Bundle A)
├── seed-audit/SKILL.md                (Bundle A)
├── cache-audit/SKILL.md               (Bundle B)
├── split-action-file/SKILL.md         (Bundle B)
├── use-server-audit/SKILL.md          (Bundle B)
├── lexical-audit/SKILL.md             (Bundle C)
├── lexical-node/SKILL.md              (Bundle C)
├── lexical-plugin/SKILL.md            (Bundle C)
├── lexical-toolbar/SKILL.md           (Bundle C)
├── audit-settings-sections/SKILL.md   (Bundle D)
└── adr-drift-audit/SKILL.md           (Bundle D)
```

各 SKILL.md は frontmatter の `description:` と `argument-hint:`（または closing `---`）の間に `paths:` field を YAML list で追加する。本文（手順）は変更しない。

---

## Tasks

### Task 1: Bundle A — Database/Migration skills

**Files:**

- Modify: `.claude/skills/prisma-migration/SKILL.md`
- Modify: `.claude/skills/seed-audit/SKILL.md`

- [ ] **Step 1: prisma-migration/SKILL.md に paths を追加**

`description:` ブロックと `argument-hint:` の間に挿入。最終 frontmatter:

```yaml
---
name: prisma-migration
description: >
  Prisma スキーマ変更後にマイグレーションを生成・実行する。
  schema.prisma の差分を確認し、マイグレーション名を提案、`migrate dev` を実行しクライアントを再生成する。
  prisma/schema.prisma を編集した直後に使用。
paths:
  - prisma/schema.prisma
argument-hint: "[migration-name]"
---
```

- [ ] **Step 2: seed-audit/SKILL.md に paths を追加**

このファイルは `argument-hint:` を持たないので `description:` 直下、closing `---` の直前に挿入。最終 frontmatter:

```yaml
---
name: seed-audit
description: prisma/seed.ts の網羅性を検証する。Prisma enum 全値が seed で使われているか、全モデルに seed 関数が存在するか、seedAll / seedDemo に登録されているか、upsert で idempotent 化されているかを検出する。新規モデル追加後・enum 値追加後・定期メンテで使用。
paths:
  - prisma/seed.ts
  - prisma/schema.prisma
---
```

- [ ] **Step 3: YAML frontmatter validation**

Run:

```bash
for f in .claude/skills/prisma-migration/SKILL.md .claude/skills/seed-audit/SKILL.md; do
  echo "=== $f ==="
  awk '/^---$/{c++; if(c==2) exit; next} c==1{print}' "$f"
done
```

Expected: 両ファイルの frontmatter に `paths:` が含まれ、YAML list が正しくインデントされている。

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/prisma-migration/SKILL.md .claude/skills/seed-audit/SKILL.md
git commit -m "chore(skills): add paths frontmatter to database skills

prisma-migration / seed-audit に公式 paths field を追加。
マッチするファイル (prisma/schema.prisma / prisma/seed.ts) を編集中の
セッションでのみ auto-activate される設定で、description budget
(1,536 char × auto-load) の常時 context 消費を節約。

C3b Bundle A. Refs: docs/superpowers/plans/2026-04-27-skills-paths-enhancement.md"
```

---

### Task 2: Bundle B — Server Action skills

**Files:**

- Modify: `.claude/skills/cache-audit/SKILL.md`
- Modify: `.claude/skills/split-action-file/SKILL.md`
- Modify: `.claude/skills/use-server-audit/SKILL.md`

3 skill とも path scope が一部 overlap する（`actions.ts` / `mutations.ts` / `queries.ts`）。これは想定内: Server Action ファイル編集時に複数 audit skill が同時に descriptions を提示するのが意図。

- [ ] **Step 1: cache-audit/SKILL.md に paths を追加**

`description:` 直下、closing `---` の直前に挿入。最終 frontmatter:

```yaml
---
name: cache-audit
description: Server Action のキャッシュ無効化の網羅性をチェックする。updateTag/revalidateTag の漏れ、不整合、3点セット欠落を検出。Server Action ファイルを編集した後に使用。
paths:
  - src/**/actions.ts
  - src/**/mutations.ts
  - src/**/queries.ts
  - src/**/api/**/route.ts
---
```

- [ ] **Step 2: split-action-file/SKILL.md に paths を追加**

`description:` ブロックと `argument-hint:` の間に挿入。最終 frontmatter:

```yaml
---
name: split-action-file
description: >
  大きな Server Action ファイル（500行超）を queries.ts + mutations.ts + index.ts（barrel）に分割する。
  get* 系は queries.ts、create*/update*/delete*/publish*/toggle*/restore*/archive* 系は mutations.ts に振り分ける。
  barrel の index.ts で既存 import パスを変えずに透過する。
paths:
  - src/**/actions.ts
  - src/**/mutations.ts
  - src/**/queries.ts
argument-hint: <action-file-path>
---
```

- [ ] **Step 3: use-server-audit/SKILL.md に paths を追加**

`description:` 直下、closing `---` の直前に挿入。最終 frontmatter:

```yaml
---
name: use-server-audit
description: `"use server"` ファイルが Next.js 16 公式の export 契約（async 関数のみ export 可）に準拠しているかを横断スキャンする。型・interface・class・非 async const・default 非関数 export を検出し、Turbopack silent bug（`ReferenceError: X is not defined`）の事前防止に使う。Server Action ファイル編集後・大規模 refactor 後に実行。
paths:
  - src/**/actions.ts
  - src/**/mutations.ts
  - src/**/queries.ts
  - src/**/server-actions/**
---
```

- [ ] **Step 4: YAML frontmatter validation**

Run:

```bash
for f in .claude/skills/cache-audit/SKILL.md .claude/skills/split-action-file/SKILL.md .claude/skills/use-server-audit/SKILL.md; do
  echo "=== $f ==="
  awk '/^---$/{c++; if(c==2) exit; next} c==1{print}' "$f"
done
```

Expected: 3 ファイル全ての frontmatter に `paths:` が含まれる。

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/cache-audit/SKILL.md .claude/skills/split-action-file/SKILL.md .claude/skills/use-server-audit/SKILL.md
git commit -m "chore(skills): add paths frontmatter to server action skills

cache-audit / split-action-file / use-server-audit に公式 paths field
を追加。actions.ts / mutations.ts / queries.ts / api route.ts 編集中の
セッションでのみ auto-activate。3 skill の path overlap は意図的
(Server Action 編集時に複数 audit が同時提示される)。

C3b Bundle B. Refs: docs/superpowers/plans/2026-04-27-skills-paths-enhancement.md"
```

---

### Task 3: Bundle C — Lexical skills

**Files:**

- Modify: `.claude/skills/lexical-audit/SKILL.md`
- Modify: `.claude/skills/lexical-node/SKILL.md`
- Modify: `.claude/skills/lexical-plugin/SKILL.md`
- Modify: `.claude/skills/lexical-toolbar/SKILL.md`

実 lexical 配置:

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/` (`*Plugin.tsx`)
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/toolbar/` (`*Section.tsx`)
- `src/shared/lib/lexical/`

`src/**/lexical/**` でこれらを横断カバーできる。lexical-plugin と lexical-toolbar の境界は `*Plugin.tsx` vs `plugins/toolbar/**` で分離する。

- [ ] **Step 1: lexical-audit/SKILL.md に paths を追加**

最終 frontmatter:

```yaml
---
name: lexical-audit
description: 管理画面の Lexical 実装を監査またはモダナイズするときに使う。deprecated API、private API、listener waterfall、NodeState 逸脱、HTML import、table API を点検し、現行の公式推奨へ寄せる。新しい node/plugin/toolbar を追加する作業には使わない。
paths:
  - src/**/lexical/**
---
```

- [ ] **Step 2: lexical-node/SKILL.md に paths を追加**

最終 frontmatter:

```yaml
---
name: lexical-node
description: 管理画面の Lexical に新しいノード型を追加するときに使う。NodeState API、JSON/DOM 往復、editor 登録までを一連で揃える。既存 node の監査や deprecated API 除去が主目的なら lexical-audit を使う。
paths:
  - src/**/lexical/nodes/**
---
```

- [ ] **Step 3: lexical-plugin/SKILL.md に paths を追加**

最終 frontmatter:

```yaml
---
name: lexical-plugin
description: 管理画面の Lexical に新しい plugin を追加するときに使う。dialog、command、listener のどれで実装するかを決め、editor への統合まで揃える。既存実装の監査や deprecated API 除去が主目的なら lexical-audit を使う。
paths:
  - src/**/lexical/plugins/*Plugin.tsx
---
```

注: `*Plugin.tsx` だけにスコープすることで `plugins/toolbar/` 配下（`*Section.tsx`）は除外され lexical-toolbar との path overlap を避ける。

- [ ] **Step 4: lexical-toolbar/SKILL.md に paths を追加**

最終 frontmatter:

```yaml
---
name: lexical-toolbar
description: 管理画面の Lexical toolbar に新しい操作を足すときに使う。button 配置、command 接続、dialog 連携、active state を一緒に揃える。既存 toolbar の監査やモダナイズが主目的なら lexical-audit を使う。
paths:
  - src/**/lexical/plugins/toolbar/**
---
```

- [ ] **Step 5: YAML frontmatter validation**

Run:

```bash
for f in .claude/skills/lexical-audit/SKILL.md .claude/skills/lexical-node/SKILL.md .claude/skills/lexical-plugin/SKILL.md .claude/skills/lexical-toolbar/SKILL.md; do
  echo "=== $f ==="
  awk '/^---$/{c++; if(c==2) exit; next} c==1{print}' "$f"
done
```

Expected: 4 ファイル全ての frontmatter に `paths:` が含まれる。lexical-audit は最広で `lexical/**`、lexical-node は `nodes/**`、lexical-plugin は `plugins/*Plugin.tsx`、lexical-toolbar は `plugins/toolbar/**` と分離されている。

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/lexical-audit/SKILL.md .claude/skills/lexical-node/SKILL.md .claude/skills/lexical-plugin/SKILL.md .claude/skills/lexical-toolbar/SKILL.md
git commit -m "chore(skills): add paths frontmatter to lexical skills

lexical-audit / lexical-node / lexical-plugin / lexical-toolbar に
公式 paths field を追加。lexical-audit は src/**/lexical/** 全域、
node/plugin/toolbar は実配置 (nodes/ / plugins/*Plugin.tsx /
plugins/toolbar/) に細分化して path overlap を回避。

C3b Bundle C. Refs: docs/superpowers/plans/2026-04-27-skills-paths-enhancement.md"
```

---

### Task 4: Bundle D — Settings + ADR skills

**Files:**

- Modify: `.claude/skills/audit-settings-sections/SKILL.md`
- Modify: `.claude/skills/adr-drift-audit/SKILL.md`

- [ ] **Step 1: audit-settings-sections/SKILL.md に paths を追加**

最終 frontmatter:

```yaml
---
name: audit-settings-sections
description: 管理画面の設定セクション（settings/_components/sections/）の品質を監査する。ヒント折りたたみ・導線リンク・フォームパターン・SubmitButton 配置を一括チェック。新しい設定セクション追加後や定期メンテ時に使用。
paths:
  - src/app/(admin)/admin/(dashboard)/settings/_components/sections/**
---
```

- [ ] **Step 2: adr-drift-audit/SKILL.md に paths を追加**

最終 frontmatter:

```yaml
---
name: adr-drift-audit
description: ADR (docs/architecture/decisions/) の制約と設定ファイル（bunfig.toml / playwright.config.ts / .gitignore / package.json / .github/workflows/*.yml / cloudbuild.yaml / lefthook.yml）の乖離を検出する。ADR 新規採択後や定期メンテで使用。設定が ADR 制約と矛盾した dead code 化していないか確認する。
paths:
  - docs/architecture/decisions/**
  - bunfig.toml
  - playwright.config.ts
  - .gitignore
  - package.json
  - cloudbuild.yaml
  - lefthook.yml
  - .github/workflows/**
---
```

- [ ] **Step 3: YAML frontmatter validation**

Run:

```bash
for f in .claude/skills/audit-settings-sections/SKILL.md .claude/skills/adr-drift-audit/SKILL.md; do
  echo "=== $f ==="
  awk '/^---$/{c++; if(c==2) exit; next} c==1{print}' "$f"
done
```

Expected: 両ファイルの frontmatter に `paths:` が含まれる。adr-drift-audit は config files (top-level) と docs / .github/workflows をすべてカバー。

- [ ] **Step 4: 最終全体 grep — 11 skill 全て paths を持つことを確認**

Run:

```bash
grep -l "^paths:" .claude/skills/*/SKILL.md | sort
```

Expected:

```
.claude/skills/adr-drift-audit/SKILL.md
.claude/skills/audit-settings-sections/SKILL.md
.claude/skills/cache-audit/SKILL.md
.claude/skills/lexical-audit/SKILL.md
.claude/skills/lexical-node/SKILL.md
.claude/skills/lexical-plugin/SKILL.md
.claude/skills/lexical-toolbar/SKILL.md
.claude/skills/prisma-migration/SKILL.md
.claude/skills/seed-audit/SKILL.md
.claude/skills/split-action-file/SKILL.md
.claude/skills/use-server-audit/SKILL.md
```

11 件、Decision Matrix と完全一致。

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/audit-settings-sections/SKILL.md .claude/skills/adr-drift-audit/SKILL.md
git commit -m "chore(skills): add paths frontmatter to settings and adr skills

audit-settings-sections / adr-drift-audit に公式 paths field を追加。
audit-settings-sections は管理画面 settings sections 配下、
adr-drift-audit は ADR docs + 設定ファイル群 (bunfig.toml /
playwright.config.ts / .gitignore / package.json / cloudbuild.yaml /
lefthook.yml / .github/workflows/**) を網羅。

C3b 完了 (11 path-bound skill 全件)。
Refs: docs/superpowers/plans/2026-04-27-skills-paths-enhancement.md"
```

---

## 完了後

完了報告と次セッション handoff:

1. `git log --oneline -5` で 4 commit 全て main に乗ったか確認
2. `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md` の `⬜ C3b` を `✅ C3b 完了 (commits SHA1〜SHA4)` に更新、結果サマリ追加
3. 残 plan: **C4 (`docs/**` cleanup)\*\* が未着手であることを memory に明記
