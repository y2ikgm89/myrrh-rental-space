---
description: 調査・監査プロセス — 公式準拠 verification / subagent ground truth 検証 / Plan 事前検証
paths:
  - ".claude/agents/**"
  - ".claude/skills/audit-*/**"
  - ".claude/skills/verify-subagent-report/**"
  - "docs/superpowers/plans/**"
  - "docs/superpowers/specs/**"
---

# 調査・監査プロセス

## 公式準拠の verification

- **「公式推奨」「クリーン実装」「ベストプラクティス」「後方互換なし」指示時は context7 + WebFetch verification 必須**:
  1. `mcp__context7__query-docs` で一次資料取得（Next.js / React / Tailwind / Radix / Better Auth / Prisma / Zod / Lexical / WAI-ARIA APG）
  2. Claude Code 本体の仕様（hooks/skills/sub-agents/settings/permissions/memory）は `code.claude.com/docs/en/<topic>` を WebFetch
  3. プロジェクトルール（`.claude/rules/**`）と公式推奨の**差分を ADR 扱いで保持**（プロジェクト独自厳格化は正当化・記録）
  4. 数値・採用範囲リストは grep ground truth 検証（subagent hallucination 防止）
  5. `@theme` / SSoT / ルール docs の整合を**同一コミット**で保つ
  6. 破壊的変更は phase 単位で 1 commit 完結、`docs/superpowers/plans/YYYY-MM-DD-<name>.md` に記録
  7. 事前監査で全 PASS の「クリーン実装」指示は **no-op plan で valid 完了** — 強引な改修コミットを作らず canonical 記録のみ
- **`mcp__context7__query-docs` の引数は `query`**（`topic` / `question` は誤り）— `{ libraryId, query, tokens }` の 3 引数。誤引数は `InputValidationError: Invalid input: expected string, received undefined` で即失敗
- **context7 に無い Playground / reference implementation は `gh api` で一次ソース直接参照** — Lexical の `FloatingTextFormatToolbarPlugin` / `setFloatingElemPosition` / `DraggableBlockPlugin_EXPERIMENTAL` 等は `@lexical/react` の公開 API ではなく Playground 固有の参考実装のため context7 にヒットしない。`gh api repos/facebook/lexical/contents/packages/lexical-playground/...` で裏取り
- **Radix primitives の具体例**: context7 取得不可 → `WebFetch` で `https://www.radix-ui.com/primitives/docs/components/<name>`

## a11y 実装の優先順位

- **a11y 実装は ARIA First Rule（"native HTML > ARIA role"）を最優先で適用** — `role="button"` + 自前キーボードハンドラ（Enter=keydown / Space=keyup）は 2nd-best。native `<button>` を absolute overlay + `pointer-events-none/auto` で組み替えられないか先検討（→ `frontend/accessibility/semantics.md`）
- **a11y 実装前に UX state の実使用を grep で確認** — `selectedId` / `isSelected` 等の state が外部 consumer と連動しない「視覚ハイライト専用」なら dead state として削除候補

## subagent 報告の ground truth 検証

- **精査系 subagent の「使用なし」「欠落」報告は実装 Read + grep で二段検証必須** — grep ベース調査は seed 関数内の間接使用を見落として false positive を出す
- **Explore / 監査 subagent の数値・採用範囲リストは grep で再検証必須** — `breakpoint 使用箇所数` / `@container 採用ファイル数` / `arbitrary 値の件数` 等は rule docs の記述を根拠に hallucinate しやすい
- **bundle「未使用チャンク」報告は `react-loadable-manifest.json` で lazy-load 確認必須** — `.next/server/app/*.html` 埋め込み scan だけでは `next/dynamic` 経由の lazy chunk を「未使用」と誤認
- **review agent の「欠落」「型不整合」報告は Read + Glob で実在確認** — project-reviewer は `Serialized<T>` 型を未把握で Date→string を warning 化、route-structure-reviewer は MINGW64 `()` 含みパス Glob で実在 `loading.tsx` を「欠落」扱いする傾向あり
- **レビューエージェント指摘**: `claude-code-patterns.md` と照合して誤報除外。`bun run lint` exit 状態 + Read を ground truth とする
- **大規模監査の前提** — `bun run validate` exit 0 なら compiler/linter 基準クリーン。違反大量報告時はまず validate を ground truth に
- **「クリーン実装になってる？」「型アサーションない？」等のスコープ曖昧監査依頼は WIP 差分か全プロジェクトかを明示確認** — subagent dispatch prompt にも scope を明記必須。WIP 差分のみで「クリーン」と報告し、ユーザーは全プロジェクトを意図していて手戻り発生する silent UX bug（2026-05-08 実発生、project-reviewer の WIP-only スコープに気付かず）

## Plan 作成時の事前検証

- **Plan 作成時の rule docs 構造仮定は事前 grep 必須** — テーブル形式 / paragraph 形式 / セクション存在を `grep -nE '^##|^\|' .claude/rules/<file>.md` で実体確認
- **Plan 記載の destination URL / API path / route は `ls` で物理実在確認必須** — grep で href が見つかった = route が動作している、ではない
- **新機能の表記・命名は類似既存機能と grep で揃えてから plan に書く** — `(コピー)` 半角 vs 全角等
- **Plan の修正対象 file リストは `grep -rln "<symbol>" src/` で実体検証してから書く** — caller を全列挙しないと「plan 外ファイル並行修正」が justified deviation として頻発
- **Plan 記載の component prop / type 仕様も `ls + grep` で実在確認必須** — 公開 Component の prop 表 / import 元 export / 型 field 一覧の 3 軸を ground truth として確認
- **Plan 内の helper / API 名は rule docs 記述を盲信せず実装 grep で照合** — `.claude/rules/<>.md` が stale 化している場合あり。実装 SSoT で rule docs 追従
- **Plan の Task が別 plan / 既存実装で対処済の場合 no-op 判定が正しい完遂** — implementer は「やらなくていい」を BLOCKED でなく DONE_WITH_CONCERNS で報告
- **Plan の "新規作成" 系 task 候補は対象 SSoT シンボル名を `grep -rn "<symbol>" src/` で先行検証必須** — earlier phase が予防的に SSoT を入れているケースあり（実例: 2026-05-09 Phase 4 plan で `portableTextBlockSchema` / `createBlockArraySchema` / `createBlock` / `blocksToPlainText` を新規 Task 1 として記述したが、Phase 0 commit `2c8c86b9` の時点で既に `src/shared/lib/portable-text/{schema,factory,text,index}.ts` に実装済だった）。「Phase N で span を入れたついでに block も factory に追加」のような pre-emptive SSoT は phase 跨ぎで起きやすい。plan 作成前に各新規 task の中核 symbol で grep し、hit があれば task を「不要」or「修正のみ」に格下げ

## SSoT 重複検出と version drift

- **SSoT 重複検出の grep**: symbol 名だけでなく **literal 文字列**（`"スーパー管理者"` 等）でも再 grep
- **`<library> X.Y` 形式の version 表記は `package.json` (SSoT) と drift しやすい** — `bun update` 後は `grep -rn '<lib> [0-9]\+\.[0-9]\+' .claude/ CLAUDE.md src/` で参照箇所一括更新
- **ESLint `no-restricted-syntax` selector は静的+動的両対応** — `> ArrayExpression` は literal `[a, b]` のみ、`items.map(...)` 等の動的配列を見逃す。`CallExpression[callee.property.name='map']` 経路も `selector` に含める
- **`grep '^<field>: ' .claude/{agents,skills}/**/\*.md`の frontmatter audit は body 内コード例の偽陽性に注意\*\*
- **rule docs vs 実装 drift 解消は実装 SSoT で rule docs 追従** — `.claude/rules/**` の helper / 型 / import が src/ 不在で実装が別 helper で動作している場合、production 動作中の実装が canonical
- **一括修正後**: Grep で違反パターン残存ゼロ確認してから完了報告

## 完了プラン参照時の注意

- **Plan `完了` ステータスでも実装存在とは限らない** — 大規模リデザイン・命名規約変更で機能が削除／置換されることあり。plan 参照時は `Glob` で実在確認 + `Grep` で代表 symbol + `git log --oneline -- <path>`

## Edit tool gotcha

- **Edit tool は old_string / new_string 内の `\u00XX` literal escape を実 Unicode 文字に normalize する** — JSON parsing 段階で `¥` → `¥` 等に変換。literal escape sequence を保持したまま書き出す場合は Python script (`chr(92) + 'u00A5'`) で迂回
