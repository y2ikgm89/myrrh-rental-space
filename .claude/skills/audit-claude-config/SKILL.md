---
name: audit-claude-config
description: Claude Code 公式仕様 (`code.claude.com/docs/en/{memory,sub-agents,skills,settings,hooks}`) からの drift を `.claude/` 全体で検出する手動監査 SKILL。
when_to_use: 公式 docs 更新確認 (月次)、`.claude/{rules,agents,skills,hooks}/**` の大規模変更後の自己検証、Claude Code 本体バージョン更新後 (`claude --version`)。
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash, Grep, Glob, Read, WebFetch
context: fork
agent: Explore
disallowed-tools: AskUserQuestion
---

# audit-claude-config — 公式準拠 drift 監査

公式 5 層構造（Memory / Rules / Subagents / Skills / Hooks）の現状を `code.claude.com/docs/en/*` 最新仕様と照合し、drift を report する。`.claude/rules/claude-code-patterns.md` のチェックリストを実行可能化したもの。

## Phase 1: Local drift 検出（grep ベース、高速）

```bash
echo "=== 1. paths: frontmatter なしの rule (常時ロード=禁止) ==="
missing=0
for f in $(find .claude/rules -name "*.md" -type f); do
  head -10 "$f" | grep -q '^paths:' || { echo "MISSING: $f"; missing=$((missing+1)); }
done
[ "$missing" -eq 0 ] && echo "OK: 全 rule が path-scoped"

echo ""
echo "=== 2. Agent frontmatter 独自フィールド検出 ==="
echo "公式 field: name/description/tools/disallowedTools/model/permissionMode/maxTurns/skills/mcpServers/hooks/memory/background/effort/isolation/color/initialPrompt"
echo "実使用 field:"
for f in .claude/agents/*.md; do
  awk '/^---$/{c++; next} c==1' "$f" | grep -E '^[a-zA-Z_-]+:' | sed 's/:.*//'
done | sort -u

echo ""
echo "=== 3. Skill frontmatter 独自フィールド検出 ==="
echo "公式 field: name/description/when_to_use/argument-hint/arguments/disable-model-invocation/user-invocable/allowed-tools/model/effort/context/agent/hooks/paths/shell"
echo "実使用 field:"
for f in .claude/skills/*/SKILL.md; do
  awk '/^---$/{c++; next} c==1' "$f" | grep -E '^[a-zA-Z_-]+:' | sed 's/:.*//'
done | sort -u

echo ""
echo "=== 4. Skill description + when_to_use 1536 文字超過検出 ==="
for f in .claude/skills/*/SKILL.md; do
  desc=$(awk '/^---$/{c++; next} c==1' "$f" | awk '/^description:/{p=1; next} /^[a-z-]+:/{p=0} p')
  when=$(awk '/^---$/{c++; next} c==1' "$f" | awk '/^when_to_use:/{p=1; next} /^[a-z-]+:/{p=0} p')
  total=$(echo -n "$desc $when" | wc -c)
  [ "$total" -gt 1536 ] && echo "OVER 1536: $f ($total chars)"
done

echo ""
echo "=== 5. memory: project 宣言 agent vs agent-memory/ 整合性 ==="
declared=$(grep -l '^memory: project' .claude/agents/*.md 2>/dev/null | xargs -n1 basename 2>/dev/null | sed 's/\.md$//' | sort)
# MINGW64 ls は dir に trailing / を付けるため -1 + sed で正規化
actual=$(ls -1 .claude/agent-memory/ 2>/dev/null | sed 's|/$||' | sort)
if [ "$declared" = "$actual" ]; then echo "OK: 整合"; else echo "DRIFT:"; echo "declared: $declared"; echo "actual: $actual"; fi

echo ""
echo "=== 6. 撤回パターン残骸 (再導入禁止) ==="
remnants=0
for path in docs/reference .archive .claude/rules/gotchas; do
  if [ -e "$path" ]; then echo "RESURRECTED: $path"; remnants=$((remnants+1)); fi
done
# barrel index 検出: paths なし + 「TOC のみ」rule
[ "$remnants" -eq 0 ] && echo "OK: 撤回 pattern 残骸なし"

echo ""
echo "=== 7. CLAUDE.md size (target < 200 行) ==="
lines=$(wc -l < CLAUDE.md)
[ "$lines" -ge 200 ] && echo "OVER 200: CLAUDE.md ($lines 行) — path-scoped rule への退避を検討" || echo "OK: $lines 行"

echo ""
echo "=== 8. SKILL.md size (公式推奨 < 500 行、reference は別ファイル) ==="
over=0
for f in .claude/skills/*/SKILL.md; do
  lines=$(wc -l < "$f")
  [ "$lines" -ge 500 ] && { echo "OVER 500: $f ($lines 行) — reference/*.md への分割推奨"; over=$((over+1)); }
done
[ "$over" -eq 0 ] && echo "OK: 全 SKILL.md 500 行未満"

echo ""
echo "=== 9. rule / skill paths: glob 実在性（stale glob 検出）==="
# specific path glob は dir 移動 / file rename で stale 化する。Bun.Glob で git
# tracked file と照合し、rule (paths: 必須) は DEAD_RULE(auto-load 不発)/DEAD_GLOB、
# skill (paths: 任意=公式 skills#frontmatter-reference) は DEAD_SKILL(auto-activation
# 不発)/DEAD_SKILL_GLOB を検出する。
bun ${CLAUDE_SKILL_DIR}/scripts/check-stale-paths.ts
```

## Phase 2: 公式 spec WebFetch + diff（必要時のみ）

公式 docs 更新の疑いがあるときのみ実行。`claude --version` 上昇後 or 月次定期。

```text
WebFetch https://code.claude.com/docs/en/skills "List official SKILL.md frontmatter fields exhaustively with required/optional status and character limits"
WebFetch https://code.claude.com/docs/en/sub-agents "List official sub-agent frontmatter fields exhaustively"
WebFetch https://code.claude.com/docs/en/hooks "List all hook events and recent additions with version markers (v2.1.X+)"
WebFetch https://code.claude.com/docs/en/settings "List top-level settings.json fields. Note recent additions"
WebFetch https://code.claude.com/docs/en/memory "Summarize CLAUDE.md best practices and auto-memory features"
```

取得結果を以下と diff:

- `.claude/rules/claude-code-patterns.md` §公式が定義する 5 層 の sub-agent / skill field 表
- `.claude/rules/ops/hooks-patterns.md` §公式イベント一覧 + Handler types + 新 fields/env セクション

未収録 field / event / handler type / env を検出。

## Phase 3: 修正提案

検出 drift ごとに 1 行アクション:

| Drift                               | 修正アクション                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `paths:` 欠落                       | 該当 rule に `paths:` frontmatter 追加（適切な glob）                         |
| stale glob (`paths` が無マッチ)     | 実在パスへ remap（dir 移動・rename 追従）、冗長 / 消失分は削除                |
| 独自 frontmatter field              | 公式 field 名に置換 or 削除                                                   |
| description+when_to_use 1536 字超過 | description 圧縮、details は SKILL 本文に移動                                 |
| agent-memory drift                  | `memory: project` 削除（未使用）or `MEMORY.md` stub 作成（利用予定）          |
| 撤回 pattern 残骸                   | `git rm -r <path>`、`claude-code-patterns.md` の撤回表で正当化                |
| CLAUDE.md > 200 行                  | path-scoped rule に退避                                                       |
| SKILL.md > 500 行                   | `reference/*.md` に詳細を分割、SKILL.md は概要 + ナビに圧縮                   |
| 公式新 field / event                | `claude-code-patterns.md` / `hooks-patterns.md` の field 表に追記（1 commit） |

## 出力形式

```text
== Claude Code 公式準拠 drift 監査 (YYYY-MM-DD) ==
Phase 1 (local grep):
  ✅ paths: coverage 100%
  ✅ agent frontmatter 公式準拠
  ✅ skill frontmatter 公式準拠
  ✅ description+when_to_use 全件 1536 chars 以下
  ✅ agent-memory 整合
  ✅ 撤回 pattern 残骸ゼロ
  ✅ CLAUDE.md 169 行 / 200 行
  ✅ SKILL.md 全件 500 行未満
  ✅ paths: glob 全件実在マッチ (rules DEAD_RULE=0 DEAD_GLOB=0 / skills DEAD_SKILL=0 DEAD_SKILL_GLOB=0)
Phase 2 (official spec diff): [skipped or executed]
  ⚠️  hooks に新 event `XxxYyy` 追加 (v2.1.150) → hooks-patterns.md に追記要

修正提案:
  1. hooks-patterns.md の §公式イベント一覧 に `XxxYyy` を追加
```

## 設計判断

- **なぜ hook ではなく SKILL か** — hook は全 session で context cost が発生。SKILL は `disable-model-invocation: true` で listing budget ゼロ、手動 invoke 時のみ展開
- **なぜ `context: fork` + `agent: Explore` か** — 監査は大量の grep / Read / WebFetch を伴うが main context に残すのは最終 drift report のみで十分。fork で sweep を Explore subagent（read-only・CLAUDE.md スキップで最リーン）に隔離し、main の context / 後続ターンのトークン消費を抑制（公式 skills#run-skills-in-a-subagent の研究 skill パターン）。read-only sweep+report 型の手動監査（`audit-ssot` / `audit-integration` / `audit-memory-staleness`）に共通適用。`paths:` で自動有効化する inline ガイダンス監査（`audit-cache` 等）は編集毎の subagent 生成を避けるため fork しない
- **なぜ `disallowed-tools: AskUserQuestion` か** — `agent: Explore` は Edit/Write を持たないが AskUserQuestion は持つ。fork 内で user に質問してもうまく surface せず sweep がストール/往復浪費になるため抑止し、曖昧さは finding として報告して決定的に進める（fork 化した 4 監査に共通適用）
- **なぜ WebFetch を毎回しないか** — local drift（Phase 1）の方が高頻度で発生。公式 spec 更新は月次オーダーなので Phase 2 は条件付き
- **なぜ自動修正しないか** — frontmatter / rule 編集は意味的判断（field 採用可否、glob 適用範囲）が必要。SKILL は **報告 + 提案**まで、修正は user / 別 session で実施

## 関連

- SSoT: `.claude/rules/claude-code-patterns.md` (公式 5 層構造の field 表 + 撤回 pattern 表)
- SSoT: `.claude/rules/ops/hooks-patterns.md` (公式 hooks events / handler types)
- 補完 SKILL: `.claude/skills/audit-memory-staleness/SKILL.md` (memory 内 stale path 検出)
- 公式 docs: `code.claude.com/docs/en/{memory,sub-agents,skills,settings,hooks,permissions,plugins,commands}`
