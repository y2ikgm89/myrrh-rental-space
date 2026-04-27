# Claude Code Config Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.claude/{rules,skills,agents}` および `docs/` を公式ベストプラクティス（`code.claude.com/docs/en/{hooks,skills,sub-agents,settings}` + `docs.anthropic.com` Agent SDK）に準拠させ、stale 参照・重複定義・過剰権限・dead document を clean-break で削除する。後方互換シム禁止。

**Architecture:** 監査 → 削除/統合 → 検証の 3 phase。各 Bundle は独立 commit。controller が Bundle 完了ごとに `git status` + grep で独立検証してから次に進む。

**Scope（実装対象）:**

- `.claude/rules/` (48 ファイル, barrel + sub-files)
- `.claude/skills/` (32 SKILL.md)
- `.claude/agents/` (25 .md, frontmatter)
- `docs/architecture/` (ADR + reference docs)
- `docs/reference/` (claude-rules archive 候補)
- `docs/guides/` (重複コンテンツ検出)
- `docs/operations/` (stale ops doc)

**Tech Stack:** Claude Code 公式仕様（hooks/skills/sub-agents/settings）+ プロジェクト独自厳格化（ADR で記録）

**Affected files (file-structure plan):**

監査結果次第で削除/統合対象が確定するため、Task 完了時点で具体的なファイル列挙を `report.md` に追記する。

---

## Task 1: Skills 監査（`.claude/skills/`）

**Files:**

- Read: `.claude/skills/*/SKILL.md` (32 件)
- Reference: `code.claude.com/docs/en/skills` を WebFetch
- Output: 削除候補 / 統合候補 / フォーマット fix 候補のリスト

**Reasoning:** 32 skills は多すぎる可能性あり。本セッションで触れた `upgrade-deps` は良好（明確な workflow）だが、`integration-audit` / `audit-settings-sections` / `cache-audit` / `seed-audit` / `ssot-audit` / `adr-drift-audit` / `memory-staleness-audit` / `use-server-audit` の 8 audit skill は重複検出が必要。

- [ ] **Step 1: 公式 skills 仕様確認**
  - `WebFetch https://code.claude.com/docs/en/skills` で SKILL.md frontmatter 必須項目・推奨長さ・命名規則を取得
  - メモ: `description` 必須、本体 500 行未満推奨、`reference/*.md` / `data/*` への分割推奨

- [ ] **Step 2: 全 32 SKILL.md を Read して以下を集計**
  - 行数 (`wc -l`)
  - frontmatter 構造（`name` / `description` / `model`?）
  - 本文末尾の参照リンク有無
  - 過去 30 日の利用実績（`grep -r 'skill: <name>' ~/.claude/projects/*/transcripts/`）

- [ ] **Step 3: 重複/未使用 skill の削除候補リスト作成**
  - 8 audit skill の重複範囲を表で示す
  - 過去 30 日 0 invoke の skill を「削除候補」に分類
  - 結果を `docs/superpowers/specs/2026-04-27-claude-config-audit-skills.md` に出力

- [ ] **Step 4: 削除実行（ユーザー承認後）**
  - `python3 -c "import shutil; shutil.rmtree('.claude/skills/<name>')"` で各 skill 削除
  - commit: `chore(skills): remove N unused/duplicate skills (clean-break)`

---

## Task 2: Subagents 監査（`.claude/agents/`）

**Files:**

- Read: `.claude/agents/*.md` (25 件)
- Reference: `code.claude.com/docs/en/sub-agents` を WebFetch
- Output: tools 過剰付与 / `memory: project` 過剰付与 / 重複 reviewer のリスト

**Reasoning:** CLAUDE.md に「2026-04-23 監査で 10 agent 削除」の前例あり（unused `memory: project` 検出）。同パターンを再適用 + tools 最小権限 audit。

- [ ] **Step 1: 公式 sub-agents 仕様確認**
  - `WebFetch https://code.claude.com/docs/en/sub-agents` で frontmatter（`name` / `description` / `tools` / `model`）の必須/推奨を取得

- [ ] **Step 2: 全 25 agent.md frontmatter を grep**
  - `grep -A 10 '^---' .claude/agents/*.md` で frontmatter 一覧
  - `tools: *` ワイルドカードを grep（最小権限違反）
  - `memory: project` を持つ agent と `.claude/agent-memory/<name>/` の対応を verify

- [ ] **Step 3: 重複 reviewer の整理**
  - 監査範囲の重複（例: `react-compiler-reviewer` ↔ `project-reviewer`）を表化
  - 統合可能なものは 1 agent に集約 + 削除

- [ ] **Step 4: 削除/修正実行**
  - tools 過剰付与は最小権限へ書き換え
  - 未使用 `memory: project` を削除
  - commit: `refactor(agents): tighten tools permissions and remove dead memory: project`

---

## Task 3: Rules 監査（`.claude/rules/`）

**Files:**

- Read: `.claude/rules/**/*.md` (48 件)
- Output: barrel と sub-file の同期チェック / 500 行超 file の分割候補 / stale path 参照

**Reasoning:** `react-patterns.md` / `lexical-patterns.md` / `gsap-patterns.md` は barrel index で sub-file に分割済（`react/*`, `lexical/*`, `gsap/*`）。同パターンを 500 行超 rule に適用検討。

- [ ] **Step 1: ファイルサイズ集計**
  - `wc -l .claude/rules/**/*.md | sort -rn` で 200 行超を抽出
  - barrel index（`<topic>-patterns.md`）と sub-file の整合 verify

- [ ] **Step 2: stale path 参照検出**
  - `grep -rn 'src/[^ )]*' .claude/rules/` で参照されるパスを抽出
  - 各パスを `ls` で実在確認（FullCalendar 削除等の漏れ検出）

- [ ] **Step 3: 重複ルール検出**
  - 同一パターン（例: `useCallback 禁止`）が複数 rule に重複していないか
  - 重複は最も適切な 1 ファイルに集約 + 他は削除

- [ ] **Step 4: 修正実行**
  - 500 行超は sub-file に分割 + barrel index 化
  - stale path は更新 or 削除
  - 重複は SSoT 統合
  - commit: `refactor(rules): consolidate duplicate patterns and split N+ line files`

---

## Task 4: Docs 監査（`docs/`）

**Files:**

- Read: `docs/architecture/`, `docs/reference/`, `docs/guides/`, `docs/operations/`
- Output: archive 化候補 / SSoT vs ADR 重複 / stale doc

**Reasoning:** `docs/reference/claude-rules/*-reference.md` は `.claude/rules/**` の派生 archive で stale の可能性。`docs/architecture/` の design guide が ADR と重複している場合は ADR を SSoT として doc を削除。

- [ ] **Step 1: docs 構造マッピング**
  - 各 README.md を Read して目次の整合性を verify
  - `docs/reference/claude-rules/*` は `.claude/rules/**` との参照関係を tracelink
  - 古い design doc (`page-sections-design-guide.md` 等) と現行実装の乖離を grep

- [ ] **Step 2: ADR vs reference doc の重複検出**
  - 例: `next-cache-server-actions-review.md` ↔ ADR 0019 の重複範囲
  - ADR を SSoT として doc を archive or 削除

- [ ] **Step 3: 削除/archive 実行**
  - clean-break: 完了済 design doc を削除
  - 必要なら `docs/architecture/archive/` に移動
  - commit: `docs: archive completed design docs and consolidate duplicates with ADRs`

---

## Task 5: 検証 + 統合 commit

- [ ] **Step 1: validate**
  - `bun run validate` exit 0 確認（rules 削除が autoload に影響していないか）

- [ ] **Step 2: MEMORY.md / Serena memory 同期**
  - 削除した skills/agents/rules への参照を `~/.claude/projects/<slug>/memory/` と `.serena/memories/` から削除
  - `/memory-staleness-audit` skill を invoke して stale 参照を一掃

- [ ] **Step 3: 完了報告**
  - 削除総数 + 削除 commit SHA を報告
  - 本 plan ファイルを削除（clean-break per ADR 0015）

---

## Out of scope（このプランでは扱わない）

- ADR の遡及修正（採択済 ADR は historical record として保持）
- `.claude/settings.json` / hook scripts の改修（ADR で別途扱う）
- `prisma/seed.ts` / `__tests__/` の構造改善（別 plan）

---

## 完了条件

- [ ] Task 1-5 全 step 完了
- [ ] `bun run validate` exit 0
- [ ] CLAUDE.md / MEMORY.md / Serena memory に stale 参照なし
- [ ] 各 Bundle が独立 commit で revertable
- [ ] 本 plan ファイル削除（clean-break）
