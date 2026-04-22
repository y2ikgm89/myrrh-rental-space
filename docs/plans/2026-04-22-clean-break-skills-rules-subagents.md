# Clean-Break 再編: skills / rules / subagents / docs

**日付**: 2026-04-22
**種別**: リファクタリング（破壊的変更）
**ステータス**: 設計中

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

### Phase 2: subagents 正規化（独立作業）

`.claude/agents/*.md` の frontmatter を公式仕様に揃える:

- [ ] 全 25 agents に `model: sonnet`（haiku は implementer 禁止、`rate-limit-reviewer` の haiku を sonnet へ）
- [ ] 全 25 agents に `memory: project` を追加
- [ ] `description:` の block scalar (`>`) / inline 混在を block scalar に統一（parse 一貫性）
- [ ] `tools:` を最小権限で列挙（`Read, Grep, Glob` 読み取り系、`Write, Edit` 必要時のみ）

### Phase 3: rules 分割（大ファイル解消）

600+ 行 rules を path-scoped subfile に split:

- [ ] `lexical-patterns.md` (930) → `lexical-patterns/{core,nodes,plugins,toolbar,a11y}.md` に 5 分割（`paths:` frontmatter で選択ロード）
- [ ] `react-patterns.md` (870) → `react-patterns/{compiler,hooks,rhf,ssr,gotchas}.md` に分割
- [ ] `gsap-patterns.md` (729) → `gsap-patterns/{core,scroll-trigger,matchmedia,lenis}.md` に分割
- [ ] 既存 `.md` を barrel index 化（`## 詳細パターン別ファイル` 節で subfile 列挙、path scoping）
- [ ] `paths:` frontmatter で該当ファイル編集時のみロードする grain を細かくする

### Phase 4: docs 二重管理解消

- [ ] `docs/reference/claude-rules/*.md` を完全削除（`.claude/rules/**` に一本化）
- [ ] `docs/reference/codex-rules/*.md` も同様（Codex plugin 用 mirror は runtime sync で再生成）
- [ ] `docs/plans/archive/completed-legacy.md` (2487 行) を summary に圧縮（詳細は git history）
- [ ] `docs/requirements/**` を ADR 昇格または削除（実装に吸収済みの stale 要件定義を除去）

### Phase 5: skills 正規化

- [ ] 全 29 skills の description を「動詞始まり + trigger 条件明示」形式に統一（Anthropic 公式推奨）
- [ ] debug skill 系（200+ 行）を `reference/*.md` + 手順本文に split（`ops/cloud-run-debug.md` 等）
- [ ] `lexical-*` skill 群（4 つ）のスコープ境界を明文化（audit / node / plugin / toolbar の使い分け表を SKILL.md 先頭に追加）

### Phase 6: hook 改善

- [ ] `empty-dynamic-route-dir` hook を `find <dir> -name "route.ts" | head -1` ベースに修正（nested route を誤検出しない）
- [ ] audit subagent prompt に `.claude/rules/**/*.md` の「例外」「sanctioned exception」節を cross-reference させるガイダンスを追加

---

## 実行戦略

- **単一 implementer に Phase をバンドルしない** — Phase 2〜6 は互いに独立（ファイル空間が分離）のため並列 implementer dispatch 可能
- **Phase ごとに 1 commit** — rollback 容易化（ADR-0015 clean-break 原則）
- **phase 間は同一 worktree** — CLAUDE.md / `.claude/**` 編集は軽量のため worktree 分離不要
- **検証** — 各 phase 完了後に `bun run validate && bun run build` + `grep -rln "<削除 symbol>"` で drift ゼロ確認
- **subagent driven** — `superpowers:subagent-driven-development` で phase ごとに implementer dispatch、controller が差分検証

---

## 所要見積り

| Phase | 見積時間 | 並列性           | 備考                                   |
| ----- | -------- | ---------------- | -------------------------------------- |
| 1     | 済       | —                | このドキュメント                       |
| 2     | 30 分    | 単独             | 25 agents frontmatter 一括更新         |
| 3     | 2 時間   | 単独             | 3 大 rules を split、path scoping 調整 |
| 4     | 1 時間   | Phase 3 と並列可 | docs/reference 削除 + stale 要件整理   |
| 5     | 1.5 時間 | Phase 2 と並列可 | 29 skills description 統一 + split     |
| 6     | 30 分    | 単独             | hook スクリプト修正                    |

**合計**: 約 5.5 時間（並列化で 3〜4 時間に短縮可）。単一セッションで完走するか、2〜3 セッションに分割するかは controller 判断。

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
