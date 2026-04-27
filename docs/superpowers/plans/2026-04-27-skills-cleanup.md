# Skills Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** handoff C3 (`.claude/skills/**` cleanup) の 3 軸監査を完了し結果を canonical 記録、handoff memory を更新して **C3 完了マーク**。同時に **C3b (`paths:` 自動 activation enhancement)** を future plan として handoff に追記する。

**Architecture:** 事前監査 (本 plan 内 §監査結果サマリ) で handoff の 3 軸 (description 必須 / 500 行未満 / reference/\*.md 分割) は全 32 件 PASS。重複・dead skill ゼロ。clean-break 対象なし → 本 plan は **no-op + 文書化 + handoff 更新** の軽量構成。後続改善 (公式新フィールド `paths:` の path-scoped autoload で常時 context 圧迫を低減する enhancement) は **C3b として handoff に retain**、別 plan / 別セッションで実施。

**Tech Stack:** Markdown + YAML frontmatter のみ。コード変更なし。プラン commit 1 件 + memory 更新 (gitignored)。

---

## 監査結果サマリ (canonical 監査記録)

### 軸 1: description 必須

✅ **全 32 件 PASS** — description 欠落ゼロ。1,536 char 制限 (公式 spec) 超過ゼロ。

- Block scalar `>` 多行形式: **11 件** (add-prisma-enum / add-settings-field / cloud-run-debug / create-admin-page / create-page-content / create-server-action / google-calendar-debug / instagram-debug / prisma-migration / split-action-file / stripe-debug)
- Single-line 形式: **21 件**
- 言語混在: 日本語形 (~25 件) + 英語 "Use when ..." 形 (3 件: `verify-subagent-report` / `worktree-bootstrap` / `create-section-type`) → CLAUDE.md グローバル設定が日本語応答を要求するが skill description は Claude の delegation 判断に使われるためどちらも valid。**強制統一不要**

### 軸 2: 500 行未満

✅ **全 32 件 PASS** — 公式推奨「Keep SKILL.md under 500 lines」全件遵守。

| Top 5 (longest)        | lines |
| ---------------------- | ----- |
| seed-audit             | 188   |
| create-page-content    | 182   |
| create-server-action   | 178   |
| instagram-debug        | 171   |
| verify-subagent-report | 152   |

最長 188 行で公式推奨上限の **38% 以下**。マージン十分。

### 軸 3: reference/\*.md 分割

✅ **強制分割対象ゼロ** — 200 行超 skill ゼロ。

既に reference を持つ skill (8 件): frontend-design / add-prisma-enum / add-settings-field / cloud-run-debug / google-calendar-debug / parallax-section / create-admin-page / lexical-{node,plugin,toolbar}

### 軸 4 (handoff 範囲外、検出ゼロ): 重複・dead

✅ **検出ゼロ** — 32 件すべて機能スコープが互いに被らない。

- `frontend-design` vs `ui-ux-pro-max`: 前者は brief 作成 / 後者は UI 方針調査 — 別軸
- `lexical-audit` vs `lexical-{node,plugin,toolbar}`: 前者は監査専用 / 後者群は新規追加用 — 別軸
- `cache-audit` vs `integration-audit`: 前者は updateTag/revalidateTag 専用 / 後者はキャッシュ + Customer + 認証 + フロー横断 — 別軸の包含関係、保持

### 軸 5 (公式新フィールド未活用、C3b 移行)

公式 spec で定義されているが現状未活用:

| Field                       | 現状活用 | C3b で活用予定                                                                                                                        |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `paths:`                    | **0 件** | path-scoped autoload で常時 context 圧迫を低減 (e.g., `prisma-migration` → `prisma/schema.prisma`、`lexical-*` → `src/**/lexical/**`) |
| `when_to_use:`              | 0 件     | description が長い skill で trigger を分離して可読性向上                                                                              |
| `arguments:`                | 0 件     | named positional arg で `$N` を使う複雑 skill (現状ゼロ、対象なし)                                                                    |
| `argument-hint:`            | 9 件     | 既に活用済み                                                                                                                          |
| `disable-model-invocation:` | 3 件     | 既に活用済み (adr-create / create-section-type / worktree-bootstrap)                                                                  |

**結論:** 本 plan の clean-break スコープは確定的に no-op。C3b に移行する improvement は context 圧迫低減という明確な ROI がある別 plan として独立。

---

## File Structure

**変更:**

- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md` (C3 完了マーク + C3b 起動コマンド例追記)
- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md` (C1-C4 progress 行を C3 完了に更新)

**作成:**

- (なし — 本 plan ファイル `docs/superpowers/plans/2026-04-27-skills-cleanup.md` 自体が監査結果の canonical 記録)

**作成しない:**

- 新規 SKILL.md (32 件すべて 3 軸 PASS のため改修対象なし)
- 新規 reference/\*.md (分割対象ゼロ)
- C3b plan ファイル本体 (起動コマンド例だけ handoff に追記、plan 本体は別セッションで作成)

---

## Task 1: handoff memory C3 完了マーク + C3b 追記

**Files:**

- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md`

> 注: `~/.claude/` 配下の memory file は user dir で git untracked。commit 対象外。

- [ ] **Step 1: 現在の handoff memory の C3 ブロックを確認**

```bash
grep -nE '⬜ \*\*C3\*\*|^## 進捗|^- ✅ \*\*C[12]' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md
```

- [ ] **Step 2: C3 を完了マークに更新 + C3b future enhancement を追記**

`Edit` ツールで以下のブロックを置換:

Before:

```
- ⬜ **C3** — `.claude/skills/**` cleanup
- ⬜ **C4** — `docs/**` cleanup
```

After:

````
- ✅ **C3 完了 (2026-04-27)** — `.claude/skills/**` cleanup 監査 (3 軸全 PASS、no-op)
  - 軸 1 description 必須: 32 件全 OK (1,536 char 制限内、最長 ~600 char)
  - 軸 2 500 行未満: 32 件全 OK (最大 188 行 = `seed-audit`、上限の 38%)
  - 軸 3 reference/*.md 強制分割: 対象ゼロ (200 行超 skill ゼロ)
  - 重複・dead skill 検出: ゼロ
  - canonical 監査記録: `docs/superpowers/plans/2026-04-27-skills-cleanup.md`
  - **clean-break 対象なし → 改修コミットゼロ** (実装変更なし、plan + memory 更新のみ)
  - **未着手 → C3b に移行**: 公式新フィールド `paths:` の path-scoped autoload による context 圧迫低減 enhancement (下記参照)
- ⬜ **C3b** — `.claude/skills/**` `paths:` enhancement (公式 spec 新フィールド活用、context 圧迫低減)
  - スコープ: prisma-migration / cache-audit / integration-audit / lexical-* (audit/node/plugin/toolbar) / use-server-audit / audit-settings-sections / adr-drift-audit / seed-audit / ssot-audit / verify-subagent-report 等の path-bound skill に `paths:` を追加
  - 効果: path-scoped autoload により該当ファイル編集時のみ description が context に乗る → 全 skill description (~32 件 × 200-600 char ≒ 10-19KB) のうち path-bound 分の常時 auto-load 削減
  - 規模: 中 (~10-15 件 skill 編集、1 plan / 1 セッション、5-10 commit 想定)
  - 起動コマンド例:
    ```
    .claude/skills/** の paths field 自動 activation enhancement を writing-plans skill から開始してください。
    Plan 場所は docs/superpowers/plans/2026-04-XX-skills-paths-enhancement.md。
    各 path-bound skill (prisma-migration / cache-audit / lexical-* / use-server-audit 等) に
    公式 spec の paths field を追加し、context 圧迫を低減してください。
    skill 個別の path scope 判断は SKILL.md の description / 適用範囲を Read してから決定。
    ```
- ⬜ **C4** — `docs/**` cleanup
````

- [ ] **Step 3: 編集後の確認**

```bash
grep -nE '✅ \*\*C3 完了|⬜ \*\*C3b|⬜ \*\*C4' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md
```

Expected: 3 行 (C3 完了 / C3b / C4) すべて hit。

---

## Task 2: MEMORY.md C1-C4 progress 行を更新

**Files:**

- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md`

- [ ] **Step 1: 現在の C1-C4 行を確認**

```bash
grep -nE 'Clean-Break Refactor C1-C4|project_clean-break-refactor-handoff' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md
```

- [ ] **Step 2: C2 完了行を C3 完了込みに更新**

`Edit` ツールで:

Before:

```
- [project_clean-break-refactor-handoff.md](project_clean-break-refactor-handoff.md) — C1 完了 (commits `ca0efd7e`〜`5d298e74`、6 commit) + C2 完了 (commits `2c1b4efd`〜`ca1727a5`、3 commit、25 agent files canonical 化)。C3 (`.claude/skills/**`) / C4 (`docs/**`) は未着手
```

After:

```
- [project_clean-break-refactor-handoff.md](project_clean-break-refactor-handoff.md) — C1 完了 (commits `ca0efd7e`〜`5d298e74`、6 commit) + C2 完了 (commits `2c1b4efd`〜`ca1727a5`、3 commit、25 agent files canonical 化) + C3 完了 (2026-04-27、no-op 監査、3 軸全 PASS、改修コミットゼロ、`docs/superpowers/plans/2026-04-27-skills-cleanup.md` に canonical 記録)。C3b (skills paths enhancement) / C4 (`docs/**`) は未着手
```

- [ ] **Step 3: 編集後の確認**

```bash
grep -nE 'C3 完了|C3b' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md
```

Expected: 1 行に "C3 完了" と "C3b" 両方 hit。

---

## Task 3: Plan ファイルを commit

**Files:**

- New: `docs/superpowers/plans/2026-04-27-skills-cleanup.md` (本 plan ファイル自体)

- [ ] **Step 1: 現在の git status 確認**

```bash
git status --short docs/superpowers/plans/
```

Expected: `?? docs/superpowers/plans/2026-04-27-skills-cleanup.md` (untracked)

- [ ] **Step 2: Plan を commit**

```bash
git add docs/superpowers/plans/2026-04-27-skills-cleanup.md
git commit -m "$(cat <<'EOF'
docs(plan): record C3 skills audit (3 axes all PASS, no-op clean break)

handoff C3 (`.claude/skills/**` cleanup) の監査結果を canonical 記録。
事前監査の結果、3 軸すべて 32 件全 PASS で改修対象ゼロ:

- 軸 1 description 必須: 32 件全 OK
- 軸 2 500 行未満: 32 件全 OK (最大 188 行)
- 軸 3 reference/*.md 強制分割: 対象ゼロ
- 重複・dead skill 検出: ゼロ

未活用の公式新フィールド `paths:` (path-scoped autoload で context
圧迫低減) は C3b として handoff に future enhancement で記録。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: 確認**

```bash
git log --oneline -1
```

Expected: `<SHA> docs(plan): record C3 skills audit (3 axes all PASS, no-op clean break)`

---

## Task 4: Final verification

- [ ] **Step 1: handoff memory の整合性確認**

```bash
grep -E '^- (✅|⬜) \*\*C[1-4]' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md
```

Expected: C1 完了 / C2 完了 / C3 完了 / C3b ⬜ / C4 ⬜ の 5 行が順に表示される。

- [ ] **Step 2: MEMORY.md の整合性確認**

```bash
grep -A 1 'Clean-Break Refactor C1-C4' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md
```

Expected: 1 行に "C1 完了" + "C2 完了" + "C3 完了" + "C3b" がすべて含まれる。

- [ ] **Step 3: Plan ファイルが git tracked であることを確認**

```bash
git ls-files docs/superpowers/plans/2026-04-27-skills-cleanup.md
```

Expected: ファイルパスが出力される (空でない)。

- [ ] **Step 4: 全体 commit ログ確認**

```bash
git log --oneline -5
```

Expected: 最新 5 commit に本 plan の commit が含まれる。

---

## Self-review notes

**Spec coverage:**

- ✅ 公式 docs (`code.claude.com/docs/en/skills`) 準拠 → 軸 1-3 全 PASS で no-op
- ✅ description 必須 → 全 32 件 OK
- ✅ 500 行未満 → 全 32 件 OK
- ✅ reference/\*.md 分割 → 対象なし
- ✅ 重複・dead skill 完全削除 → 検出ゼロ
- ✅ handoff memory C3 完了マーク → Task 1
- ✅ C3b future enhancement → handoff に retain

**Type consistency:** memory file path / plan file path / commit message を全 Task で統一。

**Placeholder scan:** "TBD" / "implement later" / "Add appropriate" などのプレースホルダなし。各 Step に実コマンドと exact 出力を記述。

**Risk:**

- 低 — 実装変更ゼロ、commit 1 件 (plan ファイル) + memory 更新 (gitignored)
- 唯一の risk: handoff memory の Edit 文字列が他の文字列と被る場合 → Step 2 で `Edit` の `old_string` を十分一意なブロックに設定済み

---

## 起動手順 (controller / implementer 共通)

本 plan は規模小 (3 commit 未満、いずれも非破壊) のため **inline execution** 推奨:

```
docs/superpowers/plans/2026-04-27-skills-cleanup.md を inline execution
(superpowers:executing-plans skill) で実行してください。Task 1 → 2 → 3 → 4 の順、
最後に commit + verification で完了。
```
