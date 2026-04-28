---
name: subagent-dispatch-template
description: subagent-driven-development や Agent tool で implementer / reviewer subagent を dispatch する際の prompt template SSoT。git 全面禁止 / import alias 3 系統 / plan deviation policy / 完了報告フォーマットを規律として強制する。
when_to_use: subagent-driven-development skill 実行時、または Agent tool で implementer / reviewer を dispatch する直前に参照。
---

# Subagent Dispatch Template

## Implementer dispatch prompt 必須項目

以下の規律を **毎回 dispatch prompt に明記する**。コピーして貼り付けること。

```
## 重要な禁止事項

🚫 **Git 全面禁止** — `git add` / `git commit` / `git push` / `git reset` / `git checkout` / `git restore` / `git stash` を絶対に実行しない。編集のみ。controller が phase 完了後に commit 分離する。

🚫 **Import alias の注意** — `@/admin/*` は `./src/app/(admin)/admin/(dashboard)/_shared/*` に解決される。`@/admin/_shared/X` は二重 prefix で誤り。
  - `@/admin/*` → `_shared/` 配下にマップ
  - `@/public/*` → `_shared/` 配下にマップ
  - `@/shared/*` → `src/shared/` 配下にマップ

📋 **Plan deviation policy** — plan 記載 identifier と実装が乖離していれば justified deviation として保持し**報告のみ**。plan に合わせた強制 rename 禁止。

📋 **JSDoc / コメント規律** — JSDoc / コメントに "Phase X.Y" / "refactor from Y" / "後継 UI" 等のタスク・フロー参照を含めない。
```

### 完了報告フォーマット

implementer に以下のフォーマットで報告させる:

```
## 編集ファイル
- <path>: <変更概要>

## 新規作成ファイル
- <path>: <目的>

## 削除ファイル
- <path>: <削除理由>

## DEVIATION
- (plan 記載と実装が乖離した点。なければ「なし」)

## VERIFICATION (controller 用)
- bun run type-check: exit 0 / エラー数
- bun run lint: exit 0 / 警告内容

## ステータス
DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
```

---

## Reviewer dispatch prompt template (combined)

spec compliance + code quality を 1 dispatch で兼用する combined reviewer:

```
あなたは combined spec/quality reviewer です。以下の 2 軸でレビューし JSON を返してください。

## Spec compliance check
- spec: <spec ファイルパス or インライン spec>
- 各 Task の Files 節に対し、実装ファイルの存在・変更箇所を確認
- plan からの justified deviation（実装都合の命名変更等）は PASS 扱い

## Code quality check
- `.claude/rules/**/*.md` の関連 rule ファイルを path で確認
- `type-safety.md` / `react/*.md` / `tailwind-patterns/*.md` / `zod-patterns/*.md` 等の該当箇所
- `bun run lint` exit 0 前提（CI が通っているものは lint 違反 PASS）

## 返却フォーマット
{
  "spec_compliance": {
    "verdict": "PASS|NEEDS_CHANGES",
    "issues": ["..."]
  },
  "code_quality": {
    "verdict": "PASS|NEEDS_CHANGES",
    "issues": ["..."]
  },
  "overall_verdict": "PASS|NEEDS_CHANGES"
}

NEEDS_CHANGES の場合は `issues` に file:line + 修正内容を記載。
```

---

## Controller の 3 段検証（parallel implementer 完了後）

```bash
# 1. git status — modifications + untracked 列挙（hook output より authoritative）
git status --short

# 2. 行数 delta 確認（agent 報告と照合）
wc -l <対象ファイル>

# 3. 期待 symbol 存在 + 削除 symbol 不在
grep -n "<expected-symbol>" <file>
grep -n "<deleted-symbol>" <file>  # 出力ゼロを確認
```

`system-reminder` の "X was modified by linter" は stale しうるため、必ず `grep` / `Read` で直接確認する。

---

## SSoT ヘルパー改修時の追加明示

`executeAdminMutationResult` / `fireAndForget` / `safeFetch` / `sendEmail` 等を編集する場合は以下を dispatch prompt に追加:

```
⚠️ SSoT ヘルパー改修: 該当 ADR / rule を Read してから変更。実行順序契約（execute → await afterSuccess → fireAndForget(logAction)）を破る変更は DEVIATION として escalate。
```

別 AI / implementer が「クリーンに直す」指示で契約を壊す事故あり（例: `await logAction` 化 → cache invalidation スキップ regression）。

---

## Subagent 規律（補足）

### 基本

- **implementer は sonnet 以上**（haiku 禁止、report 捏造リスク）
- **完了報告後は独立検証**: `git log --oneline` + `git show --stat HEAD`
- **密結合タスクは 1 implementer にバンドル**
- **Sequential-commit plan も 1 implementer に bundle 推奨** — 「N Task それぞれが独立 commit を要求する」plan は 1 dispatch + 「各 Task で commit + commit message は plan 指定文字列をそのまま使用」指示。中間 type-check broken でも plan 範囲が短いため許容
- **plan 実行前の前提実在確認** — plan に「既存テスト XXX に mock 追加」「既存ファイル YYY を修正」と記載されていても、実行前に `ls <path>` / `Glob` で実在確認必須

### Reviewer / Explore agent 検証

- **review agent の「欠落」「型不整合」報告は Read + Glob で実在確認** — project-reviewer は `Serialized<T>` 型を未把握で Date→string を warning 化、route-structure-reviewer は MINGW64 `()` 含みパス Glob で実在 loading.tsx を「欠落」扱いする false positive 傾向あり
- **MINGW64 `()` 含みパス Glob 誤検出** — `ls src/shared/lib/constants/` + `grep -rln "updateTag\|revalidateTag\|'use cache'" src/` で独立検証

### Context 予算管理

- **2000+ 行 plan の Read 戦略** — controller が full Read すると `.claude/rules/**` path-scoped auto-load と相まって context が破裂する。Task ごとに `Read offset/limit` で 200-300 行ずつ読み、implementer には plan の path を渡して該当 Task のみ Read させる
- **`subagent-driven-development` skill invoke + worktree 内 file Read の同時発火は context 二重圧迫** — skill content（合計 ~30K chars）と worktree 配下 `.claude/rules/**` の path-scoped autoload が同ターンで system-reminder 注入される
- **controller inline 実装でも path-scoped rule auto-load の累積消費を予算管理** — Task 単位で「touch するファイル群が同一 path-scope に収まるか」を事前判定し、跨ぐなら **Task 完了 commit ごとにセッション分割を検討**
- **controller context が path-scoped auto-load で圧迫された後は残 task を bundle dispatch で context isolation を取る** — subagent fresh context が rule auto-load を再吸収しても controller は影響を受けない。判定基準: 残 task の実装行数 < 1500 行 + plan の commit 分割が明確 + controller の path-scoped 残量 < 30%
- **Phase plan の path-scoped auto-load 予算は 4 領域跨ぎで判定** — 4 領域跨ぎ Plan は ~100K tokens auto-load を発火し controller inline 完遂不可。**Sequential-commit plan は 1 implementer bundle dispatch + controller Bundle 別 commit** 戦略
- **並列 reviewer dispatch 前に `.claude/rules/**` 準拠度を grep で先行確認\*\* — 1 回の grep で violations ゼロを判定可能なら reviewer 不要

### Reviewer 戦略

- **小規模 Bundle（1-4 task / 4-5 commit）は combined reviewer（spec + quality 1 dispatch）を推奨** — Bundle 全てに spec / quality 個別 reviewer を厳格適用すると 1 plan で 6+ reviewer dispatch になり context 圧迫
- **frontmatter のみ / config 変更等の trivial Bundle (logic 変更ゼロ・test 不要・1-5 commit) は executing-plans + controller inline 実行が最適** — subagent dispatch + reviewer の context overhead に見合わない

### Frontmatter 規律

- **subagent frontmatter `memory: project` は実利用がある場合のみ付ける** — 公式仕様で MEMORY.md (200行/25KB) が system prompt 注入される。本文で MEMORY 参照を持つ設計か `.claude/agent-memory/<name>/` に dir があるかで判定。未使用で付けると context 浪費

### Enum cascade refactor の Bundle 設計

- **共通リソース（`enums/helpers.ts` の状態遷移マップ等）は最初の Bundle に同梱** — 並列 dispatch 時の同一ファイル race を回避、後続 Bundle は読み取り専用に。sequential bundle にする場合も「共通リソース → 各リソース固有」の順を保つ
