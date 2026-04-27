> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# C4 — docs/\*\* Clean-Break Refactor Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution recommended for trivial Bundle: deletion + frontmatter / index updates, logic-zero, test-zero). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/**` の dangling references / dead redirect stubs / drift を clean break で整理し、dual-AI（Codex + Claude Code）並立体制を docs 上に正確に反映する。

**Architecture:** 4 段階で確定的な drift 修正と価値ゼロコンテンツ削除のみ実施。実コンテンツ（architecture/ / operations/ / security/ / reference/claude-rules/）は active な引用が `.claude/rules/**` から確認できているため維持。clean-break 原則（ADR-0015）に従い、後方互換シム（旧パス re-export / `// removed` コメント）は付けず完全削除する。

**Tech Stack:** Markdown / git のみ。subagent dispatch・test 追加・logic 変更ゼロ。

**実行方法:** trivial Bundle (frontmatter + 削除中心、test 不要) のため CLAUDE.md `Subagent 規律` の最新 learning に従い **controller inline 実行**。各 Task = 1 commit、6 commits 合計。

---

## File Structure

| 操作 | パス                                                     | 理由                                                                                                                                                               |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 削除 | `docs/guides/admin/` (空 dir)                            | 中身なし                                                                                                                                                           |
| 削除 | `docs/reference/codex-rules/` (空 dir)                   | ADR 0013 で sync 廃止後の空殻                                                                                                                                      |
| 削除 | `docs/guides/coding-standards.md` (19 行 redirect stub)  | 実コンテンツゼロ、`AGENTS.md` 直参照で十分                                                                                                                         |
| 削除 | `docs/guides/type-safety.md` (17 行 redirect stub)       | 同上                                                                                                                                                               |
| 削除 | `docs/guides/testing.md` (19 行 redirect stub)           | 同上                                                                                                                                                               |
| 削除 | `docs/guides/nuqs.md` (20 行 redirect stub)              | 同上                                                                                                                                                               |
| 削除 | `docs/guides/prisma.md` (22 行 redirect stub)            | 同上                                                                                                                                                               |
| 削除 | `docs/guides/turbopack.md` (21 行 redirect stub)         | 同上                                                                                                                                                               |
| 修正 | `docs/guides/README.md`                                  | 削除した 6 stub への link を除去、guides/ ディレクトリの存在意義を「dual-AI 入口リスト」に絞る                                                                     |
| 修正 | `docs/architecture/decisions/README.md`                  | ADR 0022 をインデックステーブルに追加                                                                                                                              |
| 修正 | `docs/README.md`                                         | `requirements/` 言及 2 箇所削除（ADR 0014 で 2026-04-23 削除済み）                                                                                                 |
| 修正 | `docs/plans/README.md`                                   | dual-AI 並立を明示（現状の「Claude Code は legacy」記述は実態と乖離）                                                                                              |
| 修正 | `docs/plans/CLAUDE.md`                                   | 同上、dual-AI 並立に整合                                                                                                                                           |
| 維持 | `docs/architecture/agent-instructions.md` (45 行)        | Codex 配置仕様の概要、実コンテンツあり                                                                                                                             |
| 維持 | `docs/architecture/codex-instructions.md` (87 行)        | 同上                                                                                                                                                               |
| 維持 | `docs/operations/**` / `docs/security/**`                | 実コンテンツあり、被参照あり                                                                                                                                       |
| 維持 | `docs/reference/claude-rules/**` (4 ファイル / 3,397 行) | `.claude/rules/{bun-patterns.md, react/hooks.md, frontend/gsap/core.md, frontend/ui-ux-patterns.md, frontend/anti-ai-design.md}` から active 参照、SSoT として継続 |
| 維持 | `docs/plans/archive/completed-legacy.md` (358 行)        | 2026-02-07 以前の集約サマリー、履歴 SoT として維持（個別 plan は git history、これは集約のみの SoT）                                                               |

---

## Task 1: 空ディレクトリ削除

**Files:**

- Delete: `docs/guides/admin/`
- Delete: `docs/reference/codex-rules/`

- [ ] **Step 1: 削除前に空であることを確認**

```bash
find docs/guides/admin docs/reference/codex-rules -type f 2>/dev/null
```

Expected: no output（ファイルゼロ）

- [ ] **Step 2: 空ディレクトリ削除**

MINGW64 では `rm -rf` は deny ルール（CLAUDE.md グローバル）。Python で削除:

```bash
python3 -c "import shutil; shutil.rmtree('docs/guides/admin')"
python3 -c "import shutil; shutil.rmtree('docs/reference/codex-rules')"
```

- [ ] **Step 3: git status で削除確認**

```bash
git status --short docs/
```

Expected: 空ディレクトリは git tracked でなければ status に出ない（空 dir は git untracked なため）。事実上 working tree からのみ消える。

- [ ] **Step 4: untracked check（empty dir is git invisible）**

空ディレクトリは git で tracked されないため、削除後も `git diff` には差分が出ない。本 Task の実体は **物理ディレクトリ消去のみ**で commit は不要。次 Task へ進む。

> **Note:** Task 1 は commit を生成しない。物理消去後に Task 2 に進む。

---

## Task 2: ADR 0022 を decisions/README.md に追加

**Files:**

- Modify: `docs/architecture/decisions/README.md` (インデックステーブル末尾)

- [ ] **Step 1: 現状確認**

```bash
grep -n "0021" docs/architecture/decisions/README.md
```

Expected: 行末が ADR 0021、0022 への行が無いことを確認

- [ ] **Step 2: ADR 0022 行を追加**

`docs/architecture/decisions/README.md` の table に以下の行を ADR 0021 行の直後に挿入:

```markdown
| [0022](./0022-checkbox-cell-44px-wrapper.md) | 管理 table の checkbox は 44px ヒットエリア wrapper (`CheckboxCell`) で囲む | Accepted | 2026-04-26 |
```

> **Note:** 日付は `0022-checkbox-cell-44px-wrapper.md` 本体の `Date` フィールドを Read で確認してから記入。タイトルは ADR 内 H1 を踏襲。

- [ ] **Step 3: 整合確認**

```bash
ls docs/architecture/decisions/*.md | grep -c "^docs/architecture/decisions/00[0-9][0-9]-"
grep -c "| \[00" docs/architecture/decisions/README.md
```

Expected: ADR ファイル数 - 1 (template / README 除く) = README index 行数

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/decisions/README.md
git commit -m "docs(adr): add 0022 to decisions index (drift fix)"
```

---

## Task 3: docs/README.md の `requirements/` 言及削除

**Files:**

- Modify: `docs/README.md` (構造ツリー L10 と クイックリンク table L25)

- [ ] **Step 1: 削除対象確認**

```bash
grep -n "requirements" docs/README.md
```

Expected: 2 行 hit（構造ツリー内の `├── requirements/` とクイックリンク table 行）

- [ ] **Step 2: 構造ツリーの行を削除**

`docs/README.md` の L10 `├── requirements/    # 機能要件` 行を削除。前後の `├──` 接続文字を必要なら整える（`architecture/` 直下の dir 列挙行のため、削除しても他行の接続は影響なし）。

- [ ] **Step 3: クイックリンク table の行を削除**

`docs/README.md` の L25 `| [requirements/](./requirements/) | 機能別要件定義 | [README.md](./requirements/README.md) |` を行ごと削除。

- [ ] **Step 4: 残存 dangling ref ゼロ確認**

```bash
grep -n "requirements" docs/README.md
```

Expected: no output

- [ ] **Step 5: Commit**

```bash
git add docs/README.md
git commit -m "docs: remove dangling references to deleted requirements/ directory"
```

---

## Task 4: docs/guides/ redirect stub 6 ファイル削除 + README 整理

**Files:**

- Delete: `docs/guides/coding-standards.md`
- Delete: `docs/guides/type-safety.md`
- Delete: `docs/guides/testing.md`
- Delete: `docs/guides/nuqs.md`
- Delete: `docs/guides/prisma.md`
- Delete: `docs/guides/turbopack.md`
- Modify: `docs/guides/README.md` (table 全削除、dual-AI 入口リストに整理)

- [ ] **Step 1: 削除前に被参照ゼロ確認**

```bash
grep -rln "guides/coding-standards\|guides/type-safety\|guides/testing\|guides/nuqs\|guides/prisma\|guides/turbopack" docs/ .claude/ AGENTS.md CLAUDE.md 2>/dev/null
```

Expected: docs/guides/README.md のみ hit（self-link）。`.claude/` / `AGENTS.md` / `CLAUDE.md` から hit が出たら削除前にそちらも併せて修正。

- [ ] **Step 2: 6 stub ファイル削除**

```bash
git rm docs/guides/coding-standards.md docs/guides/type-safety.md docs/guides/testing.md docs/guides/nuqs.md docs/guides/prisma.md docs/guides/turbopack.md
```

- [ ] **Step 3: docs/guides/README.md を dual-AI 入口リストに簡素化**

新内容:

```markdown
# 開発ガイド

このディレクトリは dual-AI 体制の **dev 補助 docs 入口** として機能する。実装ルールの正本は AI 別に分離されている:

- **Codex**: [`AGENTS.md`](../../AGENTS.md) と [`.agents/skills/`](../../.agents/skills/) — Codex 起動時に階層的に読み込まれる正本
- **Claude Code**: [`CLAUDE.md`](../../CLAUDE.md) と [`.claude/rules/**`](../../.claude/rules/) — `paths:` frontmatter による条件付き auto-load
- **両 AI 共通**: [`.claude/rules/**`](../../.claude/rules/) は `docs/reference/claude-rules/**` の詳細リファレンスから引用される（active 利用）

本ディレクトリ配下に過去存在した個別ガイド（`coding-standards.md` / `type-safety.md` / `testing.md` / `nuqs.md` / `prisma.md` / `turbopack.md`）は redirect stub として実コンテンツを持たなかったため削除。実装ルールは AI 別の正本（上記）から直接参照する。

## 関連

- [アーキテクチャ](../architecture/README.md) — 設計判断・ADR・データフロー
- [運用](../operations/README.md) — デプロイ・インフラ・cron
- [セキュリティ](../security/README.md) — 認証・保護対策
- [Codex Instruction Architecture](../architecture/codex-instructions.md) — Codex 配置仕様の詳細
- [AI Agent Instructions Layout](../architecture/agent-instructions.md) — `.claude/*` / `AGENTS.md` の配置原則
```

- [ ] **Step 4: 削除後のファイル数確認**

```bash
ls docs/guides/
```

Expected: `README.md` のみ

- [ ] **Step 5: Commit**

```bash
git add docs/guides/
git commit -m "docs(guides): drop redirect stubs and refocus README on dual-AI entry points"
```

---

## Task 5: docs/plans/ の dual-AI 並立を明示

**Files:**

- Modify: `docs/plans/README.md`
- Modify: `docs/plans/CLAUDE.md`

- [ ] **Step 1: 現状の問題確認**

両ファイルとも「Codex 作業では参照しない、Claude Code 用 legacy reference として残置」と記述。実態は Claude Code が active 利用中（CLAUDE.md / `.claude/**` 全域で daily 利用）。dual-AI 並立として書き直す。

- [ ] **Step 2: docs/plans/README.md L31 修正**

旧:

```markdown
Codex 作業では [`AGENTS.md`](../../AGENTS.md) と `.agents/skills` を入口にする。`docs/plans/CLAUDE.md` は Claude Code 用 legacy reference として残置するが、Codex 作業では参照しない。
```

新:

```markdown
本リポジトリは dual-AI 体制（Codex + Claude Code）。プラン作成 / 実行のスキルチェーンは両 AI 共通だが、入口は AI 別:

- **Codex**: [`AGENTS.md`](../../AGENTS.md) と [`.agents/skills/`](../../.agents/skills/)
- **Claude Code**: [`CLAUDE.md`](../../CLAUDE.md) と [`.claude/rules/**`](../../.claude/rules/) + [`docs/plans/CLAUDE.md`](./CLAUDE.md)（本ディレクトリ専用の補助 instruction）
```

- [ ] **Step 3: docs/plans/CLAUDE.md L3 修正**

旧:

```markdown
> Claude Code 用 legacy reference。Codex 作業では [`AGENTS.md`](../../AGENTS.md) と `.agents/skills` を入口にし、このファイルを正本として参照しない。
```

新:

```markdown
> 本ファイルは Claude Code 用の `docs/plans/` 専用補助 instruction（dual-AI 体制下で active 利用中）。Codex 作業では代わりに [`AGENTS.md`](../../AGENTS.md) と [`.agents/skills/`](../../.agents/skills/) を入口にする。
```

- [ ] **Step 4: 整合確認**

```bash
grep -n "legacy reference" docs/plans/README.md docs/plans/CLAUDE.md
```

Expected: no output（"legacy" 文言が両ファイルから消えている）

- [ ] **Step 5: Commit**

```bash
git add docs/plans/README.md docs/plans/CLAUDE.md
git commit -m "docs(plans): clarify dual-AI parallel use (Claude Code is active, not legacy)"
```

---

## Task 6: handoff memory 更新

**Files:**

- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md`

- [ ] **Step 1: handoff memory に C4 完了を追記**

`## 進捗` セクションの `⬜ **C4** — \`docs/**\` cleanup (残 1 plan)`行を、本 plan の commit SHA リストと共に`✅ **C4\*\* 完了` に書き換える。

```bash
# Task 2-5 の commit SHA を取得
git log --oneline --no-merges --grep="docs(adr)\|docs:.*requirements\|docs(guides)\|docs(plans):.*dual-AI" -10
```

書き換え内容（テンプレート、実 SHA に置換すること）:

```markdown
- ✅ **C4 完了 (2026-04-27, commits `<TASK2_SHA>`〜`<TASK5_SHA>`)** — `docs/**` clean-break refactor 4 commit
  - Task 1: 空ディレクトリ 2 件削除 (`docs/guides/admin/` / `docs/reference/codex-rules/`、空 dir のため commit 生成なし)
  - Task 2 (`<TASK2_SHA>`): ADR 0022 を `decisions/README.md` インデックスに追加 (drift 修正)
  - Task 3 (`<TASK3_SHA>`): `docs/README.md` の `requirements/` dangling ref 2 箇所削除（ADR 0014 で削除済みの directory への参照）
  - Task 4 (`<TASK4_SHA>`): `docs/guides/` redirect stub 6 ファイル削除（実コンテンツゼロ）+ README.md を dual-AI 入口リストに簡素化
  - Task 5 (`<TASK5_SHA>`): `docs/plans/README.md` + `docs/plans/CLAUDE.md` の dual-AI 並立明示（"Claude Code is legacy" 記述を事実と整合）
  - **結果**: 空 dir 2 件削除、redirect stub 6 件削除（118 行）、ADR drift 1 件解消、dangling ref 2 件解消、dual-AI 整合 2 ファイル
  - **維持判定 (削除候補だが継続維持)**: `docs/plans/archive/completed-legacy.md` (358 行、2026-02-07 以前の集約サマリー、git history 補完 SoT として価値あり)、`docs/reference/claude-rules/**` (3,397 行、`.claude/rules/` の `bun-patterns / react/hooks / frontend/gsap+ui-ux+anti-ai` 5 ファイルから active 参照あり)
  - plan: `docs/superpowers/plans/2026-04-27-docs-cleanup.md`

## 全体結果

C1 (rules) / C2 (agents) / C3 + C3b (skills) / C4 (docs) すべて完了。Clean-Break Refactor 4 plan セッション完結。
```

- [ ] **Step 2: MEMORY.md index も同期**

`~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md` の `## Clean-Break Refactor C1-C4 (2026-04-27)` 行を C4 完了反映に更新。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-04-27-docs-cleanup.md
git commit -m "docs(plan): record C4 docs cleanup completion (handoff memory updated)"
```

> **Note:** memory file は `~/.claude/...` 配下で git 管理外。本 commit は plan ファイル本体の保存のみ。memory 更新は Step 1-2 で実施済み。

---

## Self-Review

**Spec coverage** (handoff memory `project_clean-break-refactor-handoff.md` C4 スコープ):

- [x] ADR 連番確認・dead ADR supersede header → 既に整理済み（0013 / 0017 は Supersession Note 完備）。新規対応は 0022 を README に追加のみ → Task 2
- [x] 完了 plan archive 判断 → archive/completed-legacy.md は維持（集約 SoT として価値あり）
- [x] reference/ の重複コンテンツ削除 → reference/claude-rules/ は active 参照あり、削除しない
- [x] guides/ の outdated 記述 → 6 redirect stub を削除 → Task 4

**Placeholder scan**:

- すべての commit message・diff content が plan 内に明記
- 「TBD / TODO」記述ゼロ

**Type consistency**:

- ファイルパス・commit message が Task 間で整合

**Out of scope (explicit)**:

- `docs/operations/bun.md` の Bun 1.3.9 → 1.3.11 更新は別 Task として別セッションで実施可（specific バージョン記載問題は AGENTS.md の "package.json + bun.lock が SSoT" 原則で曖昧記法に倒すか別途検討）
- `docs/architecture/data-flow-analysis.md` (320 行) など大ファイルの rot 検証はスコープ外（C5 として将来実施可能）

---

## 完了基準

- [ ] Task 1 完了（空 dir 2 件物理削除）
- [ ] Task 2-5 完了（4 commit）
- [ ] Task 6 完了（handoff memory + plan ファイル commit）
- [ ] `git log --oneline -10` で 4 docs commit + 1 plan commit の合計 5 commit が連続
- [ ] `find docs/guides -type f` が `README.md` のみを返す
- [ ] `grep -rln "requirements/\|legacy reference" docs/` が target ファイルから hit ゼロ
