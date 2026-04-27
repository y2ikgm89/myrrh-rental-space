> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# Agents Clean-Break Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.claude/agents/**` 25 件の subagent 定義ファイルを Claude Code 公式 subagent docs (`code.claude.com/docs/en/sub-agents`) の canonical 形式に揃え、後方互換シムなしで clean break する。

**Architecture:** Handoff memory `project_clean-break-refactor-handoff.md` の C2 スコープに沿って 3 軸監査を実施: **(A) tools 最小権限** / **(B) description proactively pattern** / **(C) memory: project 必要時のみ**。事前 grep の結果、25 件全てが `tools` を YAML list 形式で記述しており公式 canonical（comma-separated）と異なるため Phase 1 で正規化。`memory: project` 宣言 15 件中 5 件が backing dir 不在で、うち body に Memory management 節を持たない 2 件 (`cache-strategy-reviewer` / `lexical-reviewer`) を Phase 2 で削除。Phase 3 で C1 の rule docs barrel split（`server-actions.md` / `frontend/accessibility.md` / `gotchas.md`）後に stale 化した §section anchor refs を更新。description / 重複 / dead subagent は事前監査でクリーン判定（→ Phase 4 で再確認）。

**Tech Stack:** Markdown + YAML frontmatter のみ。コード変更なし。検証は `grep` + YAML 構造目視。

---

## File Structure

**対象ファイル: `.claude/agents/*.md` 全 25 件（変更）**

| 領域                                       | ファイル数 | 備考                                                                                                                       |
| ------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 全 25 件 (Phase 1)                         | 25         | `tools:` を YAML list → comma-separated に正規化                                                                           |
| `cache-strategy-reviewer` (Phase 2)        | 1          | `memory: project` 削除（body に memory 言及なし）                                                                          |
| `lexical-reviewer` (Phase 2)               | 1          | `memory: project` 削除（body に memory 言及なし）                                                                          |
| `accessibility-reviewer` (Phase 3)         | 1          | `frontend/accessibility.md §タッチターゲット` → barrel 外 sub-file (`frontend/accessibility/touch-text.md`) に anchor 修正 |
| `editorial-consistency-reviewer` (Phase 3) | 1          | 同上                                                                                                                       |
| `plan-drift-detector` (Phase 3)            | 1          | `gotchas.md §Claude Code 設定` → `gotchas/claude-code.md` に anchor 修正                                                   |

**変更しないもの（保持判定）:**

- `description: >` block scalar 形式（YAML 仕様適合、可読性のため維持）
- `model: sonnet` 全件（公式 spec 適合、`inherit` への変更不要）
- `memory: project` 13 件（10 件は backing dir あり / 3 件は backing dir なしだが body に Memory management 節あり = lazy-create 待機状態）
- 25 件の機能分担（重複・dead は事前監査で検出されず）

**作成しない:**

- 新規 backing dir（lazy-create に任せる、空 `MEMORY.md` 事前作成は noise）
- 新規 subagent

---

## 事前監査の確定事項

### tools フォーマット (Phase 1 対象)

**現状（25 件全て）:**

```yaml
tools:
  - Read
  - Grep
  - Glob
```

**目標（公式 canonical）:**

```yaml
tools: Read, Grep, Glob
```

**理由:** 公式 docs `code.claude.com/docs/en/sub-agents` の全例示が comma-separated 単行。YAML list 形式も技術的に有効だが、後方互換シム的な多重表記を避け canonical 一本化する（clean break）。

### memory: project orphan 判定 (Phase 2 対象)

| Agent                     | backing dir | body Memory management 節 | 判定                     |
| ------------------------- | ----------- | ------------------------- | ------------------------ |
| `cache-strategy-reviewer` | なし        | なし                      | **削除**                 |
| `db-migration-reviewer`   | なし        | あり (lines 134-145)      | 維持（lazy-create 待機） |
| `lexical-reviewer`        | なし        | なし                      | **削除**                 |
| `test-runner`             | なし        | あり (lines 104-116)      | 維持                     |
| `verification`            | なし        | あり (lines 89-106)       | 維持                     |

判定基準は CLAUDE.md `.claude/agents/<name>.md` ルール「本文で MEMORY 参照を持つ設計か `.claude/agent-memory/<name>/` に dir があるかで判定」に準拠。

### Stale anchor refs (Phase 3 対象)

C1 完了 commit `5d298e74` 時点で rule docs を barrel split したが、agent body の §section anchor 4 件が更新漏れ:

```
.claude/agents/accessibility-reviewer.md:173
.claude/agents/editorial-consistency-reviewer.md:96
.claude/agents/plan-drift-detector.md:130
```

C1 で生成された sub-file の正確なパス・§セクション名は Phase 3 のタスクで `Read` + `Grep` で確認してから書き換える。

### 重複・dead subagent 監査結果

事前精査で全 25 件の機能差分を確認、重複・dead は検出されず。Phase 4 で再確認のみ実施。

- `accessibility-reviewer` vs `editorial-consistency-reviewer`: WCAG 規格レビュー vs Editorial Magazine token 整合性 — 別軸
- `test-runner` vs `verification`: 個別テスト診断 vs build/type-check/lint 包括 — 別軸
- `test-writer` vs `e2e-test-writer`: bun:test vs Playwright — 別軸
- `design-memory` vs `editorial-consistency-reviewer`: 持続的デザイン記憶（Write） vs 違反検出（Read-only） — 別軸

---

## Task 1: Tools format normalization (Phase 1)

**Files:**

- Modify: `.claude/agents/accessibility-reviewer.md` (行 9-12)
- Modify: `.claude/agents/animation-cleanup-reviewer.md` (行 8-12)
- Modify: `.claude/agents/better-auth-reviewer.md` (行 9-15)
- Modify: `.claude/agents/cache-strategy-reviewer.md` (行 9-12)
- Modify: `.claude/agents/codebase-explorer.md` (行 8-12)
- Modify: `.claude/agents/db-migration-reviewer.md` (行 8-12)
- Modify: `.claude/agents/design-memory.md` (行 8-12)
- Modify: `.claude/agents/e2e-test-writer.md` (行 8-14)
- Modify: `.claude/agents/editorial-consistency-reviewer.md` (行 8-11)
- Modify: `.claude/agents/email-template-reviewer.md` (行 9-13)
- Modify: `.claude/agents/event-flow-reviewer.md` (行 7-10)
- Modify: `.claude/agents/large-file-detector.md` (行 8-10)
- Modify: `.claude/agents/lexical-reviewer.md` (行 8-14)
- Modify: `.claude/agents/performance-analyzer.md` (行 7-10)
- Modify: `.claude/agents/plan-drift-detector.md` (行 9-13)
- Modify: `.claude/agents/project-reviewer.md` (行 9-13)
- Modify: `.claude/agents/rate-limit-reviewer.md` (行 7-10)
- Modify: `.claude/agents/react-compiler-reviewer.md` (行 8-14)
- Modify: `.claude/agents/reservation-flow-reviewer.md` (行 7-10)
- Modify: `.claude/agents/route-structure-reviewer.md` (行 8-12)
- Modify: `.claude/agents/security-reviewer.md` (行 8-11)
- Modify: `.claude/agents/test-runner.md` (行 8-12)
- Modify: `.claude/agents/test-writer.md` (行 8-14)
- Modify: `.claude/agents/verification.md` (行 8-12)
- Modify: `.claude/agents/zod-schema-reviewer.md` (行 8-14)

> **対象行は監査時点。実装時は Read で frontmatter ブロック先頭の `tools:` を確認してから Edit。`---` （frontmatter 終了）の前にある `tools:` セクション全体を 1 行に置換する。**

- [ ] **Step 1: 違反パターンの存在確認 (Pre-edit grep)**

Run:

```bash
grep -lE '^tools:$' .claude/agents/*.md | wc -l
```

Expected: `25`（全 25 件で YAML list 形式の `tools:` 単独行が存在）

- [ ] **Step 2: 代表 1 件で Edit パターン確立 — `accessibility-reviewer.md`**

`accessibility-reviewer.md` の frontmatter（行 9-12 周辺）:

Before:

```yaml
tools:
  - Read
  - Grep
  - Glob
model: sonnet
```

After:

```yaml
tools: Read, Grep, Glob
model: sonnet
```

Edit:

```
old_string:
tools:
  - Read
  - Grep
  - Glob
model: sonnet

new_string:
tools: Read, Grep, Glob
model: sonnet
```

- [ ] **Step 3: 残り 24 件にも同じパターンで Edit を反復適用**

各ファイルで `Read` → frontmatter の `tools:` ブロックを確認 → comma-separated 1 行に Edit。`mcp__context7__*` などの長い tool 名を含むファイルでも同様。

例えば `better-auth-reviewer.md`:

Before:

```yaml
tools:
  - Read
  - Grep
  - Glob
  - Bash
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
model: sonnet
memory: project
```

After:

```yaml
tools: Read, Grep, Glob, Bash, mcp__context7__resolve-library-id, mcp__context7__query-docs
model: sonnet
memory: project
```

`design-memory.md` のように `skills:` を含むものも同様（`skills:` は YAML list のまま維持、`tools:` だけ正規化）:

Before:

```yaml
tools:
  - Read
  - Grep
  - Glob
  - Write
skills:
  - frontend-design
model: sonnet
memory: project
```

After:

```yaml
tools: Read, Grep, Glob, Write
skills:
  - frontend-design
model: sonnet
memory: project
```

`large-file-detector.md` のように 2 tool しかないものも同じ:

Before:

```yaml
tools:
  - Glob
  - Bash
model: sonnet
```

After:

```yaml
tools: Glob, Bash
model: sonnet
```

- [ ] **Step 4: 違反パターンが完全に消えたことを検証 (Post-edit grep)**

Run:

```bash
grep -lE '^tools:$' .claude/agents/*.md
```

Expected: 出力なし（exit 1）

確認用 inverse grep:

```bash
grep -E '^tools: ' .claude/agents/*.md | wc -l
```

Expected: `25`（全 25 件で comma-separated 形式に変換済み）

- [ ] **Step 5: YAML 構造の最低限の sanity check**

frontmatter ブロック（`---` で挟まれた範囲）が壊れていないか確認。各ファイルで `---` が 2 個（先頭 + frontmatter 終端）あること:

```bash
for f in .claude/agents/*.md; do
  count=$(grep -cE '^---$' "$f")
  if [ "$count" != "2" ]; then echo "BROKEN: $f (--- count: $count)"; fi
done
```

Expected: 出力なし

- [ ] **Step 6: Commit**

```bash
git add .claude/agents/
git commit -m "refactor(agents): normalize tools to canonical comma-separated format

公式 docs (code.claude.com/docs/en/sub-agents) の canonical YAML
frontmatter 形式に揃える。25 件全てで tools を YAML list から
comma-separated 単行に変換 (clean break, 機能差分なし)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Memory: project orphan removal (Phase 2)

**Files:**

- Modify: `.claude/agents/cache-strategy-reviewer.md` (行 14: `memory: project` を削除)
- Modify: `.claude/agents/lexical-reviewer.md` (行 16: `memory: project` を削除)

> **判定根拠:** 両者とも `.claude/agent-memory/<name>/` dir なし + body に Memory management 節なし。`db-migration-reviewer` / `test-runner` / `verification` は backing dir なしだが body に Memory management 節があり、lazy-create 待機状態として **維持**。

- [ ] **Step 1: 削除対象ファイル 2 件の現状確認**

Run:

```bash
grep -nH '^memory: project$' .claude/agents/cache-strategy-reviewer.md .claude/agents/lexical-reviewer.md
```

Expected:

```
.claude/agents/cache-strategy-reviewer.md:14:memory: project
.claude/agents/lexical-reviewer.md:16:memory: project
```

- [ ] **Step 2: `cache-strategy-reviewer.md` から `memory: project` 行を削除**

Before（行 13-15 周辺、Task 1 完了後の状態を前提）:

```yaml
model: sonnet
memory: project
---
```

After:

```yaml
model: sonnet
---
```

Edit:

```
old_string:
model: sonnet
memory: project
---

new_string:
model: sonnet
---
```

- [ ] **Step 3: `lexical-reviewer.md` から `memory: project` 行を削除**

`cache-strategy-reviewer` と同パターンで Edit。

- [ ] **Step 4: 削除後の検証 — 維持対象 13 件は残っていること**

Run:

```bash
grep -lE '^memory: project$' .claude/agents/*.md | sort
```

Expected: 13 件（`cache-strategy-reviewer.md` と `lexical-reviewer.md` が含まれない）

```
.claude/agents/better-auth-reviewer.md
.claude/agents/codebase-explorer.md
.claude/agents/db-migration-reviewer.md
.claude/agents/design-memory.md
.claude/agents/performance-analyzer.md
.claude/agents/project-reviewer.md
.claude/agents/react-compiler-reviewer.md
.claude/agents/route-structure-reviewer.md
.claude/agents/security-reviewer.md
.claude/agents/test-runner.md
.claude/agents/test-writer.md
.claude/agents/verification.md
.claude/agents/zod-schema-reviewer.md
```

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/cache-strategy-reviewer.md .claude/agents/lexical-reviewer.md
git commit -m "refactor(agents): remove orphan memory: project declarations

backing dir + body Memory management 節がいずれも存在しない 2 件で
memory: project 宣言を削除 (CLAUDE.md §自動ロード の判定基準に準拠)。
他 13 件は backing dir または body Memory management 節を持つため
維持。

- cache-strategy-reviewer: dir 不在 + body memory 言及なし
- lexical-reviewer: dir 不在 + body memory 言及なし

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Stale §anchor refs after C1 barrel split (Phase 3)

**Files:**

- Modify: `.claude/agents/accessibility-reviewer.md` (行 173)
- Modify: `.claude/agents/editorial-consistency-reviewer.md` (行 96)
- Modify: `.claude/agents/plan-drift-detector.md` (行 130)

> **背景:** C1 完了 commit `5d298e74` で `.claude/rules/frontend/accessibility.md` と `.claude/rules/gotchas.md` を barrel-index pattern に分割。agent body の §section anchor が barrel ではなく sub-file を指すべき状態に drift しているため修正する。

- [ ] **Step 1: barrel split 後の sub-file 配置を確認**

Run:

```bash
ls .claude/rules/frontend/accessibility/ .claude/rules/gotchas/
```

Expected output に sub-file 名が表示される（`touch-text.md` / `claude-code.md` などを含む）。

- [ ] **Step 2: §タッチターゲット の正確な所在を確認**

Run:

```bash
grep -lE 'タッチターゲット|44px|2\.5\.5' .claude/rules/frontend/accessibility/*.md
```

Expected: `touch-text.md` を含む sub-file が表示される。

該当 sub-file 内の正確な § section heading を確認:

```bash
grep -nE '^##' .claude/rules/frontend/accessibility/touch-text.md
```

- [ ] **Step 3: §Claude Code 設定 の正確な所在を確認**

Run:

```bash
grep -lE 'Claude Code 設定|hook スクリプト' .claude/rules/gotchas/*.md
```

Expected: `claude-code.md` を含む sub-file が表示される。

該当 sub-file 内の正確な § section heading を確認:

```bash
grep -nE '^##' .claude/rules/gotchas/claude-code.md
```

- [ ] **Step 4: `accessibility-reviewer.md` の anchor 修正**

行 173 周辺を Read して現状を確認した上で Edit。

Before（例、Step 2 で確認した sub-file 名と § を反映する）:

```markdown
→ 詳細: `.claude/rules/frontend/accessibility.md` §タッチターゲット（WCAG 2.5.5 Enhanced）
```

After:

```markdown
→ 詳細: `.claude/rules/frontend/accessibility/touch-text.md` §タッチターゲット（WCAG 2.5.5 Enhanced）
```

> sub-file の正確な name と § heading は Step 2 grep の結果に揃える。`touch-text.md` 以外（例: `interactive.md`）が hit する場合はそちらを採用。

- [ ] **Step 5: `editorial-consistency-reviewer.md` の anchor 修正**

行 96 周辺を Read して Edit。Step 4 と同じ参照先 sub-file に揃える:

Before:

```markdown
→ 詳細: `.claude/rules/frontend/accessibility.md` §タッチターゲット
```

After:

```markdown
→ 詳細: `.claude/rules/frontend/accessibility/touch-text.md` §タッチターゲット
```

- [ ] **Step 6: `plan-drift-detector.md` の anchor 修正**

行 130 周辺を Read して Edit:

Before:

```markdown
- `.claude/rules/gotchas.md` §Claude Code 設定 — plan の schema 前提検証ルール
```

After:

```markdown
- `.claude/rules/gotchas/claude-code.md` §Claude Code 設定 — plan の schema 前提検証ルール
```

> Step 3 grep で `claude-code.md` 以外（例: `general.md`）に該当 § が入っている場合はそちらを採用。

- [ ] **Step 7: 残った barrel-only refs の最終 grep**

修正対象として既知の 4 行以外で stale なものが残っていないか確認:

```bash
grep -nE '\.claude/rules/(frontend/accessibility|gotchas)\.md \xc2\xa7' .claude/agents/*.md
```

Note: `\xc2\xa7` は `§` の UTF-8 byte 表現。MINGW64 で `§` リテラルが渡せない場合に使う。代替として:

```bash
grep -nE '\.claude/rules/(frontend/accessibility|gotchas)\.md ' .claude/agents/*.md
```

Expected: 出力なし（barrel に直接 §section を付ける ref が残っていない）。barrel ファイル名のみの ref（例 `project-reviewer.md:66 .claude/rules/server-actions.md` のような § なし path 単独）は維持して OK（barrel 自体への ref は autoload chain で解決される）。

- [ ] **Step 8: Commit**

```bash
git add .claude/agents/accessibility-reviewer.md .claude/agents/editorial-consistency-reviewer.md .claude/agents/plan-drift-detector.md
git commit -m "docs(agents): update stale §anchor refs after C1 rule barrel split

C1 (commit 5d298e74) で frontend/accessibility.md と gotchas.md を
barrel-index pattern に分割した結果、agent body の §section anchor が
barrel ではなく sub-file を指すべき状態に drift していたため修正。

- accessibility-reviewer: §タッチターゲット → frontend/accessibility/touch-text.md
- editorial-consistency-reviewer: 同上
- plan-drift-detector: §Claude Code 設定 → gotchas/claude-code.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Final verification

**Files:** 変更なし（読み取り検証のみ）

- [ ] **Step 1: 25 件の最終 frontmatter sanity check**

```bash
for f in .claude/agents/*.md; do
  echo "=== $f ==="
  awk '/^---$/{n++; next} n==1{print} n==2{exit}' "$f"
done | head -200
```

Expected: 全 25 件で `name:` / `description:` / `tools: …` (comma-separated 1 行) / `model: sonnet` の 4 フィールドが確実に存在。`memory: project` は 13 件で確認できる。`---` ブロックが破損していない。

- [ ] **Step 2: `name` 重複なし確認**

```bash
grep -hE '^name: ' .claude/agents/*.md | sort | uniq -d
```

Expected: 出力なし（重複 name なし）

- [ ] **Step 3: 機能差分の最終目視確認（重複・dead 検出）**

各 agent の `description` 1 行目だけ抜粋して並べて読み、機能重複がないか確認:

```bash
for f in .claude/agents/*.md; do
  desc=$(awk '/^description: >/{flag=1; next} flag && /^[[:space:]]/{print; exit}' "$f")
  echo "$(basename "$f"): $desc"
done
```

期待結果（事前監査と一致）:

- 25 件すべて機能スコープが互いに被らない
- `accessibility-reviewer` (WCAG 規格) と `editorial-consistency-reviewer` (Editorial Magazine token) は別軸
- `test-runner` (個別テスト診断) と `verification` (build/type-check/lint 包括) は別軸
- `test-writer` (bun:test) と `e2e-test-writer` (Playwright) は別軸
- `design-memory` (Write 含む持続的記憶) と `editorial-consistency-reviewer` (Read-only 違反検出) は別軸

重複 / dead を検出した場合のみ追加 commit で削除。検出なしであれば追加 commit 不要（plan 終了）。

- [ ] **Step 4: 全変更のサマリ確認**

```bash
git log --oneline main..HEAD
```

Expected: 3 commit（Task 1 / Task 2 / Task 3）

```bash
git diff --stat main..HEAD -- .claude/agents/
```

Expected: 27-30 行程度の総変更（25 件 tools 正規化 + 2 件 memory 削除 + 3 件 anchor 修正）。新規ファイル / 削除ファイルなし。

- [ ] **Step 5: CLAUDE.md / AGENTS.md cross-reference 検証**

CLAUDE.md には `.claude/agents/<name>.md` 行 (line 253 付近) があるが、subagent 個別名へのリンクはなく、形式だけの説明文。今回の変更で CLAUDE.md 更新は不要であることを確認:

```bash
grep -nE '\.claude/agents/' CLAUDE.md AGENTS.md 2>/dev/null
```

Expected: CLAUDE.md line 253 のみ hit（generic な subagent 説明文 `frontmatter name / description / tools:（最小権限）/ model: sonnet / memory: project`）。具体 agent 名への ref はなく更新不要。

- [ ] **Step 6: 最終報告**

完了報告に含める内容:

- 3 commit の SHA
- 変更ファイル数（25 件正規化 / 2 件 memory 削除 / 3 件 anchor 修正、合計 27-28 ファイル touched）
- backing dir 維持 13 件・削除 2 件の判定根拠
- 重複・dead 検出ゼロ

`MEMORY.md` の `project_clean-break-refactor-handoff.md` に「✅ C2 完了」を追記する。

---

## Self-review notes

**Spec coverage:**

- ✅ 公式 docs 準拠 → Phase 1 で tools canonical 化（comma-separated）
- ✅ tools 最小権限 → 事前監査済み、変更不要（既に Read/Grep/Glob ベース、書き込み権限は test-writer / e2e-test-writer / design-memory のみ正当）
- ✅ description proactively pattern → 全 25 件に trigger phrase 存在を事前確認、変更不要
- ✅ memory: project 必要時のみ → Phase 2 で orphan 2 件削除
- ✅ 重複・dead subagent 完全削除 → 事前監査で検出ゼロ、Phase 4 で再確認

**Type consistency:** 全 phase で扱う identifier（agent name / file path / § section anchor）は事前 grep で実在確認済み。Step 2-3 の grep で sub-file の正確な name + § を実行時に再取得する設計で、plan 内 hardcode を避ける。

**Placeholder scan:** "TBD" / "implement later" / "Add appropriate" などのプレースホルダ表現はなし。各 Step に実コードと exact grep コマンドを記述。

**Risk:**

- Phase 3 で sub-file 名が事前監査時から変わっている可能性（C1 後にさらに分割があれば）→ Step 2-3 の grep で実行時確認することで mitigation
- Phase 1 で frontmatter 内の `description: >` block scalar の indent が崩れた場合、YAML parser がエラーを出すが Phase 1 step 5 の `---` count check で検出可能

---

## 起動手順（implementer 向け短縮プロンプト）

```
docs/superpowers/plans/2026-04-28-agents-cleanup.md を subagent-driven-development で
実行してください。Phase 1 / 2 / 3 / 4 の順に進め、各 Phase の最終 Step で commit し、
全 3 commit 完了後に Phase 4 で最終検証してください。
implementer model は sonnet、git は add / commit のみ許可（reset / restore / stash 全面禁止）。
```
