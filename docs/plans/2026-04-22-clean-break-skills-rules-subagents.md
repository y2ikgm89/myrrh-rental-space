# Clean-Break 再編: skills / rules / subagents / docs

**日付**: 2026-04-22
**種別**: リファクタリング（破壊的変更）
**ステータス**: 実装中（Phase 2 + 6 完了、Phase 3 / 4 / 5 は scope 再設計が必要）

---

## 概要

`.claude/skills/` / `.claude/rules/` / `.claude/agents/` / `docs/` の 4 領域を公式推奨（Anthropic Claude Code / Agent SDK ベストプラクティス）に合わせて破壊的クリーン実装する。ADR-0015（clean-break 原則）の次の適用対象。

**現状サマリー**（2026-04-22 計測）:

| 領域               | ファイル数 | 最大サイズ                 | 所見                                                                                                   |
| ------------------ | ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `.claude/skills/*` | 29         | 243 行（cloud-run-debug）  | 500 行未満で比較的健全。debug skill 系（cloud-run / google-calendar / instagram / stripe）が肥大化傾向 |
| `.claude/rules/**` | 36         | 930 行（lexical-patterns） | 6 ファイルが 600+ 行。path-scoped 自動ロードで context 圧迫リスク                                      |
| `.claude/agents/*` | 25         | —                          | frontmatter 不統一: `model: haiku` 混在（rate-limit-reviewer）、`model:` / `memory:` 欠落多数          |
| `docs/**`          | 72         | 2487 行（legacy-archive）  | `docs/reference/claude-rules/*` が `.claude/rules/` と二重管理（`gsap-reference.md` 1843 行等）        |

---

## 非自明な検出事項（本セッション）

1. **post-tool hook `empty dynamic route dir` 検出は false positive を含む** — `src/app/(admin)/admin/api/terms/[id]/agreements/route.ts` / `src/app/api/faq/[id]/{helpful,view}/route.ts` のように nested route がある `[id]/` セグメントも「空」と報告される。hook ロジックを `find <dir> -type f -name "route.ts"` ベースに修正、または allowlist 追加が必要
2. **汎用 audit agent（SSoT audit / architecture boundary）は feature-specific rule の sanctioned exception を cross-check しない** — `LayoutFields.tsx` の `any` は `admin-inline-editor-patterns.md` で明示許可だが generic audit は 1 件違反として報告。audit agent prompt に `.claude/rules/**` の「例外」節を cross-reference させる改善が必要
3. **`docs/reference/claude-rules/*.md` は `.claude/rules/**`と同一内容の二重管理** —`gsap-reference.md`/`react-api-reference.md`/`lexical-patterns.md`等（合計 ~3300 行）。clean-break で削除し`.claude/rules/\*\*` に一本化すべき

---

## 実装 Phase

### Phase 1: 設計 + 現状計測（このドキュメント）

- [x] 現状計測（ファイル数・サイズ分布・frontmatter drift）
- [x] 非自明な検出事項を整理
- [ ] ADR 0016 起案（agents frontmatter SSoT + docs/reference 撤去）

### Phase 2: subagents 正規化（独立作業）— ✅ 完了（commit `5c4c79c3`）

`.claude/agents/*.md` の frontmatter を公式仕様に揃える:

- [x] 全 25 agents に `model: sonnet`（9 件 haiku → sonnet、rate-limit-reviewer 含む）
- [x] 全 25 agents に `memory: project`（5 件 local → project、4 件追加）
- [x] `description:` の block scalar (`>`) / inline 混在を block scalar に統一（2 件: rate-limit-reviewer / lexical-reviewer）
- [x] `tools:` 最小権限は既存で概ね適切。大幅変更不要と判定

### Phase 3: rules 分割（大ファイル解消）— ⚠️ 次セッション再計画

600+ 行 rules を path-scoped subfile に split:

- [ ] `lexical-patterns.md` (930) → `lexical-patterns/{core,nodes,plugins,toolbar,a11y}.md` に 5 分割（`paths:` frontmatter で選択ロード）
- [ ] `react-patterns.md` (870) → `react-patterns/{compiler,hooks,rhf,ssr,gotchas}.md` に分割
- [ ] `gsap-patterns.md` (729) → `gsap-patterns/{core,scroll-trigger,matchmedia,lenis}.md` に分割
- [ ] 既存 `.md` を barrel index 化（`## 詳細パターン別ファイル` 節で subfile 列挙、path scoping）
- [ ] `paths:` frontmatter で該当ファイル編集時のみロードする grain を細かくする
- [ ] **ADR-0013 制約**: `lexical-patterns.md` を split する場合、`docs/reference/codex-rules/lexical-patterns.md` との byte-identical 関係をどう維持するかの設計が必要（mirror も連動 split？それとも canonical 側だけ split して mirror は combined 維持？）→ ADR 改訂が前提

### Phase 4: docs 二重管理解消 — ⚠️ scope 修正（ADR-0013 制約）

**重要な発見（本セッション）**: ADR-0013 `policy-docs-sync` が `docs/reference/codex-rules/**` を byte-identical mirror として必須化。**削除不可**。以下に scope 修正:

- [ ] `docs/reference/claude-rules/*.md` — 4 ファイル（bun-test-reference / gsap-reference / micro-interactions-reference / react-api-reference）。`.claude/rules/**` から「詳細リファレンス」として cross-link されているため、① `.claude/rules/**` に統合するか ② 存続させるか、ケースバイケースで判定。単純削除は broken link を大量発生させるため不可
- [ ] ~~`docs/reference/codex-rules/*.md` 削除~~ — **却下**（ADR-0013 mandate）。byte-identical mirror の canonical 方向（`.claude/rules/frontend/` → `docs/reference/codex-rules/`）を維持
- [ ] `docs/plans/archive/completed-legacy.md` (2487 行) を summary に圧縮（詳細は git history）。削除前に外部参照の grep 必須
- [ ] `docs/requirements/**` を ADR 昇格または削除（実装に吸収済みの stale 要件定義を除去）。8 ファイルのうち外部参照ゼロは `docs/plans/` のみ、慎重に個別判定

### Phase 5: skills 正規化 — ⚠️ scope 縮小

本セッションで skills description を点検した結果、**大半は既に公式推奨（動詞始まり・trigger 明示・cross-link 完備）に準拠**。以下のみ残タスク:

- [ ] debug skill 系（200+ 行: cloud-run-debug / add-prisma-enum / google-calendar-debug / add-settings-field）を `reference/*.md` + 手順本文に split（200 行超の真正 split は大工事のため次セッション）
- [ ] `lexical-*` skill 群（4 つ）の冒頭に使い分け表を追加（現状は相互参照 description のみ）。low priority（現状の description で実運用は機能している）
- [x] ~~全 29 skills description を「動詞始まり + trigger 条件明示」形式に統一~~ — 確認済み、既にクリーン

### Phase 6: hook 改善 — ✅ 完了（commit `5c4c79c3`）

- [x] `empty-dynamic-route-dir` hook を recursive `-type f` 検索に修正。nested route (`[id]/agreements/route.ts` 等) を誤検出しないよう `find "$dir" -type f` でディレクトリ全体が空か確認する方式に変更
- [ ] audit subagent prompt に `.claude/rules/**/*.md` の「例外」「sanctioned exception」節を cross-reference させるガイダンス追加 — 次セッション（LayoutFields の `any` 事例で顕在化）

---

## 実行戦略

- **単一 implementer に Phase をバンドルしない** — Phase 2〜6 は互いに独立（ファイル空間が分離）のため並列 implementer dispatch 可能
- **Phase ごとに 1 commit** — rollback 容易化（ADR-0015 clean-break 原則）
- **phase 間は同一 worktree** — CLAUDE.md / `.claude/**` 編集は軽量のため worktree 分離不要
- **検証** — 各 phase 完了後に `bun run validate && bun run build` + `grep -rln "<削除 symbol>"` で drift ゼロ確認
- **subagent driven** — `superpowers:subagent-driven-development` で phase ごとに implementer dispatch、controller が差分検証

---

## 所要見積り（実績 + 残作業）

| Phase | 見積時間 | 実績     | 備考                                                        |
| ----- | -------- | -------- | ----------------------------------------------------------- |
| 1     | 済       | ✅ 済    | このドキュメント                                            |
| 2     | 30 分    | ✅ 20 分 | 14 agent files 編集（commit `5c4c79c3`）                    |
| 6     | 30 分    | ✅ 10 分 | hook 1 ファイル編集（commit `5c4c79c3` 同梱）               |
| 3     | 2 時間   | 未着手   | ADR-0013 制約の設計決定が先（mirror 連動 split の方針）     |
| 4     | 1 時間   | 再計画   | `codex-rules` 削除は却下、`claude-rules` 個別統合判定が必要 |
| 5     | 1.5 時間 | 縮小     | description 統一は不要と判明、split と lexical-\* 表のみ残  |

**今セッション合計**: 約 30 分で Phase 2 + 6 完了。

**残セッション**: Phase 3 (rules split) + Phase 4 (docs cleanup) + Phase 5 split subset。約 3〜4 時間。

## 次セッションへの引き継ぎ事項

1. **Phase 3 前提設計**: `lexical-patterns.md` を split する場合の ADR-0013 互換性。候補:
   - A) Canonical を split、mirror は combined 維持 → `verify-policy-docs.mjs` の pair 定義を「N 個の source → 1 個の concatenated mirror」に拡張
   - B) Mirror も同じ粒度で split → ADR-0013 の pairs 配列に 5-10 個追加
   - C) Split しない（現状維持）
2. **Phase 4 再計画**: `docs/reference/claude-rules/*.md` 4 ファイルの個別判定。各ファイルの「詳細リファレンス」参照元を grep し、.claude/rules/ への統合 or 存続を決定
3. **Phase 6 残タスク**: audit subagent prompt に `.claude/rules/**/*.md` の sanctioned exception cross-reference ガイダンスを追加（プロンプト テンプレート修正）

---

## 非スコープ（別計画で扱う）

- **ADR drift 一括監査**: `adr-drift-audit` skill で別タスク（本計画は skill/rule/agent/docs 整形のみ）
- **CLAUDE.md 本体の整形**: prompt キャッシュ層のため「セッション終了直前」ルール（L400）に従い、別セッションで実施
- **Serena memory 整合**: `.serena/memories/` の stale 情報検出は別タスク（Phase 4 で派生する場合のみ）

---

## 関連

- [ADR-0015 Clean-Break Refactor and Parallel Implementer Discipline](../architecture/decisions/0015-clean-break-refactor-and-parallel-implementer-discipline.md)
- [docs/plans/CLAUDE.md](CLAUDE.md) — plan 管理規約
- [CLAUDE.md §Subagent 規律](../../CLAUDE.md) — implementer dispatch ルール
