---
description: Git ワークフロー / Migration / Worktree プロセスルール（採否判定 SSoT）
paths:
  - "prisma/migrations/**"
  - "prisma/schema.prisma"
  - ".github/workflows/**"
  - ".serena/memories/**"
  - "docs/superpowers/plans/**"
  - "docs/superpowers/specs/**"
---

# Git / Migration / Worktree プロセス

## Worktree（公式仕様準拠 SSoT）

> 出典: [Claude Code Worktrees](https://code.claude.com/docs/en/worktrees) / [git-worktree(1)](https://git-scm.com/docs/git-worktree)
> 採用決定後の bootstrap は `.claude/skills/worktree-bootstrap/SKILL.md`。**公式 `claude --worktree` が canonical 経路**、手動 `git worktree add` は legacy fallback。

### 公式機能の active 設定

| 設定                                 | 場所                    | 値       | 目的                                                                                                                                         |
| ------------------------------------ | ----------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `.worktreeinclude`                   | リポジトリ root         | -        | gitignored ファイル（`.env*` / `generated/` / `playwright/.auth/`）を自動 copy                                                               |
| `worktree.baseRef`                   | `.claude/settings.json` | `"head"` | local HEAD（未 push commit + WIP 含む）ベースで worktree 作成。default の `"fresh"`（`origin/HEAD`）だと in-progress feature branch が消える |
| `cleanupPeriodDays`                  | `.claude/settings.json` | `14`     | 孤児化した subagent worktree を 14 日後に自動掃除（uncommitted/untracked/unpushed なしの場合のみ）                                           |
| `.gitignore` で `.claude/worktrees/` | `.gitignore`            | ignored  | 公式 default の worktree 配置を tracked にしない                                                                                             |
| `.gitignore` で `.worktrees/`        | `.gitignore`            | ignored  | legacy manual bootstrap location（後方互換）                                                                                                 |

### Canonical 動線（公式 `--worktree` 経路）

```bash
# 1. 新規 worktree + Claude セッション起動（CLI）
claude --worktree feature-name
#   → .claude/worktrees/feature-name/ に作成、branch 名 worktree-feature-name
#   → .worktreeinclude にマッチする gitignored を自動 copy
#   → 終了時に changes なしなら worktree + branch 自動削除

# 2. PR ベース worktree（レビュー用）
claude --worktree "#1234"
#   → pull/1234/head を fetch、.claude/worktrees/pr-1234/ に作成

# 3. セッション中に Claude に依頼
#   「ワークツリーで作業して」→ Claude が EnterWorktree tool で作成
```

### ✅ 使う場面

- **Subagent 並列 dispatch** — sub-agent frontmatter または `Agent` tool に `isolation: "worktree"` を渡すと **temporary worktree** が公式に切られる（変更なしなら自動 cleanup、`cleanupPeriodDays` で孤児掃除）
- **セッション跨ぎ Phase 分割 plan** — `docs/superpowers/plans/**` の Phase A → B → C 構造、handoff memo 規約（`MEMORY.md` index + 6 点セット）が worktree path 前提
- **Destructive migration を含む実験** — 共有 dev Postgres の WIP を main から隔離。適用後は該当 worktree から dev server 再起動（他 worktree dev server が古い code + 新 schema で `PrismaClientKnownRequestError: The column ... does not exist` → 白画面の silent bug）
- **dev server を別ブランチで常駐させたまま並列実験** — port 3000 占有を避ける（既起動検出は `Another next dev server is already running` で exit 1、3001 fallback あり）
- **PR レビュー** — `claude --worktree "#PR-num"` で fetch + 隔離環境を 1 コマンド構築

### ❌ 使わない場面（main 直接編集が efficient）

- **1-commit で完結する refactor / fix** — worktree path 初回 Read で worktree 内 `.claude/rules/**/*.md` が再 auto-load され、main 側と合わせて 2 セット注入で context 倍消費（2026-05-06 Phase 3 で worktree を途中放棄 → main 直接 commit に切替えて完遂）
- **Frontmatter / config のみの変更** — context overhead に見合わない
- **型エラー fix 等 10 分未満の短時間タスク**
- **Schema 変更前の準備作業** — 先に main で migrate + `migrate resolve --applied` → 後に worktree 作成（共有 dev DB drift 連鎖防止）

**判定基準**: 3 条件全成立で main 直接編集 — ① 単一 commit で完結する scope ② migration なし ③ 中間状態で `type-check` broken でも許容。1 つでも偽なら worktree 採用。

### Subagent との連携

- **`isolation: worktree` は公式 sub-agent frontmatter フィールド** — temporary worktree を切り、変更なしで自動 cleanup（[公式仕様](https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields)）
- Controller が `Agent` tool dispatch 時に `isolation: "worktree"` を渡せば implementer が独立 workspace で実装する。手動 bootstrap 不要
- Phase 分割 plan を `subagent-driven-development` skill で実行する場合、controller 側で先に `claude --worktree <name>` または `worktree-bootstrap` SKILL で worktree を切り、implementer に worktree path を渡す
- 完了検証は worktree 内で直接 `git status --short` + `git diff --stat HEAD`（`PostToolUse:Agent` hook の snapshot は main 基準で subagent 成果が見えない）

### Cleanup（公式仕様）

- **`--worktree` セッション終了時** — uncommitted/untracked/unpushed なしなら worktree + branch を自動削除。named session は prompt
- **subagent worktree** — 完了時に変更なしなら自動 cleanup、変更ありは保持
- **孤児 worktree** — `cleanupPeriodDays` 経過後の startup sweep で自動掃除（uncommitted/untracked/unpushed なし時のみ）
- **手動 cleanup** — `bash .claude/skills/worktree-bootstrap/scripts/cleanup.sh <branch>` または `git worktree remove <path> && git worktree prune`
- **`-p` 非対話モード** — auto cleanup なし。明示的に `git worktree remove` する

### bootstrap.sh（legacy manual fallback）

`claude --worktree` が使えない場面（例: dev server を main で常駐維持、subagent でなく手動で隔離）では `bash .claude/skills/worktree-bootstrap/scripts/bootstrap.sh <branch>` を使う。配置は `.worktrees/<branch>/`（公式 default `.claude/worktrees/` とは別 location で legacy）。

## Migration / Prisma

- **Worktree 作成前 3 軸チェック**: `git status --short | wc -l` + `ls prisma/migrations/ | tail -1` + `bunx --bun prisma migrate status` で**未コミット migration / DB drift / 未適用 migration** を検出。drift / 未適用あれば先に main で `db execute --file` + `migrate resolve --applied` を実施してから worktree 作成
- **destructive migration を含む plan 実行前は WIP 内部整合性を `bun run type-check` で確認必須** — 前セッションの WIP が `schema.prisma` + 多数のドメイン/UI ファイルに渡って未 commit のまま放置されているケースが頻発する。Plan 作成時に `grep` で確認した state は **working tree（HEAD ではない）** のため、main から worktree を切ると WIP が含まれず plan の前提が崩れる silent bug。手順: ① `git status --short | wc -l` で uncommitted 数把握 ② `git diff prisma/schema.prisma | head -40` で schema drift 有無 ③ `bun run type-check` EXIT=0 確認 → WIP は内部整合済みなので **1 commit にバンドルして HEAD に取り込み、現ブランチで続行が最速**（grep base の plan は HEAD ではなく working tree 前提で書かれているため worktree を作らない方が整合的）。前任 WIP の整理 commit は単一 `refactor:` で「<theme1> + <theme2> + <theme3>」と網羅 — 型 prefix `chore` ではなく `refactor` 必須（既存変更の再構築のため）
- **`git ls-tree -r HEAD prisma/migrations/ | awk -F/ '{print $N}'` の N は 3 が正しい** — path は `prisma/migrations/<dir>/<file>` で `$1=prisma` `$2=migrations` `$3=<dir>` `$4=<file>`。`$2` を使うと全行 "migrations" 固定になり HEAD に含まれる migration ディレクトリ一覧が取れない silent bug
- **Prisma 7.8 CLI フラグ変更**: `migrate diff --to-schema-datamodel` → `--to-schema`、`--shadow-database-url` 削除、`db execute --schema` 削除。非対話 destructive migration は「schema 編集 → `mkdir prisma/migrations/<ts>_<name>` → `migration.sql` 手書き → `db execute --file` → `migrate resolve --applied`」順
- **schema.prisma commit 後は `prisma/migrations/` 側も同時 commit 必須** — schema のみ commit は `prisma migrate deploy` が CI/prod で fail する silent drift
- **destructive migration 適用後は dev server を該当 worktree から再起動必須** — 共有 dev DB のため、他 worktree の dev server は古い code + 新 schema で `PrismaClientKnownRequestError: The column ... does not exist` → 公開ページ白画面の silent bug

## Cleanup

- **`git mv` は HEAD 内容を staging に置く（working-tree の Edit は無視）** — Edit 直後の `git mv` は pre-Edit 状態を commit する silent bug。対処: (A) Edit を先に commit してから mv、または (B) mv 後に `git add <new-path>` で working tree を再 stage（実例: 2026-05-13 plan archive 移動で Completed marker Edit が staging されず follow-up commit で fix）
- **`git branch -D` block (`block-dangerous-bash.sh` rule 9) の安全な bypass** — commits が main / remote / reflog で保存されているケース (merged-to-main with stale upstream / WIP with reflog backup) は `git update-ref -d refs/heads/<branch>` で等価操作。reflog 90 日復元可
- **Stale dependabot PR 判定** — `package.json` 現バージョン vs PR target で obsolete 検出（例: main `@lexical/*` 0.44 vs PR 0.40→0.41 = obsolete）。canonical cleanup: `gh pr close <num> --delete-branch --comment "..."` で PR close + remote branch 削除。dependabot は次回 schedule で最新版 PR を再作成
- **`package.json` scripts 削除・リネーム時は横断 grep 必須** — `AGENTS.md` / `.github/CONTRIBUTING.md` / `cloudbuild.yaml` / `.github/workflows/*.yml` / `.claude/{rules,agents,skills}/**` / `docs/how-to/**` / `bunfig.toml` / `.vscode/launch.json`
- **`package.json#packageManager` (Bun version) は CI workflow の SSoT** — `.github/workflows/*.yml` は `bun-version-file: package.json`（`oven-sh/setup-bun@v2` 公式機能）を使用し、`bun-version: "X.Y.Z"` の hardcode は禁止。`package.json#packageManager` 更新時に workflow 側の同期作業は不要（2026-05-13 で 9 箇所 hardcode → SSoT 化済、commit `508929ae`）。canonical 監査 grep: `grep -rnE 'bun-version: "' .github/workflows/` がゼロ件を保つこと。drift 復活防止は `.claude/rules/ops/ci-workflow.md` §2
- **ファイル削除時の dangling ref 検出範囲は `docs/` 全域 + `.claude/` + `AGENTS.md` + `CLAUDE.md` 必須** — 検出時は「削除 + dangling ref 修正」を同一 commit に統合

## テスト配置

- **テストファイルは top-level `__tests__/` のみ** — `src/**/__tests__/` 配置禁止（`tsconfig.test.json` include 範囲外、→ `test-quality.md`）

## Commit / Branch 規律

- **`bun.lock` 単独コミット禁止** — `scripts/check-protected-files.sh` が拒否（依存更新は `package.json` と同時 stage 必須）。誤混入差分は `git restore --staged --worktree bun.lock` で HEAD に戻して分離
- **単一 worktree に複数改修が混入したら Conventional Commits type で分離** — `feat:` / `refactor:` / `fix:` / `docs:` を個別 commit に。lefthook `commit-msg` hook が type を強制
- **`.serena/memories/` は部分 tracked / 部分 ignored 状態** — 過去 commit 済みファイルは tracked のまま残存。update 後の `git add` は `paths are ignored` エラーで失敗するため `git add -f <path>` 必須
- **memory file（`~/.claude/projects/<slug>/memory/*.md`）の連続 Edit は auto-format race で失敗する** — `Edit` 直後に別 Edit は「File has been modified since read」エラー。1 件ずつ順次完了を確認
- **handoff memo の「commit `<SHA>` で完了」記述は新セッション開始時に `git show <SHA>` で実在検証必須** — 前セッションの commit 漏れで該当 SHA が main に存在しないことあり

## Push 戦略（main 直接 vs feature branch + PR）

公式 GitHub Flow / Trunk-based Development は **feature branch + PR** が canonical。main 直接 push（admin bypass）は限定例外として運用する。判断基準:

| 変更タイプ                                                             | 推奨ワークフロー                      | 理由                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| **Workflow / build / runtime 影響**（actions upgrade, env, schema 等） | main 直接 + 即 push                   | CI で動作 verify 必須、複数まとめると「どの変更が壊したか」切り分け不能 |
| **Hotfix**（production 緊急 fix）                                      | main 直接 + 即 push                   | 反映の速度優先                                                          |
| **Rule docs / コメント / 静的 codify のみ**                            | feature branch + 1 PR で squash merge | CI 動作検証不要、複数 codify を 1 commit に集約して history clean       |
| **通常開発**（feature / refactor / bug fix）                           | feature branch + PR（GitHub Flow）    | review + CI + branch protection の正規フロー                            |

**複数領域跨ぎ + workflow 含む** 場合は **workflow 先行 push + verify → codify 後追い一括** の 2 段階で feedback loop を最短化。実例: 2026-05-13 セッションで Actions upgrade (`cdbcd892`) を先行 push + CI verify → 抜け漏れ修正 (`1315cc39`) + rule codify (`dcaa8834`, `fa49b02b`) と small batch push を多用したが、後半 3 件は 1 PR にまとめて squash merge できた（CI 動作検証不要のため）。

**禁止**:

- main 直接 push を「通常開発」に常用する（admin bypass が習慣化、branch protection の意義が形骸化）
- codify-only commit を個別 push する（CI minute 浪費 + main history noise）
- workflow / schema / env 変更を feature branch に閉じ込めて CI verify を遅延させる（merge 後に破綻発覚 → revert コスト）

## Worktree merge

- **diverged worktree branch の merge は `--no-ff` 推奨**（FF 不可時） — `git rev-list --count main..feature/X` が N、逆が M（>0）で diverged の場合、rebase より `--no-ff` merge + conflict 解決の方が history が明示的（merge commit が「並行開発の境界」を示す）。Linear history の `--ff-only` は **diverge していない場合**の規律
- **並行 worktree merge の典型 conflict 箇所** — `src/shared/lib/constants/cache.ts` の `getCacheTag` は両方の追加を残す
- **Windows `.worktrees/` ディレクトリの強制削除失敗は harmless** — `git worktree remove --force` がファイル名長エラーで disk 上の dir 削除に失敗しても、`git worktree prune` + `git branch -d feature/X` で git references はクリーンアップ済み。`git worktree list` から消えていれば後続作業に影響なし
- **ADR system 廃止後の worktree merge で `docs/architecture/decisions/` modify/delete conflict** — main で ADR system 全面廃止 (commit `8ebd49c2`「drop ADR system entirely, consolidate decisions into rule docs」) 後、worktree が新 ADR ファイルを追加していると `--no-ff` merge で "modify/delete: README.md deleted in HEAD and modified in feature/X" conflict が発生する。canonical resolve: **HEAD (削除) を尊重して両 ADR ファイル削除** + 設計判断は `docs/guides/<topic>/<topic>-setup.md` (運用手順) または `.claude/rules/<scope>.md` (規律) または merge commit message (履歴記録) に集約。worktree 内 ADR の Status / Context / Decision セクションは guides に編入、Consequences は rule docs に展開する pattern（実例: 2026-05-09 MEO Phase 2 merge `df5c19b6` で ADR 0027 削除、設計判断は `docs/guides/admin/google-business-profile-setup.md` + merge commit msg に集約）
- **CLAUDE.md slim 化後の worktree merge で大規模 conflict は path-scoped rule に migrate** — Phase 4 で確立した CLAUDE.md slim + path-scoped rule auto-load 構造のため、worktree が CLAUDE.md に追加した新 guidance を merge 時にそのまま CLAUDE.md に取り込むと slim 構造を破壊する。canonical resolve: HEAD (slim 版) を採用 + worktree 追加分を該当 path-scoped rule (`.claude/rules/<scope>.md`) に再配置。例: Server Action redirect typedRoutes cast は `.claude/rules/server-actions/implementation.md` へ。実例: 2026-05-09 MEO Phase 2 merge で worktree が CLAUDE.md に追加した「Server Action redirect typedRoutes cast」を `server-actions/implementation.md` に migrate（merge commit `df5c19b6`）

## Push gate

- **lefthook `pre-push` hook に `architecture-boundaries` test gate あり** — `__tests__/unit/architecture-boundaries.test.ts` の検出ルール（`@/shared/db/prisma` 直 import が `shared/` 外で禁止 / `docs/explanation/` index 参照 / 旧 `executeAdminMutation`/`createSuccess`/`type ActionResult` 残存禁止）に違反があると push が exit 1 で拒否される（2026-05-05 セッションで 4 件違反による push 拒否を実観測）。`--no-verify` での bypass はユーザー明示確認なしには禁止（CLAUDE.md Git Safety Protocol）。push 前に `bun test __tests__/unit/architecture-boundaries.test.ts` で local 確認推奨
