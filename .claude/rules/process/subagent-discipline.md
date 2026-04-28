---
description: Subagent dispatch / 検証 / context 予算管理の規律 — subagent-dispatch-template SKILL の補足
---

# Subagent 規律

> CLAUDE.md からの分離（公式 200 行ガイド準拠）。本ファイルは `paths:` なし＝常時ロード。
>
> Implementer dispatch prompt の SSoT は `.claude/skills/subagent-dispatch-template/SKILL.md`（ADR 0025）— git 全面禁止 / import alias 3 系統 / plan deviation policy / 完了報告フォーマットを skill 1 箇所で管理。本ファイルは skill 補足。

## 基本

- **implementer は sonnet 以上**（haiku 禁止、report 捏造リスク）
- **完了報告後は独立検証**: `git log --oneline` + `git show --stat HEAD`
- **密結合タスクは 1 implementer にバンドル**
- **Sequential-commit plan も 1 implementer に bundle 推奨** — 「N Task それぞれが独立 commit を要求する」plan は 1 dispatch + 「各 Task で commit + commit message は plan 指定文字列をそのまま使用」指示。中間 type-check broken でも plan 範囲が短いため許容
- **dispatch プロンプトに「plan 記載 identifier と実装が乖離していれば justified deviation として保持し報告」を明記** — plan に合わせた強制 rename 禁止
- **plan 実行前の前提実在確認** — plan に「既存テスト XXX に mock 追加」「既存ファイル YYY を修正」と記載されていても、実行前に `ls <path>` / `Glob` で実在確認必須。実在しない場合は Bundle スコープを「pure function 抽出 + 新規 unit test」「小機能追加」等に変換する判断を controller が行う

## SSoT ヘルパーの保護

- **SSoT ヘルパー（`executeAdminMutationResult` / `fireAndForget` / `safeFetch` / `sendEmail` 等）の改修は ADR / rule ファイルで実行順序・契約を事前確認必須** — 別 AI / implementer が「クリーンに直す」指示で契約を壊す事故あり（例: `await logAction` 化 → cache invalidation スキップ regression、ADR 0019）。dispatch prompt には「該当 ADR / rule を Read してから変更」「契約破りを疑ったら justified deviation として報告」を明記

## reviewer / explore agent 検証

- **review agent の「欠落」「型不整合」報告は Read + Glob で実在確認** — project-reviewer は `Serialized<T>` 型システムを未把握で Date→string を warning 化、route-structure-reviewer は MINGW64 `()` 含みパス Glob で実在 loading.tsx を「欠落」扱いする false positive 傾向あり
- **reviewer は MINGW64 `()` 含みパス Glob で誤検出する** — cache-strategy-reviewer 等が `src/shared/lib/constants/` 実在を「不在」と報告し「キャッシュ実装なし」と結論する false positive。`ls src/shared/lib/constants/` + `grep -rln "updateTag\|revalidateTag\|'use cache'" src/` で独立検証

## context 予算管理

- **2000+ 行 plan の Read 戦略** — controller が full Read すると `.claude/rules/**` path-scoped auto-load と相まって context が破裂する。Task ごとに `Read offset/limit` で 200-300 行ずつ読み、implementer には plan の path を渡して該当 Task のみ Read させる
- **`subagent-driven-development` skill invoke + worktree 内 file Read の同時発火は context 二重圧迫** — skill content（合計 ~30K chars）と worktree 配下 `.claude/rules/**` の path-scoped autoload が同ターンで system-reminder 注入される。skill invoke 前に「本セッションで実装まで完遂可能か」予算判断
- **controller inline 実装でも path-scoped rule auto-load の累積消費を予算管理する** — 単一セッション内で `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/**` / `src/shared/domain/**` / `src/app/(public)/_shared/components/**` 等を跨いで連続編集すると、path-scoped で 100K+ token 消費する。Task 単位で「touch するファイル群が同一 path-scope に収まるか」を事前判定し、跨ぐなら **Task 完了 commit ごとにセッション分割を検討**
- **controller context が path-scoped auto-load で圧迫された後は残 task を bundle dispatch で context isolation を取る** — subagent fresh context が rule auto-load を再吸収しても controller は影響を受けない。判定基準: 残 task の実装行数 < 1500 行 + plan の commit 分割が明確 + controller の path-scoped 残量 < 30%
- **Phase plan の path-scoped auto-load 予算は 4 領域跨ぎで判定** — 4 領域跨ぎ Plan は ~100K tokens auto-load を発火し controller inline 完遂不可。**Sequential-commit plan は 1 implementer bundle dispatch + controller Bundle 別 commit** 戦略を最初から採用し、implementer には git 全面禁止 + Bundle 別 commit message を plan に明記
- **並列 reviewer dispatch 前に `.claude/rules/**` 準拠度を grep で先行確認** — rule で既に厳格化済みのパターン（`revalidateTag\(.\*,`/`useCallback\(`/`gsap.matchMedia` 等）は 1 回の grep で violations ゼロを判定可能。多数の reviewer を並列起動するより、grep hits を元に必要 reviewer を絞る

## 並列実行 / 検証

- **implementer dispatch の git 禁止は `add`/`commit`/`push` だけでなく `reset`/`checkout`/`restore`/`stash` も全面禁止明記必須** — 並列 implementer で一方の `git reset` / `git restore` が他方の成果や controller の直前編集を silent revert する事故が実発生。prompt に 🚫 `git add / commit / push / reset / checkout / restore / stash` を明記
- **parallel implementer 完了後は 3 段検証** — ① `git status --short`（modifications + untracked 列挙、hook 出力は truncate されうるため authoritative でなく `git status` 直接実行が ground truth）② `wc -l` で対象ファイルの行数 delta 確認 ③ `grep` で期待 symbol 存在 + 削除 symbol 不在を確認
- **long-running general-purpose agent（tool_uses 40+ / duration 300s+）の最終報告が途切れたら git で独立検証** — SendMessage で再取得を待つより `git status --short` + `git diff --stat HEAD` + 対象ファイル個別 diff の方が速く正確

## prompt 規律

- **implementer dispatch prompt に「JSDoc / コメントに "Phase X.Y" / "refactor from Y" / "後継 UI" 等のタスク・フロー参照を含めない」を明示** — デフォルトで混入しがち。CLAUDE.md の general rule「Don't reference the current task, fix, or callers」と衝突し commit 前の grep + cleanup が発生
- **subagent frontmatter `memory: project` は実利用がある場合のみ付ける** — 公式仕様で MEMORY.md (200行/25KB) が system prompt 注入される。本文で MEMORY 参照を持つ設計か `.claude/agent-memory/<name>/` に dir があるかで判定。未使用で付けると context 浪費 + 最小権限原則違反

## reviewer 戦略

- **小規模 Bundle（1-4 task / 4-5 commit）は combined reviewer（spec + quality 1 dispatch）を推奨** — Bundle 全てに spec / quality 個別 reviewer を厳格適用すると 1 plan で 6+ reviewer dispatch になり context 圧迫。combined prompt は spec compliance check と code quality check の両 section を 1 prompt 内に同居させ、JSON で `spec_compliance.verdict` / `code_quality.verdict` / `overall_verdict` の 3 値を返させる
- **frontmatter のみ / config 変更等の trivial Bundle (logic 変更ゼロ・test 不要・1-5 commit) は executing-plans + controller inline 実行が最適** — subagent dispatch + reviewer の context overhead に見合わない

## enum cascade refactor の Bundle 設計

- **enum cascade refactor の Bundle 設計** — 共通リソース（`enums/helpers.ts` の状態遷移マップ等）は最初の Bundle に同梱して並列 dispatch 時の同一ファイル race を回避、後続 Bundle は読み取り専用に。implementer の dispatch を sequential bundle にする場合も「共通リソース → 各リソース固有」の順を保つ
