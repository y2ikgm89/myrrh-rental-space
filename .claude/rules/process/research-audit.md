---
description: 調査・監査プロセスルール — 公式準拠主張・subagent ground truth 検証・gotchas クロスリファレンス
---

# 調査・監査プロセス

> CLAUDE.md からの分離（公式 200 行ガイド準拠）。本ファイルは `paths:` なし＝常時ロード。

## 公式準拠の verification

- **「公式推奨」「クリーン実装」「ベストプラクティス」指示時は context7 verification 必須** — agent dispatch 前に Next.js / React / Prisma / Zod / Better Auth / Lexical / **WAI-ARIA APG（`/w3c/aria-practices`）** の該当バージョン docs を `mcp__context7__query-docs` で取得し、プロジェクトルール（`.claude/rules/**`）との乖離をチェック。プロジェクト独自厳格化（公式より厳しい）は ADR 扱いで保持
- **`mcp__context7__query-docs` の引数は `query`**（`topic` / `question` は誤り）— `{ libraryId, query, tokens }` の 3 引数。誤引数は `InputValidationError: Invalid input: expected string, received undefined` で即失敗
- **context7 に無い Playground / reference implementation は `gh api` で一次ソース直接参照** — Lexical の `FloatingTextFormatToolbarPlugin` / `setFloatingElemPosition` / `DraggableBlockPlugin_EXPERIMENTAL` 等は `@lexical/react` の公開 API ではなく Playground 固有の参考実装のため context7 にヒットしない。`gh api repos/facebook/lexical/contents/packages/lexical-playground/...` で裏取り。主張粒度は「公式 API ドキュメント準拠」ではなく **「reference implementation 準拠」** と明記
- **Radix primitives の具体例**: context7 取得不可 → `WebFetch` で `https://www.radix-ui.com/primitives/docs/components/<name>`
- **Claude Code 自体の公式仕様（hooks/skills/sub-agents/settings/permissions/memory）は `code.claude.com/docs/en/<topic>` を WebFetch で取得** — context7 はサードパーティライブラリ用で Claude Code 本体は未収録。Agent SDK は別ルート（`docs.anthropic.com` 配下）

## a11y 実装の優先順位

- **a11y 実装は ARIA First Rule（"native HTML > ARIA role"）を最優先で適用** — `role="button"` + 自前キーボードハンドラ（Enter=keydown / Space=keyup）は 2nd-best。native `<button>` を absolute overlay + `pointer-events-none/auto` で組み替えられないか先検討（→ `frontend/accessibility/semantics.md`）。2nd-best 実装を提案する前に必ず第一推奨の適用可否を検証
- **a11y 実装前に UX state の実使用を grep で確認** — `selectedId` / `isSelected` 等の state が外部 consumer と連動しない「視覚ハイライト専用」なら dead state として削除候補。dead state に `aria-pressed` / キーボードハンドラ / focus ring を付けるのは over-engineering

## subagent 報告の ground truth 検証

- **精査系 subagent の「使用なし」「欠落」報告は実装 Read + grep で二段検証必須** — grep ベース調査は seed 関数内の間接使用を見落として false positive を出す
- **Explore / 監査 subagent の数値・採用範囲リストは grep で再検証必須** — `breakpoint 使用箇所数` / `@container 採用ファイル数` / `arbitrary 値の件数` 等は rule docs の記述を根拠に hallucinate しやすい
- **bundle「未使用チャンク」報告は `react-loadable-manifest.json` で lazy-load 確認必須** — `.next/server/app/*.html` 埋め込み scan だけでは `next/dynamic` 経由の lazy chunk を「未使用」と誤認
- **review agent の「欠落」「型不整合」報告は Read + Glob で実在確認** — project-reviewer は `Serialized<T>` 型を未把握で Date→string を warning 化、route-structure-reviewer は MINGW64 `()` 含みパス Glob で実在 `loading.tsx` を「欠落」扱いする傾向あり
- **レビューエージェント指摘**: `gotchas.md` と照合して誤報除外。`bun run lint` exit 状態 + Read を ground truth とする
- **大規模監査の前提** — `bun run validate` exit 0 なら compiler/linter 基準クリーン。違反大量報告時はまず validate を ground truth に

## Plan 作成時の事前検証

- **Plan 作成時の rule docs 構造仮定は事前 grep 必須** — テーブル形式 / paragraph 形式 / セクション存在を `grep -nE '^##|^\|' .claude/rules/<file>.md` で実体確認。仮定が外れると implementer DEVIATION → controller 補完 commit の余計な commit が発生
- **Plan 記載の destination URL / API path / route は `ls` で物理実在確認必須** — grep で href が見つかった = route が動作している、ではない。`ls 'src/app/(admin)/.../<resource>/[id]/'` で sub-route 実在を直接確認
- **新機能の表記・命名は類似既存機能と grep で揃えてから plan に書く** — `(コピー)` 半角 vs 全角等。`grep -rn "<related-keyword>" src/shared/domain/<sibling>/` で類似実装比較
- **Plan の修正対象 file リストは `grep -rln "<symbol>" src/` で実体検証してから書く** — caller を全列挙しないと「plan 外ファイル並行修正」が justified deviation として頻発。caller 数を Files 節に記載
- **Plan 記載の component prop / type 仕様も `ls + grep` で実在確認必須** — 公開 Component の prop 表（`grep -nE "interface .+Props" <component-file>`）/ import 元 export（`grep -nE "^export" <module-file>`）/ 型 field 一覧（`grep -A20 "interface BusinessInfo" <type-file>`）の 3 軸を ground truth として確認
- **Plan 内の helper / API 名は rule docs 記述を盲信せず実装 grep で照合** — `.claude/rules/<>.md` が stale 化している場合あり。`grep -rln "^export.*<helper>" src/` で実在確認、不在なら rule docs 自体を後追い codify
- **Plan の Task が別 plan / 既存実装で対処済の場合 no-op 判定が正しい完遂** — implementer は「やらなくていい」を BLOCKED でなく DONE_WITH_CONCERNS で報告

## SSoT 重複検出と version drift

- **SSoT 重複検出の grep**: symbol 名だけでなく **literal 文字列**（`"スーパー管理者"` 等）でも再 grep
- **`<library> X.Y` 形式の version 表記は `package.json` (SSoT) と drift しやすい** — `bun update` 後は `grep -rn '<lib> [0-9]\+\.[0-9]\+' .claude/ CLAUDE.md src/` で参照箇所一括更新
- **ESLint `no-restricted-syntax` selector は静的+動的両対応** — `> ArrayExpression` は literal `[a, b]` のみ、`items.map(...)` 等の動的配列を見逃す。`CallExpression[callee.property.name='map']` 経路も `selector` に含める
- **`grep '^<field>: ' .claude/{agents,skills}/**/\*.md`の frontmatter audit は body 内コード例の偽陽性に注意** — Zod schema コード例の`name: z.string()`等が frontmatter`name:` と誤カウントされる
- **rule docs vs 実装 drift 解消は実装 SSoT で rule docs 追従** — `.claude/rules/**` の helper / 型 / import が src/ 不在で実装が別 helper で動作している場合、production 動作中の実装が canonical。ADR 不要、1 commit で完結
- **一括修正後**: Grep で違反パターン残存ゼロ確認してから完了報告

## 完了プラン参照時の注意

- **Plan `完了` ステータスでも実装存在とは限らない** — 大規模リデザイン・命名規約変更で機能が削除／置換されることあり。plan 参照時は `Glob` で実在確認 + `Grep` で代表 symbol + `git log --oneline -- <path>`

## Edit tool gotcha

- **Edit tool は old_string / new_string 内の `\u00XX` literal escape を実 Unicode 文字に normalize する** — JSON parsing 段階で `¥` → `¥` 等に変換。literal escape sequence を保持したまま書き出す場合は Python script (`chr(92) + 'u00A5'`) で迂回
