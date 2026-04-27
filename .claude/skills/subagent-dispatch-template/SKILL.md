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
- type-safety.md / react-patterns.md / tailwind-patterns.md / zod-patterns.md 等の該当箇所
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
