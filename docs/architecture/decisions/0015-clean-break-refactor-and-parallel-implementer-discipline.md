# 0015. Clean-break refactor 原則と parallel implementer の git 副作用規律

- **Status**: Accepted
- **Date**: 2026-04-22
- **Deciders**: y2ikgm89
- **Supersedes**: なし
- **Related**: ADR-0010（per-directory test batch）/ ADR-0012（executeAdminMutationResult）/ `.claude/rules/react-patterns.md` §Outer/Inner Component Split

## Context

公式推奨（React / TypeScript / Next.js / Prisma / Tailwind / WAI-ARIA）に後方互換性なしで準拠するクリーン実装を継続的に維持するために、以下 2 つの運用リスクが 2026-04-22 セッションで露見した:

### リスク A: Thin mode dispatcher の構造的 drift

`TermsInlineEditor.tsx` (93 行) は `mode: "create" | "edit"` を受けて `<TermsInlineEditorCreate>` / `<TermsInlineEditorEdit>` に routing する薄い dispatcher で、outer に `useState(() => HTML→JSON 変換)` を持っていた。これは `.claude/rules/react-patterns.md` §Outer/Inner Component Split の strict 規則「outer に hooks を置かない（pure gate にする）」に違反するが、命名上「Outer/Inner Split」ではなく「mode dispatcher」のため従来は検出規則の対象外だった。

pages（`terms/new/page.tsx` と `terms/[id]/edit/page.tsx`）は静的に mode を選択できるため、dispatcher は実質 routing 以外の付加価値がなく、discriminated union props（`mode` + create props + edit props）も冗長だった。

### リスク B: Parallel implementer 間の git silent revert

`TaxonomyEditor` / `EventForm` / `SidebarSection` / `TermsInlineEditor` の 4 ファイル分割を 4 つの implementer subagent に並列委譲した際、以下の事故が発生した:

- HEAD@{0} に `reset: moving to HEAD` が記録
- controller の quick fixes 5 件（`project_overview.md` / `EditorHeader.tsx` / `events/[slug]/page.tsx` / `admin-queries.ts` / `layout.tsx`）が silent revert
- Sidebar / Terms agent の main file 修正も silent revert（新規 sub-file は存在するが orchestrator が元の 790 / 791 行のまま）
- `[post-subagent] git snapshot` hook の出力は 1 回目 5 件 / 3 回目 2 件と truncate し authoritative でない
- `system-reminder`「X was modified by linter」は edit 時点の snapshot を表示し、その後の revert を反映しない（stale）

既存規律 `implementer dispatch の staging discipline 強化`（CLAUDE.md）は `git add / commit / push` のみ禁止で、`git reset / checkout / restore / stash` は対象外だった。

## Decision

### D1: Thin mode dispatcher は clean-break で削除

`if (mode === "x") return <X/>` + 軽微な state 変換だけの dispatcher は、routing を pages に inline + state 変換を使用する component に移譲して削除する。dispatcher 層の `useState` は上記 Outer/Inner Component Split strict 規則違反で、mode が props 由来で runtime 変化しない場合は discriminated union props も不要。

**判断基準**:

- dispatcher 本体が hooks + `if (mode) return <X/>` の 2 要素のみ
- hooks の state が mode branch の一方でのみ使われる
- pages が静的に mode を選択できる

**clean-break 手順（後方互換シム禁止）**:

1. dispatcher が持つ state 変換を inner component 内へ `useState` 遅延初期化で移譲
2. inner component の props API を「変換前の生データ」を受ける形に変更
3. pages が dispatcher 経由ではなく inner component を直接 import
4. `mode` prop と discriminated union props 型を削除
5. dispatcher ファイルを削除（re-export barrel / deprecated alias は一切作らない）

### D2: Parallel implementer への git 副作用全面禁止

implementer subagent の prompt には 🚫 `git add / commit / push / reset / checkout / restore / stash` を全面禁止として明記する。staging は controller 側で実行し、implementer は編集のみを行う。

根拠は Git 公式: `git reset` / `git restore` / `git checkout` / `git stash` はいずれも working tree を変更しうる（他の agent の未コミット変更を silent revert する）。`git add / commit / push` は他ファイルを巻き込むが、`reset / restore` はさらに破壊的で、どの agent がいつ実行したか controller からは観測できない（reflog で事後検出のみ）。

### D3: Parallel implementer 完了後の 3 段検証プロトコル

並列 implementer が全員完了報告を返した後、controller は以下を必ず実行する:

1. **`git status --short`** — modifications + untracked を列挙。`[post-subagent] git snapshot` hook 出力は truncate されうるため authoritative でなく、`git status` 直接実行を ground truth とする。
2. **`wc -l` 対象ファイル** — agent 報告の行数 delta と照合。agent が「旧 N → 新 M」と報告しても実体が変わっていないケースを検出。
3. **`grep` 期待 symbol** — 分割後に期待される新規 import / 既存 symbol の存在、削除された symbol の不在を確認。`system-reminder` の「X was modified」は stale snapshot のため、grep / Read による現物確認が ground truth。

異常検出時は該当 agent のタスクを再 dispatch（単独か、他 agent が完了した後の順次実行）し、その間に controller 側の quick fixes を再適用する。

## Consequences

### Positive

- 薄い dispatcher による無価値な indirection が排除され、pages が意図を直接表現する
- Outer/Inner Split strict 規則が mode dispatcher にも一貫適用される
- Parallel implementer の silent revert 事故が予防される
- `git status` / `wc -l` / `grep` の 3 段検証がルーチン化され、agent 報告の盲信が防がれる

### Negative

- implementer prompt に禁止事項を毎回記述する冗長性（テンプレ化で緩和）
- 並列 dispatch 後の検証ステップが追加される（数秒のコスト）

### 既存コードへの影響

- `TermsInlineEditor.tsx` (93 行 dispatcher) は削除済み。pages は `TermsInlineEditorCreate` / `TermsInlineEditorEdit` を直接 import
- `CLAUDE.md` §Subagent 規律 / `.claude/rules/react-patterns.md` §Outer/Inner Component Split に規律を追記（2026-04-22）

## Compliance

- CLAUDE.md L176-177: implementer dispatch の git 全面禁止 + 3 段検証
- `.claude/rules/react-patterns.md` §Thin mode dispatcher は clean-break で削除推奨
- implementer 系 agent の prompt template は本 ADR の D2 を遵守
- 今後の similar dispatcher pattern は D1 を適用して削除判定

## Follow-up

- `.claude/skills/verify-subagent-report` に parallel dispatch 用セクションを追加（ADR と同時作業）
- `.claude/agents/large-file-detector` を Client Component split にも対応拡張（ADR と同時作業）
