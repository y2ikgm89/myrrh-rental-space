# Clean-Break Refactor C5 — skills / rules / subagents / docs 全面 audit

> **Spec date**: 2026-04-27
> **Status**: Brainstorming approved → writing-plans に渡す前の design 確定版
> **Scope level**: L3 + L4（積極的削除 + 階層構造再考）
> **Origin**: `~/.claude/projects/<slug>/memory/project_clean-break-c5-handoff.md`
> **Predecessor**: Clean-Break Refactor C1-C4（`project_clean-break-refactor-handoff.md`）

## 1. 背景

ユーザー指示「skills、rules、subagents など含めて公式のベストプラクティスに準拠した推奨で後方互換性のないクリーンな実装を目指して改善。docs フォルダも改善できれば進めて」を、C1-C4 と同じ Clean-Break Refactor パターンで C5 として実施する。

C1-C4 で扱わなかった以下のサブシステムを対象とする:

- `.claude/skills/<name>/SKILL.md` — 32 件
- `.claude/rules/**/*.md` — barrel-index 適用済の主要 rule + 残候補 (tailwind 569 行 / zod 746 行)
- `.claude/agents/<name>.md` — 25 件
- `docs/**/*.md` — ADR 25 件 / plans 10 件 / specs 6 件 / guides / reference

L3+L4（積極的削除 + 階層構造再考）を適用し、後方互換破壊を許容する代わりに naming / placement / dispatch template 等の SSoT を再設計する。

## 2. アーキテクチャ

### 2.1 全体構造

```
docs/superpowers/plans/2026-04-27-clean-break-c5.md (1 plan)
├─ Phase 1: C5b (Rules barrel-index + paths + stale)        — 4-6 commit
├─ Phase 2: C5c (Subagents canonical + dispatch-template)   — 2-4 commit
├─ Phase 3: C5a (Skills new fields + responsibility merge)  — 3-5 commit
└─ Phase 4: C5d (Docs ADR README + dangling + archive)      — 5-8 commit
                                                  合計 14-23 commit
```

Phase 順序は α 案（C5b → C5c → C5a → C5d）採用。根拠:

- **C5b 先行**: rules は全 phase が参照する SSoT。stale rule を先に解消することで C5c/C5a/C5d の dispatch prompt や docs link 修正が安定する
- **C5c が C5a より先**: dispatch-template skill 抽出（C5c の output）が C5a の skill responsibilities 整理に影響する
- **C5d 最後**: 上記 3 phase の output（rule 名 / agent 名 / skill 名）変更を docs index に最後で同期

### 2.2 Context 予算戦略

CLAUDE.md learning「path-scoped auto-load の累積消費を予算管理」「context 圧迫後は残 task を bundle dispatch で context isolation を取る」を厳守:

- 各 phase = **1 implementer dispatch** で複数 commit を完成
- Implementer には git 全面禁止（add / commit / push / reset / checkout / restore / stash 全部禁止）、編集のみ
- Controller は phase 完了後 `git status --short` + `git show --stat HEAD` で git verify、phase 別 commit に分離して stage + commit
- Reviewer は phase 完了ごとに **combined**（spec compliance + code quality 1 dispatch）— 4 phase × 1 reviewer = 4 reviewer dispatch
- Plan の Read は Task 単位で `Read offset/limit` 200-300 行刻み、controller が full Read しない

### 2.3 Ground truth (2026-04-27 時点)

- Skills 32 件 / Subagents 25 件
- Rules barrel-index 候補: tailwind 569 行 / zod 746 行（type-safety 452 行は対象外）
- ADR 25 件（最新 `0024-multi-tenant-multi-location-foundation.md`）
- Plans 10 件 / Specs 6 件

## 3. Per-phase Deliverables

### 3.1 Phase 1: C5b — Rules audit + barrel-index 拡張

**目的**: Rules を SSoT として安定化させ、後続 phase の dispatch prompt + docs 修正の参照基盤を整える。

**Deliverables**:

| 成果物                                            | 詳細                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tailwind-patterns.md` (569 行) → barrel-index 化 | 親 `.md` に `paths:` + sub-file links のみ。subtopic 例: `responsive-breakpoints.md` / `container-queries.md` / `grid-overlap.md` / `inline-style-vs-arbitrary.md` |
| `zod-patterns.md` (746 行) → barrel-index 化      | subtopic 例: `validation-schemas.md` / `error-formatting.md` / `cross-field-refine.md` / `array-uniqueness.md`                                                     |
| `paths:` frontmatter 漏れ検出 + 追加              | 全 rule docs を grep し、参照すべき src パスから auto-load されないものに `paths:` 追記                                                                            |
| Stale rule docs 検出 + 削除 / 更新                | 実装に存在しない helper / API 名は rule から削除（grep で `src/` 内参照ゼロを根拠とする）                                                                          |
| `AGENTS.md` 同期                                  | 編集した rule docs に対応する AGENTS.md セクションを byte-identical 同期、`scripts/verify-policy-docs.mjs` で検証                                                  |

**破壊的変更**:

- 既存 `tailwind-patterns.md` / `zod-patterns.md` の内容は subtopic に分割移動（直接 read していた箇所が壊れる）
- Stale 削除した rule 名を CLAUDE.md / 他 rule / agent docs から参照削除

### 3.2 Phase 2: C5c — Subagents canonical + dispatch-template 抽出

**目的**: Subagent frontmatter を公式 canonical 形式に統一し、CLAUDE.md「Subagent 規律」節に散在する dispatch prompt template を skill として SSoT 化する。

**Deliverables**:

| 成果物                                  | 詳細                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全 25 agent frontmatter canonical 化    | `name:` / `description:` (`Use proactively when...` or 「～した後に使用」) / `tools: A, B, C` (comma-separated 単行) / `model: sonnet` / (optional) `memory: project`                                         |
| `memory: project` 整合性確認            | backing dir `.claude/agent-memory/<name>/` または body Memory management 節必須、無いなら frontmatter から削除（2026-04-23 既実施分の続き）                                                                   |
| `subagent-dispatch-template` skill 新設 | `.claude/skills/subagent-dispatch-template/SKILL.md` を作成。CLAUDE.md「Subagent 規律」節の dispatch prompt template（git 全面禁止 + import alias + plan deviation policy + 完了報告フォーマット）を skill 化 |
| 利用実績なし agent 削除（L3）           | `grep -rn "subagent_type=\"<name>\"" .claude/ docs/ CLAUDE.md` で参照ゼロな agent を削除、CLAUDE.md「自動ロード」節 + reviewer dispatch 例も同 commit で更新                                                  |
| **ADR 0026** 採番                       | `docs/architecture/decisions/0026-subagent-dispatch-template-ssot.md` で dispatch template SSoT 移管を ADR として記録                                                                                         |

**破壊的変更**:

- agent frontmatter の YAML list 形式 `tools:` を comma-separated 単行に強制変換
- 削除した agent の参照（CLAUDE.md / 他 agent / docs）を全箇所修正
- CLAUDE.md「Subagent 規律」節の冗長な dispatch prompt template 記述を「→ `subagent-dispatch-template` skill 参照」に短縮

### 3.3 Phase 3: C5a — Skills new fields + responsibility merge

**目的**: Skills に公式新フィールド（`when_to_use:` / `argument-hint:` / `disable-model-invocation:`）を戦略的に適用し、責務重複の解消 + 命名規則統一を行う。

**Deliverables**:

| 成果物                           | 詳細                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `when_to_use:` 戦略的適用        | description だけでは triggering precision 不足の skill に追加                                                                                                                                                                                                       |
| `argument-hint:` 適用            | 引数を取る skill (`/ralph-loop:cancel-ralph` / `/loop` / `/schedule` 等) に hint 表示                                                                                                                                                                               |
| `disable-model-invocation:` 適用 | 人間 trigger 限定の skill (`/cloud-run-debug` / `/instagram-debug` / `/stripe-debug` / `/google-calendar-debug` / `/turbopack-hmr` 等) に `true` 設定し autoload precision 改善                                                                                     |
| 責務重複解消 (L3+L4)             | ① `add-prisma-enum` + `add-settings-field` の共通 scaffolding 部分を skill body or reference 化 ② `lexical-node` / `lexical-plugin` / `lexical-toolbar` の階層関係明確化 ③ `*-debug` skill 群の naming 統一 (`debug-*` プレフィックスへ rename)、`audit-*` 群も同様 |
| Skill rename / merge 参照修正    | CLAUDE.md / docs / 他 skill / agents からの skill 名参照を grep して同 commit で更新                                                                                                                                                                                |
| **ADR 0027** 採番                | `docs/architecture/decisions/0027-skill-naming-convention.md` で `debug-*` / `audit-*` / `add-*` / `create-*` のプレフィックス規則を formalize                                                                                                                      |

**破壊的変更**:

- skill rename で既存 `/<old-name>` invocation が機能しなくなる
- merge した skill の旧名は削除
- CLAUDE.md「公式 API / ベストプラクティス準拠の原則」節 + 各 rule docs 内の skill 名参照を全箇所修正

### 3.4 Phase 4: C5d — Docs audit + cleanup

**目的**: docs/ 全体の整合性を取り、archive 判定 + dangling link 削除 + version drift 修正を行う。

**Deliverables**:

| 成果物                                                | 詳細                                                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR README index 同期                                 | 25 ADR 全て `docs/architecture/decisions/README.md` の表に index されているか grep 検証 + 不足追加                                                       |
| Design docs dangling link 修正                        | `docs/architecture/**/*.md` 内の link を `Glob` で物理実在確認、broken link 修正（C4 で実施した範囲を再確認 + 拡張）                                     |
| 完了済み plan / spec を `.archive/<year>/` 移動       | 10 plans + 6 specs から完了済み（plan 内記載 commit SHA で実装済み確認）を `docs/superpowers/{plans,specs}/.archive/2026/` に移動、README index 同時更新 |
| `docs/guides/` + `docs/reference/` version drift 修正 | `Next.js 16` / `React 19` / `Prisma 7.8` 等の version 表記が `package.json` + `bun.lock` と一致するか grep                                               |
| 廃止済み機能の記述削除                                | Supabase / FullCalendar / Three.js / PixiJS の残骸を docs / Serena memories から削除                                                                     |

**破壊的変更**:

- archive 移動した plan / spec の path が変わる（`docs/superpowers/plans/.archive/2026/` 配下）
- 削除した dangling link 先 file (もし残っていれば) は git 履歴のみに残る
- 廃止済み機能の記述削除

## 4. Acceptance Criteria

### 4.1 Per-phase PASS 判定

| Phase   | PASS 判定                                                                                                                                                                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C5b** | ① `bun run validate` 成功 ② `node scripts/verify-policy-docs.mjs` byte-identical 成功 ③ tailwind/zod barrel-index 配下 sub-file の Live change detection 動作確認 ④ stale rule の helper 名が実装に grep で存在ゼロ                                                                           |
| **C5c** | ① 全 agent (rename/削除分除く) frontmatter が `name`/`description`/`tools (comma-separated)`/`model`/(optional `memory`) を満たす ② dispatch-template skill が SKILL.md spec 準拠 ③ 削除した agent の参照（CLAUDE.md / 他 agent / docs）ゼロを grep ④ `bun run validate` 成功 ⑤ ADR 0026 採番 |
| **C5a** | ① 全 skill (rename/merge 分除く) frontmatter が `name` (1,536 char 上限) / `description` 必須 ② 新フィールド適用済み skill が公式仕様遵守 ③ rename/merge 後の skill 名参照が CLAUDE.md / docs で更新済み ④ Live activation テスト 1 件（`/<renamed-skill>` 起動確認） ⑤ ADR 0027 採番         |
| **C5d** | ① ADR README index 件数 = `ls 00*.md` 件数 ② `docs/architecture/**/*.md` 内 link が `Glob` で実在確認済 ③ archive 後 plan / spec README 更新済み ④ `package.json` version と docs version 表記が grep で一致 ⑤ 廃止済み機能記述ゼロ                                                           |

### 4.2 全体完了判定

- 4 phase 全て PASS
- 各 phase の reviewer combined PASS（spec compliance + code quality）
- `bun run validate && bun run build` 成功
- `git log --oneline` で C5 commit が論理単位ごとに分離

## 5. Risk + Mitigation

| Risk                                     | 影響                                                                        | Mitigation                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Phase 跨ぎ参照修正漏れ                   | rename した skill / agent / rule 名が他 phase の output に残存              | controller が phase 完了ごとに `grep -rn "<old-name>" .claude/ docs/ CLAUDE.md AGENTS.md` 実行、漏れあれば次 phase 冒頭で先行修正 |
| Context 圧迫で plan 完遂不可             | 14-23 commit / 4 phase は単一セッション限界                                 | 各 phase 完了時に「残予算 vs 残 phase」評価、不足なら handoff memory 作成して中断（C5 完遂は次セッション）                        |
| ADR 採番衝突                             | 並走 worktree なし前提だが複数 ADR 採番が同時発生する可能性                 | `git worktree list` で並走確認 + 各 ADR 作成時に `ls 00*.md \| tail -1` で最新確認                                                |
| Stale rule 削除で実装サイレント壊れ      | rule docs に書かれた契約に依存する code が型チェックでなく runtime で壊れる | 削除前に `grep -rn "<helper-name>" src/` で参照ゼロ確認、削除後 `bun run validate && bun run build` フル実行                      |
| Skill rename で既存 user invocation 壊れ | `/<old-skill-name>` が機能しなくなる                                        | CLAUDE.md「自動ロード」節の skill list 更新 + handoff memory に rename mapping 記録 + ADR 0027 で命名規則明記                     |

## 6. ADR 戦略

| 改修                                      | ADR 必要性                                       | 採番 |
| ----------------------------------------- | ------------------------------------------------ | ---- |
| Rule barrel-index 拡張                    | 不要（既存パターン適用）                         | —    |
| Subagent dispatch template skill 抽出     | **必要** — 規律の SSoT 移管 = アーキテクチャ判断 | 0026 |
| Skill rename / merge naming 規則 (L4)     | **必要** — プロジェクト命名規則の formalize      | 0027 |
| Skill `disable-model-invocation` 採用方針 | 不要（公式機能の活用）                           | —    |
| ADR README 同期 / archive 移動            | 不要（housekeeping）                             | —    |

ADR 採番は C5 開始時点で `git worktree list` 並走確認 + `ls docs/architecture/decisions/00*.md | tail -1` 再確認後に確定。

## 7. Out of Scope (YAGNI)

- skill content 内容の品質改善（手順詳細化等）→ 個別 plan
- rule docs の文言改善 / typo 修正 → 個別 plan
- subagent 内部の prompt 改善 → 個別 plan
- `docs/architecture/` design docs 新規作成 → 個別 plan
- `.claude/hooks/` audit → 別 phase（hooks 公式仕様準拠は `gotchas/hooks-patterns.md` 既存）

## 8. 実行規律

各 phase の subagent dispatch では以下を厳守:

- Implementer は sonnet 以上 (haiku 禁止)
- git 全面禁止（add / commit / push / reset / checkout / restore / stash）
- import alias は `@/admin/*` / `@/public/*` / `@/shared/*` の 3 系統 (二重 prefix 禁止)
- Plan deviation policy: plan 記載 identifier と実装が乖離していれば justified deviation として保持し報告
- Phase 完了後に controller は 3 段検証: ① `git status --short` ② `wc -l` で行数 delta 確認 ③ `grep` で期待 symbol 存在 + 削除 symbol 不在
- Reviewer は phase 完了ごとに combined dispatch (spec compliance + code quality 1 prompt)、JSON で `spec_compliance.verdict` / `code_quality.verdict` / `overall_verdict` の 3 値を返す

## 9. 関連 handoff / 参考実装

- `~/.claude/projects/<slug>/memory/project_clean-break-c5-handoff.md` — C5 起動時の ground truth
- `~/.claude/projects/<slug>/memory/project_clean-break-refactor-handoff.md` — C1-C4 完了パターン
- `docs/superpowers/plans/2026-04-27-skills-cleanup.md` — C3 (no-op plan) の参照実装
- `docs/superpowers/plans/2026-04-27-rules-cleanup.md` — C2 の参照実装
- CLAUDE.md「Subagent 規律」節 — dispatch prompt template の SSoT 元（C5c で skill 化対象）
