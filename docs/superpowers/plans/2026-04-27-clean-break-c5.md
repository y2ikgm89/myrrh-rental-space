# Clean-Break Refactor C5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** skills / rules / subagents / docs を公式ベストプラクティス準拠で L3+L4 (積極的削除 + 階層構造再考) clean-break refactor する。

**Architecture:** 4 phase 順次 dispatch (C5b → C5c → C5a → C5d)。各 phase = 1 implementer dispatch で複数 commit 完成、controller が phase 別 commit に分離。Reviewer は phase 完了ごとに combined dispatch (spec compliance + code quality 1 prompt)。

**Tech Stack:** Markdown frontmatter (YAML), `.claude/{rules,skills,agents}/`, `docs/architecture/decisions/`, `docs/superpowers/{specs,plans}/`, `scripts/verify-policy-docs.mjs`, `bun run validate`.

**Spec:** `docs/superpowers/specs/2026-04-27-clean-break-c5-design.md` — ground truth として実装中に参照。

**ADR 採番:** 0025 (subagent dispatch template SSoT) + 0026 (skill naming convention)。各 phase 開始時に `ls docs/architecture/decisions/00*.md | tail -1` で再確認。

---

## Phase 共通 dispatch 規律

各 phase の implementer dispatch prompt に以下を含める:

```
🚫 Git 全面禁止 (add / commit / push / reset / checkout / restore / stash すべて NG)
編集のみ許可。controller が phase 完了後に commit する。

🔧 Path alias は 3 系統のみ:
  @/admin/* → src/app/(admin)/admin/(dashboard)/_shared/*
  @/public/* → src/app/(public)/_shared/*
  @/shared/* → src/shared/*
  「@/admin/_shared/X」のような二重 prefix は誤り。

📋 Plan deviation: plan 記載 identifier と実装が乖離していれば
justified deviation として保持し報告 (強制 rename 禁止)。

📊 完了報告フォーマット:
  ## 編集ファイル
  - <path>: <変更概要>
  ## 新規作成ファイル
  - <path>: <目的>
  ## 削除ファイル
  - <path>: <削除理由>
  ## DEVIATION
  - (なければ「なし」と明記)
  ## VERIFICATION
  - <controller が確認すべき grep / ls コマンド>
```

各 phase 完了後 controller は 3 段検証:

1. `git status --short` で modifications + untracked 列挙
2. `wc -l` で対象ファイルの行数 delta 確認
3. `grep` で期待 symbol 存在 + 削除 symbol 不在を確認

---

## Phase 1: C5b — Rules audit + barrel-index 拡張 (5 commits)

**目的:** Rules を SSoT として安定化させ、後続 phase の dispatch prompt + docs 修正の参照基盤を整える。

**dispatch 単位:** 1 implementer (sonnet) で Task 1.1〜1.5 を順次実施し、controller が commit boundary で 5 commit に分離。

### Task 1.1: Stale rule + paths gap investigation (read-only)

**Files:** read-only, no edits.

- [ ] **Step 1: 全 rule docs の paths frontmatter 状態を grep**

```bash
for f in $(find .claude/rules -name "*.md"); do
  has_paths=$(grep -l "^paths:" "$f" || true)
  if [ -z "$has_paths" ]; then
    echo "[NO paths] $f"
  fi
done
```

Expected output: paths frontmatter のない rule docs リスト。各 file について以下の判定基準で「漏れ」かどうか確定する:

- **漏れと判定**: rule docs 本文で `src/` 配下の具体的パターン (`enums/guards.ts` / `domain/` / `actions/` 等) を言及している、または該当 path で編集する際に load されるべき内容を持つ
- **漏れではない**: rule docs が project-wide な原則 (例: SSOT 哲学 / 命名規則 ADR 等) を扱い特定 path に紐付かない

判定理由は /tmp/c5b-investigation.md に記録。

- [ ] **Step 2: rule docs に書かれた helper / API 名を抽出**

```bash
grep -rohE '`[a-z][a-zA-Z]+\(\)`' .claude/rules/ | sort -u > /tmp/c5b-rule-helpers.txt
wc -l /tmp/c5b-rule-helpers.txt
```

Expected: rule docs で言及されている関数名一覧。

- [ ] **Step 3: 各 helper が src/ に存在するか cross-grep**

```bash
while read helper; do
  name=$(echo "$helper" | tr -d '`()' )
  count=$(grep -rln "$name" src/ 2>/dev/null | wc -l)
  if [ "$count" = "0" ]; then
    echo "[STALE] $helper — 0 references in src/"
  fi
done < /tmp/c5b-rule-helpers.txt
```

Expected: src/ に存在しない（stale な）helper 名リスト。

- [ ] **Step 4: 結果を /tmp/c5b-investigation.md にまとめて controller に報告**

Format:

```
## paths gap (N files)
- <path>: <推奨 paths>

## stale helpers (N)
- <helper>: <発見した rule file>

## tailwind-patterns.md 分割案
- <subtopic>.md: <該当行範囲>

## zod-patterns.md 分割案
- <subtopic>.md: <該当行範囲>
```

- [ ] **Step 5: Implementer 報告 → controller が承認 → Task 1.2 に進む (commit なし、investigation のみ)**

### Task 1.2: tailwind-patterns.md を barrel-index 化

**Files:**

- Modify: `.claude/rules/tailwind-patterns.md` (569 → ~50 行に縮小)
- Create: `.claude/rules/tailwind-patterns/<subtopic>.md` (4-6 sub-files)

**参考:** 既存 barrel-index 適用例は `react-patterns.md` (親) + `react/<subtopic>.md` 配下を参照。

- [ ] **Step 1: 親 file の最終形フォーマットを確認**

`react-patterns.md` を read してフォーマット (frontmatter `paths:` + sub-file links のみ) を確認。

- [ ] **Step 2: subtopic 分割案を確定 (Task 1.1 投資結果から)**

例: `tailwind-patterns/`

- `responsive-breakpoints.md` (md/lg/xl 使用基準)
- `container-queries.md` (@container / @md/main: 等)
- `grid-overlap.md` (col-start cell overlap pattern)
- `inline-style-vs-arbitrary.md` (Tailwind v4 specificity)
- `theme-tokens.md` (@theme arbitrary 値昇格)

- [ ] **Step 3: sub-file を新規作成 (該当行を移植 + frontmatter 追加)**

Frontmatter テンプレート:

```yaml
---
paths:
  - src/**/*.tsx
  - src/**/*.ts
  - src/**/*.css
---
# <Subtopic Title>

<元の本文>
```

- [ ] **Step 4: 親 `tailwind-patterns.md` を縮小**

新フォーマット:

```yaml
---
paths:
  - src/**/*.tsx
  - src/**/*.ts
  - src/**/*.css
---

# Tailwind 4 パターン

> **Barrel-index:** 各 subtopic は path-scoped autoload で連鎖ロードされる。

- [Responsive breakpoints](tailwind-patterns/responsive-breakpoints.md)
- [Container queries](tailwind-patterns/container-queries.md)
- [Grid overlap](tailwind-patterns/grid-overlap.md)
- [Inline style vs arbitrary properties](tailwind-patterns/inline-style-vs-arbitrary.md)
- [Theme tokens](tailwind-patterns/theme-tokens.md)
```

- [ ] **Step 5: 移行漏れ確認**

```bash
diff <(git show HEAD:.claude/rules/tailwind-patterns.md | wc -l) <(cat .claude/rules/tailwind-patterns.md .claude/rules/tailwind-patterns/*.md | wc -l)
```

Expected: 新側が +N (frontmatter 分のみ増加)。元コンテンツ消失なし。

- [ ] **Step 6: Implementer 完了報告 → controller が commit**

Commit message:

```
refactor(rules): tailwind-patterns.md を barrel-index 化

569 行を 5 subtopic (responsive-breakpoints / container-queries / grid-overlap /
inline-style-vs-arbitrary / theme-tokens) に分割。親 file は paths frontmatter +
sub-file links のみ。autoload chain 維持。

C5b Task 1.2
```

### Task 1.3: zod-patterns.md を barrel-index 化

**Files:**

- Modify: `.claude/rules/zod-patterns.md` (746 → ~50 行)
- Create: `.claude/rules/zod-patterns/<subtopic>.md` (5-7 sub-files)

- [ ] **Step 1〜6: Task 1.2 と同手順で zod-patterns.md を分割**

subtopic 分割案 (Task 1.1 投資結果に従う):

- `validation-schemas.md` (基本 schema 構築)
- `error-formatting.md` (`error:` パラメータ + safeParse)
- `cross-field-refine.md` (top-level refine pattern)
- `array-uniqueness.md` (`.refine()` での重複拒否)
- `metadata-registry.md` (`z.registry<T>().register(schema, meta)`)
- `enum-and-literals.md` (parseAsStringLiteral + isValid\* gate)

Commit message:

```
refactor(rules): zod-patterns.md を barrel-index 化

746 行を 6 subtopic に分割。親 file は paths frontmatter + sub-file links のみ。

C5b Task 1.3
```

### Task 1.4: paths frontmatter 漏れ補完

**Files:**

- Modify: Task 1.1 で発見した paths 欠落 rule docs (件数は investigation 結果次第)

- [ ] **Step 1: 各漏れ file に paths frontmatter を追記**

例 (`type-safety.md` が漏れていた場合):

```yaml
---
paths:
  - src/**/*.ts
  - src/**/*.tsx
---
```

判定基準: rule docs 本文で言及されている src/ 配下のパターン (例: `enums/guards.ts`, `domain/`, `actions/`) に対して `paths:` で広く auto-load される設定。

- [ ] **Step 2: 全 rule docs の paths 適用率を再 grep で確認**

```bash
total=$(find .claude/rules -name "*.md" | wc -l)
with_paths=$(grep -rl "^paths:" .claude/rules/ | wc -l)
echo "$with_paths / $total ($(( with_paths * 100 / total ))%)"
```

Expected: 100% に到達 (barrel parent も sub-file も全て paths を持つ)。

- [ ] **Step 3: Commit**

Commit message:

```
refactor(rules): paths frontmatter 漏れを補完 (autoload 適用率 100% 化)

Task 1.1 investigation で検出した N 件の paths gap を補完。rule docs が
適切な src パスから path-scoped autoload されるよう統一。

C5b Task 1.4
```

### Task 1.5: Stale rule docs 削除/更新 + AGENTS.md 同期

**Files:**

- Modify or Delete: Task 1.1 で発見した stale rule docs (helper 名が src/ にゼロ参照のもの)
- Modify: `AGENTS.md` (該当節)

- [ ] **Step 1: stale 判定**

Task 1.1 の stale helper リストを再検証:

```bash
# 各 stale helper について最終確認 (絞り込み: テストファイル除外)
grep -rln "<helper-name>" src/ --include="*.ts" --include="*.tsx" | grep -v __tests__
```

ゼロ件の helper を rule docs から削除対象とする。残存している場合は rule 側の記述更新。

- [ ] **Step 2: rule docs から stale 記述を削除 (または更新)**

削除パターン: stale helper のみ言及している段落 / 表行は丸ごと削除。
更新パターン: 段落内の一部のみ stale なら該当文を削除し前後を繋げる。

- [ ] **Step 3: AGENTS.md 同期**

```bash
node scripts/verify-policy-docs.mjs
```

Expected: byte-identical 検証成功。失敗した場合は AGENTS.md の対応セクションを CLAUDE.md / rule docs と同期。

- [ ] **Step 4: bun run validate**

```bash
bun run validate
```

Expected: type-check + lint 成功。

- [ ] **Step 5: Commit**

Commit message:

```
refactor(rules): stale rule docs 削除 + AGENTS.md 同期

src/ に参照ゼロな helper 名 N 件を rule docs から削除。AGENTS.md の対応
セクションを CLAUDE.md と byte-identical 同期。

C5b Task 1.5
```

### Phase 1 完了 reviewer

- [ ] **Reviewer dispatch (combined: spec compliance + code quality)**

Prompt template:

```
Review Phase 1 (C5b) commits against spec docs/superpowers/specs/2026-04-27-clean-break-c5-design.md §3.1.

Verify:
1. tailwind-patterns.md / zod-patterns.md が barrel-index 化されているか (親 file が paths + links のみ)
2. paths frontmatter 適用率が 100% か
3. stale rule 削除後の参照漏れがないか (`grep -rn "<deleted-name>" .claude/ docs/ CLAUDE.md`)
4. AGENTS.md 同期成功 (`node scripts/verify-policy-docs.mjs`)
5. bun run validate 成功

Return JSON:
{
  "spec_compliance": { "verdict": "PASS|NEEDS_CHANGES", "issues": [...] },
  "code_quality": { "verdict": "PASS|NEEDS_CHANGES", "issues": [...] },
  "overall_verdict": "PASS|NEEDS_CHANGES"
}
```

NEEDS_CHANGES なら controller が該当 task に戻って修正、再 dispatch。

---

## Phase 2: C5c — Subagents canonical + dispatch-template 抽出 (4 commits)

**目的:** Subagent frontmatter を公式 canonical 形式に統一し、dispatch prompt template を skill 化。

**dispatch 単位:** 1 implementer (sonnet) で Task 2.1〜2.4 を順次実施。

### Task 2.1: Agent frontmatter compliance + usage investigation (read-only)

**Files:** read-only.

- [ ] **Step 1: 全 agent の frontmatter 形式チェック**

```bash
for f in .claude/agents/*.md; do
  name=$(grep -m1 "^name:" "$f" | sed 's/name: //')
  desc=$(grep -m1 "^description:" "$f" | wc -c)
  tools_lines=$(awk '/^tools:/,/^[a-z]+:/' "$f" | grep -c "^  -" || echo 0)
  model=$(grep -m1 "^model:" "$f" | sed 's/model: //')
  memory=$(grep -m1 "^memory:" "$f" | sed 's/memory: //')

  issues=""
  [ "$tools_lines" -gt 0 ] && issues="$issues YAML_LIST_TOOLS"
  [ -z "$model" ] && issues="$issues NO_MODEL"
  [ "$model" = "haiku" ] && issues="$issues HAIKU_FORBIDDEN"

  echo "$f | $name | $model | memory=$memory | issues=$issues"
done
```

Expected: agent ごとの frontmatter 状態。`YAML_LIST_TOOLS` は comma-separated に変換対象、`NO_MODEL` は `model: sonnet` 追加対象。

- [ ] **Step 2: 各 agent の利用実績を grep**

```bash
for f in .claude/agents/*.md; do
  name=$(basename "$f" .md)
  refs=$(grep -rln "subagent_type=\"$name\"\|subagent_type='$name'" .claude/ docs/ CLAUDE.md AGENTS.md 2>/dev/null | wc -l)
  echo "$name: $refs references"
done | sort -k2 -n
```

Expected: 利用実績ゼロ (refs=0) な agent リスト = 削除候補。

- [ ] **Step 3: memory: project の backing dir / body Memory 節 cross-check**

```bash
for f in .claude/agents/*.md; do
  has_memory_field=$(grep -c "^memory: project" "$f")
  [ "$has_memory_field" = "0" ] && continue
  name=$(basename "$f" .md)
  has_dir=$([ -d ".claude/agent-memory/$name" ] && echo "yes" || echo "no")
  has_body=$(grep -c "^## Memory" "$f")
  echo "$name: dir=$has_dir, body=$has_body"
done
```

Expected: dir=no かつ body=0 な agent は `memory: project` 削除対象。

- [ ] **Step 4: 結果を /tmp/c5c-investigation.md にまとめて controller に報告**

Format:

```
## frontmatter 修正対象
- <agent>: <issue>

## 削除候補 agent (利用実績ゼロ)
- <agent>

## memory: project 削除対象
- <agent>

## CLAUDE.md「Subagent 規律」節の dispatch prompt 抽出範囲
- 該当行範囲: CLAUDE.md L<start>-L<end>
```

- [ ] **Step 5: Implementer 報告 → controller 承認 → Task 2.2 へ (commit なし)**

### Task 2.2: Frontmatter canonical 化 (25 agents)

**Files:**

- Modify: `.claude/agents/*.md` (Task 2.1 で frontmatter 修正対象と判定された agents)

- [ ] **Step 1: YAML list `tools:` を comma-separated 単行へ変換**

Before:

```yaml
tools:
  - Read
  - Grep
  - Glob
```

After:

```yaml
tools: Read, Grep, Glob
```

- [ ] **Step 2: 不足 frontmatter 補完**

- `model:` 欠落 → `model: sonnet` 追加 (description の trigger 文から implementer か reviewer か判定不能なら sonnet 既定)
- `description:` の trigger phrase 統一 (`Use proactively when ...` または「～した後に使用」)

- [ ] **Step 3: memory: project 整合**

Task 2.1 Step 3 で削除対象と判定された agent から `memory: project` フィールドを削除。

- [ ] **Step 4: 検証**

```bash
# 全 agent が canonical 形式かを再 grep
for f in .claude/agents/*.md; do
  bad=$(awk '/^tools:/,/^[a-z]+:/' "$f" | grep -c "^  -" || echo 0)
  [ "$bad" -gt 0 ] && echo "[FAIL] $f still has YAML list tools"
done
```

Expected: 出力ゼロ。

- [ ] **Step 5: Commit**

Commit message:

```
refactor(agents): frontmatter を公式 canonical 形式に統一

全 agent の tools を YAML list → comma-separated 単行へ変換。model: sonnet
を欠落 agent に追加。memory: project の backing dir / body Memory 節を持た
ない agent から該当フィールドを削除 (2026-04-23 既実施分の続き)。

C5c Task 2.2
```

### Task 2.3: 利用実績ゼロ agent 削除 + 参照修正

**Files:**

- Delete: `.claude/agents/<unused-agent>.md` (Task 2.1 Step 2 で refs=0 と判定された agents)
- Modify: `CLAUDE.md` (「自動ロード」節 + reviewer dispatch 例)

- [ ] **Step 1: 削除候補 agent を再確認**

```bash
# Task 2.1 結果を再 grep で再現
```

- [ ] **Step 2: ファイル削除**

```bash
git rm .claude/agents/<unused-agent>.md
```

- [ ] **Step 3: 参照修正**

```bash
# CLAUDE.md / AGENTS.md / 他 docs で削除 agent 名が残らないか
for name in <deleted-agents>; do
  grep -rn "$name" .claude/ docs/ CLAUDE.md AGENTS.md 2>/dev/null | grep -v "^\.claude/agents/$name\.md"
done
```

Expected: 出力ゼロ。残ってれば該当 file を Edit して削除。

- [ ] **Step 4: bun run validate**

Expected: 成功。

- [ ] **Step 5: Commit**

Commit message:

```
refactor(agents): 利用実績ゼロ agent N 件を削除 + 参照修正

CLAUDE.md / docs に subagent_type で参照されていない agent を削除。
CLAUDE.md「自動ロード」節 + reviewer dispatch 例も同 commit で更新。

削除対象: <agent-name-list>

C5c Task 2.3
```

### Task 2.4: subagent-dispatch-template skill 新設 + ADR 0025 + CLAUDE.md 短縮

**Files:**

- Create: `.claude/skills/subagent-dispatch-template/SKILL.md`
- Create: `docs/architecture/decisions/0025-subagent-dispatch-template-ssot.md`
- Modify: `CLAUDE.md` (「Subagent 規律」節短縮)
- Modify: `docs/architecture/decisions/README.md` (0025 entry 追加)

- [ ] **Step 1: ADR 採番再確認**

```bash
ls docs/architecture/decisions/00*.md | tail -1
git worktree list
```

Expected: 最新 0024、並走 worktree なし → 0025 確定。

- [ ] **Step 2: subagent-dispatch-template/SKILL.md 作成**

```yaml
---
name: subagent-dispatch-template
description: subagent-driven-development や Agent tool で implementer / reviewer subagent を dispatch する際の prompt template SSoT。git 全面禁止 / import alias 3 系統 / plan deviation policy / 完了報告フォーマットを規律として強制する。
when_to_use: subagent-driven-development skill 実行時、または Agent tool で implementer / reviewer を dispatch する直前に参照。
---
# Subagent Dispatch Template

## Implementer prompt 必須項目

(本文は CLAUDE.md「Subagent 規律」節から移植)
...
```

- [ ] **Step 3: ADR 0025 作成**

```markdown
# 0025 — Subagent dispatch template SSoT を skill 化

- Status: Accepted
- Date: 2026-04-27
- Deciders: Claude Code controller / project owner

## Context

CLAUDE.md「Subagent 規律」節に dispatch prompt template (git 全面禁止 / import
alias / plan deviation policy / 完了報告フォーマット) が散在しており、新規
plan 作成時に毎回 controller が手動で複製していた。

## Decision

`subagent-dispatch-template` skill を新設し、CLAUDE.md からは「→ skill 参照」
の 1 行で短縮する。Skill 本体に dispatch prompt の SSoT を集約。

## Consequences

- Plan 作成時の dispatch prompt は skill content を直接 invoke / 参照
- CLAUDE.md「Subagent 規律」節は規律 list (git 禁止理由 / 検証 3 段階等) のみ残す
- 規律変更は skill 1 箇所更新で完結
```

- [ ] **Step 4: CLAUDE.md 短縮**

「Subagent 規律」節の dispatch prompt template 部分を以下に置換:

```markdown
- **Implementer dispatch prompt の SSoT** — `.claude/skills/subagent-dispatch-template/SKILL.md` 参照。git 全面禁止 / import alias 3 系統 / plan deviation policy / 完了報告フォーマットを skill 1 箇所で管理 (ADR 0025)
```

規律 list (検証 3 段階 / sonnet 以上 / parallel 後の 3 段検証 等) は残す。

- [ ] **Step 5: ADR README に 0025 entry 追加**

```markdown
| 0025 | [Subagent dispatch template SSoT](0025-subagent-dispatch-template-ssot.md) | Accepted | 2026-04-27 |
```

- [ ] **Step 6: bun run validate + verify-policy-docs**

```bash
bun run validate
node scripts/verify-policy-docs.mjs
```

Expected: 両方成功。

- [ ] **Step 7: Commit**

Commit message:

```
feat(skills): subagent-dispatch-template skill 新設 + ADR 0025

CLAUDE.md「Subagent 規律」節に散在していた dispatch prompt template を
skill として SSoT 化。CLAUDE.md からは「→ skill 参照」1 行で短縮。
ADR 0025 で SSoT 移管を記録。

C5c Task 2.4
```

### Phase 2 完了 reviewer

- [ ] **Reviewer dispatch (combined)**

Prompt: Phase 1 reviewer template の Phase 2 版。spec §3.2 / §4.1 C5c を check。

---

## Phase 3: C5a — Skills new fields + responsibility merge (5 commits)

**目的:** Skills に公式新フィールドを戦略的適用、責務重複解消、命名規則統一。

**dispatch 単位:** 1 implementer (sonnet) で Task 3.1〜3.5 を順次実施。

### Task 3.1: Skill duplication + naming investigation (read-only)

**Files:** read-only.

- [ ] **Step 1: 全 skill の frontmatter 取得**

```bash
for f in .claude/skills/*/SKILL.md; do
  name=$(grep -m1 "^name:" "$f" | sed 's/name: //')
  desc=$(grep -m1 "^description:" "$f" | wc -c)
  has_when=$(grep -c "^when_to_use:" "$f")
  has_arghint=$(grep -c "^argument-hint:" "$f")
  has_disable=$(grep -c "^disable-model-invocation:" "$f")
  has_paths=$(grep -c "^paths:" "$f")
  echo "$name | desc=${desc}c | when=$has_when | arghint=$has_arghint | disable=$has_disable | paths=$has_paths"
done
```

Expected: 各 skill のフィールド適用状態。description が 1,536 char 超過 (truncate されてしまう) skill は要短縮。

- [ ] **Step 2: 命名 prefix 分析**

```bash
ls .claude/skills/ | awk -F- '{print $1}' | sort | uniq -c | sort -rn
```

Expected: prefix 分布 (`add-` 2, `create-` 3, `audit-` 4, `cloud-` 1, `google-` 1, ... 等)。`*-debug` 群と `audit-*` 群が混在 prefix なら統一対象。

- [ ] **Step 3: 責務重複候補の精査**

```bash
# add-prisma-enum と add-settings-field の本文比較
diff <(cat .claude/skills/add-prisma-enum/SKILL.md) <(cat .claude/skills/add-settings-field/SKILL.md)

# lexical-* 3 skill の本文比較
wc -l .claude/skills/lexical-{node,plugin,toolbar}/SKILL.md
```

Expected: 共通する scaffolding 手順、または明確に独立した手順、を判定。

- [ ] **Step 4: lexical-\* 統合可否の 3 択判定**

候補:

- (a) **merge**: 1 skill `lexical-add` に統合、内部で type 引数 (node / plugin / toolbar) で分岐
- (b) **階層化**: barrel pattern で `lexical/` dir 配下に `node.md` / `plugin.md` / `toolbar.md` + 親 `SKILL.md` でルーティング
- (c) **現状維持**: 独立した責務として保持

判定基準:

- 共通 scaffolding が 70%+ → (a) merge
- 共通 30-70% → (b) 階層化
- 共通 30%- → (c) 現状維持

- [ ] **Step 5: rename mapping 作成**

```
*-debug 群 (cloud-run-debug / google-calendar-debug / instagram-debug / stripe-debug / turbopack-hmr) → debug-* prefix
  - cloud-run-debug → debug-cloud-run
  - google-calendar-debug → debug-google-calendar
  - instagram-debug → debug-instagram
  - stripe-debug → debug-stripe
  - turbopack-hmr → debug-turbopack (HMR は debug 文脈)

audit-* 群 (cache-audit / lexical-audit / seed-audit / ssot-audit / use-server-audit / memory-staleness-audit / adr-drift-audit / integration-audit / audit-settings-sections) は既に audit prefix → 命名一貫性確認のみ
```

- [ ] **Step 6: 結果を /tmp/c5a-investigation.md にまとめて controller に報告**

Format:

```
## 新フィールド適用候補
### when_to_use 追加
- <skill>: <理由>

### argument-hint 追加
- <skill>: <hint 文字列>

### disable-model-invocation: true 追加
- <skill>: <理由>

## 責務重複統合
### add-prisma-enum + add-settings-field
- <merge / 共通化 / 現状維持> + 理由

### lexical-* (3 skills)
- <a/b/c> + 理由

## rename mapping
- <old> → <new>: <理由>

## description 1,536 char 超過
- <skill>: <文字数>
```

- [ ] **Step 7: controller 承認 → Task 3.2 へ (commit なし)**

### Task 3.2: 新フィールド戦略的適用

**Files:**

- Modify: `.claude/skills/<skill>/SKILL.md` (Task 3.1 結果に従う複数 skill)

- [ ] **Step 1: when_to_use 追加対象 skill に適用**

例:

```yaml
---
name: prisma-migration
description: ...
when_to_use: schema.prisma 編集後、bunx --bun prisma migrate dev で migration 作成する直前。db-migration-reviewer agent の前段として使う。
---
```

- [ ] **Step 2: argument-hint 追加対象 skill に適用**

例:

```yaml
---
name: split-action-file
description: ...
argument-hint: <action-file-path>
---
```

- [ ] **Step 3: disable-model-invocation: true 適用**

人間 trigger 限定 skill (debug-\* 系 / turbopack-hmr 等) に追加:

```yaml
---
name: debug-cloud-run
description: ...
disable-model-invocation: true
---
```

理由: これらは開発者が状況判断して呼ぶ skill であり、autoload で誤起動するとデバッグ context を汚染する。

- [ ] **Step 4: description 1,536 char 超過 skill を短縮**

該当 skill (Task 3.1 Step 1 結果) の description を 1,536 char 以内に圧縮。詳細は本文に移動。

- [ ] **Step 5: bun run validate**

Expected: 成功。

- [ ] **Step 6: Commit**

Commit message:

```
feat(skills): when_to_use / argument-hint / disable-model-invocation を戦略的適用

- when_to_use: triggering precision 不足 N 件に追加
- argument-hint: 引数取る skill N 件に追加
- disable-model-invocation: 人間 trigger 限定 skill N 件に true 設定
- description 1,536 char 超過 N 件を短縮

C5a Task 3.2
```

### Task 3.3: lexical-\* 統合可否の決定 + 適用

**Files:** Task 3.1 Step 4 の決定に従う。

- [ ] **Step 1: 決定された案 (a/b/c) を適用**

(a) merge の場合:

```bash
mkdir .claude/skills/lexical-add
# lexical-{node,plugin,toolbar} の content を統合
# 旧 dir 3 件を削除
git rm -r .claude/skills/lexical-{node,plugin,toolbar}/
```

(b) 階層化の場合: barrel-pattern 適用 (rules barrel-index と同手法)

(c) 現状維持の場合: Task 3.3 を skip (Task 3.4 へ)

- [ ] **Step 2: 参照修正**

```bash
grep -rn "lexical-node\|lexical-plugin\|lexical-toolbar" .claude/ docs/ CLAUDE.md AGENTS.md
```

Expected: 旧 skill 名残存ゼロ (Task 3.5 で再 sweep するが先行修正)。

- [ ] **Step 3: Commit (該当案を適用した場合のみ)**

Commit message例 ((a) の場合):

```
refactor(skills): lexical-{node,plugin,toolbar} を lexical-add に統合

3 skill の共通 scaffolding を 1 skill にマージ、内部で type 引数 (node /
plugin / toolbar) で分岐。責務重複解消。命名規則 add-* prefix に統一。

C5a Task 3.3
```

### Task 3.4: rename: _-debug → debug-_ (audit-\* も統一確認)

**Files:**

- Rename (git mv): `.claude/skills/cloud-run-debug` → `.claude/skills/debug-cloud-run`、他 4 件
- Modify: 各 SKILL.md の `name:` フィールド

- [ ] **Step 1: dir + name フィールド rename**

```bash
git mv .claude/skills/cloud-run-debug .claude/skills/debug-cloud-run
# SKILL.md の name: を更新
# 5 skill 全て同様に
```

- [ ] **Step 2: audit-\* 群の命名一貫性確認**

`audit-settings-sections` のみ `audit-` prefix 単発、他は `cache-audit` / `lexical-audit` 等 suffix 形式。これを統一する場合:

```bash
git mv .claude/skills/cache-audit .claude/skills/audit-cache
git mv .claude/skills/lexical-audit .claude/skills/audit-lexical
git mv .claude/skills/seed-audit .claude/skills/audit-seed
git mv .claude/skills/ssot-audit .claude/skills/audit-ssot
git mv .claude/skills/use-server-audit .claude/skills/audit-use-server
git mv .claude/skills/memory-staleness-audit .claude/skills/audit-memory-staleness
git mv .claude/skills/adr-drift-audit .claude/skills/audit-adr-drift
git mv .claude/skills/integration-audit .claude/skills/audit-integration
# audit-settings-sections は既に prefix なので変更不要
```

決定: `audit-*` prefix 統一を採用 (ADR 0026 で formalize)。

- [ ] **Step 3: name フィールド更新**

各 SKILL.md の `name:` を新 dir 名と一致させる。

- [ ] **Step 4: bun run validate**

- [ ] **Step 5: Commit**

Commit message:

```
refactor(skills): naming 規則統一 — *-debug → debug-*、*-audit → audit-*

ADR 0026 (skill naming convention) に従い prefix 統一:
- 5 debug skills: cloud-run-debug 等 → debug-* prefix
- 8 audit skills: cache-audit 等 → audit-* prefix

C5a Task 3.4
```

### Task 3.5: ADR 0026 + add-prisma-enum/add-settings-field 共通化 + 全参照修正

**Files:**

- Create: `docs/architecture/decisions/0026-skill-naming-convention.md`
- Modify: `docs/architecture/decisions/README.md`
- Modify: `add-prisma-enum/SKILL.md` + `add-settings-field/SKILL.md` (or merge)
- Modify: 全参照箇所 (CLAUDE.md / docs / 他 skill / agents)

- [ ] **Step 1: ADR 0026 作成**

```markdown
# 0026 — Skill naming convention

- Status: Accepted
- Date: 2026-04-27

## Decision

Skill naming convention:

- `add-*`: 新規リソース追加 (DB enum / settings field 等)
- `create-*`: scaffolding (admin page / page content / server action 等)
- `audit-*`: 監査・検出 (cache / seed / ssot / use-server / memory-staleness / etc)
- `debug-*`: 環境/サービス診断 (cloud-run / google-calendar / instagram / stripe / turbopack)
- `<topic>` (no prefix): 機能・カテゴリ skill (frontend-design / parallax-section / ui-ux-pro-max / etc)

## Consequences

- 旧 _-debug / _-audit / 単発 audit-\* skill は新 prefix に rename (commit `<rename-sha>`)
- 新規 skill 作成時は本規則に従う
- 例外は ADR で正当化が必要
```

- [ ] **Step 2: ADR README に 0026 entry 追加**

- [ ] **Step 3: add-prisma-enum / add-settings-field 共通化判定の適用**

Task 3.1 Step 3 の結果に従う:

- 高重複 (70%+) → merge
- 中重複 (30-70%) → 共通 reference file 抽出 (`reference/scaffold-common.md`)
- 低重複 (-30%) → 現状維持

- [ ] **Step 4: 全参照修正 (Phase 完了 sweep)**

```bash
# 旧 skill 名が残ってないか確認
for old in cloud-run-debug google-calendar-debug instagram-debug stripe-debug turbopack-hmr cache-audit lexical-audit seed-audit ssot-audit use-server-audit memory-staleness-audit adr-drift-audit integration-audit; do
  refs=$(grep -rn "$old" .claude/ docs/ CLAUDE.md AGENTS.md 2>/dev/null | grep -v "$old.md:" | wc -l)
  [ "$refs" -gt 0 ] && echo "[FAIL] $old still has $refs refs"
done
```

Expected: 出力ゼロ。残ってれば該当 file を Edit。

特に以下の SSoT は手動確認必須 (grep で hits があった場合は同 commit 内で update):

- `CLAUDE.md`「自動ロード」節の skill name 列挙 / `## ハードルール` 内の skill 言及
- `AGENTS.md` の対応セクション (CLAUDE.md と byte-identical)
- `docs/architecture/decisions/README.md` 内の skill 参照
- 他 skill (`SKILL.md` body 内の cross-reference)
- 他 agent (`.claude/agents/*.md` body 内 dispatch 例)

- [ ] **Step 5: Live activation テスト**

新 skill 名 1 件 (例 `/audit-cache`) を起動して機能確認 (controller 手動)。

- [ ] **Step 6: bun run validate + verify-policy-docs**

- [ ] **Step 7: Commit**

Commit message:

```
docs(adr): 0026 skill naming convention + add-* 共通化 + 全参照修正

ADR 0026 で skill naming convention (add-* / create-* / audit-* / debug-*)
を formalize。add-prisma-enum / add-settings-field の共通 scaffolding を
<merge / reference 化 / 現状維持>。CLAUDE.md / docs / 他 skill から旧 skill
名参照を一斉修正。

C5a Task 3.5
```

### Phase 3 完了 reviewer

- [ ] **Reviewer dispatch (combined)**

Prompt: Phase 1 reviewer template の Phase 3 版。spec §3.3 / §4.1 C5a を check。

---

## Phase 4: C5d — Docs audit + cleanup (6 commits)

**目的:** docs/ 整合性、archive 判定、dangling link 削除、version drift 修正。

**dispatch 単位:** 1 implementer (sonnet) で Task 4.1〜4.6 を順次実施。

### Task 4.1: ADR README index 同期 audit + 修正

**Files:**

- Modify: `docs/architecture/decisions/README.md`

- [ ] **Step 1: ADR file 数と README index 行数を比較**

```bash
file_count=$(ls docs/architecture/decisions/00*.md | wc -l)
index_count=$(grep -cE "^\| \[00" docs/architecture/decisions/README.md)
echo "files=$file_count, index=$index_count, expected_diff=1 (template 含む)"
```

Expected: `file_count = index_count` (template が別行扱いなら +1)。

- [ ] **Step 2: 各 ADR が README に index されているか cross-grep**

```bash
for f in docs/architecture/decisions/00*.md; do
  num=$(basename "$f" | cut -c1-4)
  found=$(grep -c "^\| \[$num\]" docs/architecture/decisions/README.md)
  [ "$found" = "0" ] && echo "[MISSING] $num not in README"
done
```

Expected: 出力ゼロ。出力あれば README に追加。

- [ ] **Step 3: index 順序 (採番順) 確認 + 必要なら整列**

- [ ] **Step 4: Commit**

Commit message:

```
docs(adr): README index 同期 — 漏れ N 件追加 + 採番順整列

ADR file N 件のうち README index 漏れ M 件を追加。表行を採番順に整列。

C5d Task 4.1
```

### Task 4.2: Design docs dangling link 修正

**Files:**

- Modify: `docs/architecture/**/*.md` (dangling link を持つ file)

- [ ] **Step 1: link 全抽出**

```bash
grep -rohE "\]\([^)]+\.md[^)]*\)" docs/architecture/ | sort -u | sed 's/^.\(.*\))$/\1/' > /tmp/c5d-links.txt
wc -l /tmp/c5d-links.txt
```

- [ ] **Step 2: 各 link 先の物理実在確認**

```bash
while read link; do
  # 相対 link を絶対 path に変換 (簡易、context 必要なら手動)
  if [ ! -f "docs/architecture/$link" ] && [ ! -f "$link" ]; then
    echo "[DANGLING] $link"
  fi
done < /tmp/c5d-links.txt
```

Expected: dangling link リスト。

- [ ] **Step 3: 各 dangling link を修正 (削除 or 正しい path に置換)**

判定基準:

- link 先が削除済み → link を削除 (該当文も削除 or 置換)
- link 先が rename → 新 path に修正

- [ ] **Step 4: Commit**

Commit message:

```
docs(architecture): dangling link N 件を修正

design docs 内の link を物理実在確認、削除済み file への link N 件を削除、
rename 済み file への link M 件を新 path に修正。

C5d Task 4.2
```

### Task 4.3: Plan / spec archive 判定 (read-only investigation)

**Files:** read-only.

- [ ] **Step 1: 全 plan / spec の commit SHA 抽出**

```bash
for f in docs/superpowers/plans/*.md docs/superpowers/specs/*.md; do
  shas=$(grep -oE "\b[0-9a-f]{7,40}\b" "$f" | head -3)
  echo "$f: $shas"
done > /tmp/c5d-plan-shas.txt
```

- [ ] **Step 2: 各 SHA が main で実在するか確認**

```bash
while IFS=: read file shas; do
  for sha in $shas; do
    git cat-file -e "$sha" 2>/dev/null && echo "[REAL] $file: $sha" || echo "[FAKE] $file: $sha"
  done
done < /tmp/c5d-plan-shas.txt
```

- [ ] **Step 3: 各 plan の実装状態判定**

判定基準:

- すべての plan 内 SHA が main 実在 + plan 内最終 task が完了済み (commit log と照合) → archive 候補
- 一部 SHA missing or 未実装 → 現状維持

- [ ] **Step 4: 結果を /tmp/c5d-archive-list.md にまとめて controller に報告**

Format:

```
## archive 候補 plan
- <path>: 実装完了 (最終 SHA <sha>)

## archive 候補 spec
- <path>: 該当 plan 完了

## 現状維持
- <path>: 理由
```

- [ ] **Step 5: controller 承認 → Task 4.4 へ (commit なし)**

### Task 4.4: Plan / spec を .archive/2026/ に移動 + README 更新

**Files:**

- Move (git mv): Task 4.3 で archive 候補と判定された plan / spec
- Create: `docs/superpowers/plans/.archive/2026/` + `docs/superpowers/specs/.archive/2026/` (なければ)
- Modify: `docs/superpowers/plans/README.md` (or `.archive/README.md`)

- [ ] **Step 1: archive dir 作成**

```bash
mkdir -p docs/superpowers/plans/.archive/2026
mkdir -p docs/superpowers/specs/.archive/2026
```

- [ ] **Step 2: 移動**

```bash
for plan in <archive-list>; do
  git mv "$plan" "docs/superpowers/plans/.archive/2026/$(basename $plan)"
done
# spec も同様
```

- [ ] **Step 3: archive 移動した plan / spec に Snapshot 注記追加**

各 archive 済み file 冒頭に:

```markdown
> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.
```

- [ ] **Step 4: README 更新 (active vs archive 分離)**

`docs/superpowers/plans/README.md`:

```markdown
# Plans

## Active

- (空 or 進行中の plan)

## Archive

- [.archive/2026/](.archive/2026/) — 完了済み plan
```

- [ ] **Step 5: Commit**

Commit message:

```
docs(plans): 完了済み plan / spec を .archive/2026/ に移動

実装完了 (commit SHA で main 実在確認済) の plan N 件 + spec M 件を archive
dir に移動。各 file 冒頭に Snapshot 注記追加。README に active vs archive
の分離を明記。

C5d Task 4.4
```

### Task 4.5: docs/guides/ + docs/reference/ version drift 修正

**Files:**

- Modify: `docs/guides/**/*.md` + `docs/reference/**/*.md`

- [ ] **Step 1: package.json から ground truth 取得**

```bash
node -e "const p = require('./package.json'); for (const [k,v] of Object.entries(p.dependencies || {})) console.log(k, v)" | grep -E "next|react|@prisma|tailwindcss|zod|better-auth|lexical|nuqs"
```

Expected: 各主要 lib の version。

- [ ] **Step 2: docs 内の version 表記 grep**

```bash
grep -rnE "Next\.js [0-9]+\.[0-9]+|React [0-9]+\.[0-9]+|Prisma [0-9]+\.[0-9]+|Tailwind [0-9]+\.[0-9]+|Zod [0-9]+\.[0-9]+|Better Auth [0-9]+\.[0-9]+|Lexical [0-9]+\.[0-9]+" docs/guides/ docs/reference/ 2>/dev/null
```

- [ ] **Step 3: drift 検出箇所を ground truth に揃える**

例: `Prisma 7.7` → `Prisma 7.8` (package.json と一致)

- [ ] **Step 4: Commit**

Commit message:

```
docs(guides): version drift 修正 — package.json と一致

docs/guides/ + docs/reference/ 内の lib version 表記 N 箇所を package.json
と byte-identical に揃える (Prisma X.X / Next.js X.X / etc)。

C5d Task 4.5
```

### Task 4.6: 廃止済み機能の記述削除

**Files:**

- Modify: `docs/**/*.md` + `.serena/memories/**/*.md`

- [ ] **Step 1: 廃止済み feature 名 grep**

```bash
grep -rln "Supabase\|FullCalendar\|Three\.js\|three\.js\|PixiJS\|pixi" docs/ .serena/memories/ 2>/dev/null
```

Expected: 廃止済み feature を含む file リスト。

- [ ] **Step 2: 各 file の該当記述精査**

判定:

- 「過去使用していた」「移行済み」と明示的に履歴文脈で言及 → 残す (Snapshot 文脈)
- 「現在使用中」「設定方法」等の現状参照 → 削除 (廃止済み)

- [ ] **Step 3: 削除 / 修正**

- [ ] **Step 4: Commit**

Commit message:

```
docs: 廃止済み機能 (Supabase / FullCalendar / Three.js / PixiJS) の現状参照記述削除

現状使用中として記述されていた廃止済み feature を docs / serena memories から
削除。履歴文脈の言及 (移行記録等) は Snapshot 注記付きで保持。

C5d Task 4.6
```

### Phase 4 完了 reviewer

- [ ] **Reviewer dispatch (combined)**

Prompt: Phase 1 reviewer template の Phase 4 版。spec §3.4 / §4.1 C5d を check。

---

## 全体検証

- [ ] **bun run validate && bun run build**

Expected: 両方成功。

- [ ] **node scripts/verify-policy-docs.mjs**

Expected: byte-identical 同期成功。

- [ ] **全参照漏れ最終 sweep**

```bash
# Phase 横断で旧 name が残ってないか
for old in <deleted-agents> <renamed-skills>; do
  grep -rn "$old" .claude/ docs/ CLAUDE.md AGENTS.md 2>/dev/null
done
```

Expected: 出力ゼロ (削除済み agent / 旧 skill 名がどこにも残らない)。

- [ ] **Git log 確認**

```bash
git log --oneline | head -25
```

Expected: 14-23 commit、phase ごとに論理単位で分離。

- [ ] **handoff memory 更新 / archive**

`~/.claude/projects/<slug>/memory/project_clean-break-c5-handoff.md` を:

- 完遂した場合: archive 注記追加 (`> **Completed: 2026-04-27** — ...`)
- 部分完遂の場合: 残 phase + 起動コマンド更新

- [ ] **CLAUDE.md learning codify (revise-claude-md skill 使用)**

C5 で得た学びを CLAUDE.md に追記:

- 規模感 (4 phase / 14-23 commit) を Clean-Break Refactor の reference として
- C5b/c/a/d の各 phase 固有の罠 (cascade ref / context budget / etc)

セッション末で `revise-claude-md` skill を呼ぶ (CLAUDE.md learning「revise-claude-md はセッション終了直前に呼ぶ」遵守)。

---

## Risk + Mitigation (再掲)

spec §5 を参照。Phase 跨ぎ参照修正漏れ / context 圧迫 / ADR 採番衝突 / stale 削除 silent 壊れ / skill rename invocation 壊れ の 5 件を控制。

## Out of Scope

spec §7 を参照。skill content 品質改善 / rule 文言改善 / agent 内部 prompt 改善 / design docs 新規作成 / .claude/hooks/ audit は別 plan。
