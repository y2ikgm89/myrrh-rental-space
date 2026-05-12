---
description: Git ワークフロー / Migration / Worktree プロセスルール
paths:
  - "prisma/migrations/**"
  - "prisma/schema.prisma"
  - ".github/workflows/**"
  - ".serena/memories/**"
---

# Git / Migration / Worktree プロセス

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
- **`package.json` scripts 削除・リネーム時は横断 grep 必須** — `AGENTS.md` / `CONTRIBUTING.md` / `cloudbuild.yaml` / `.github/workflows/*.yml` / `.claude/{rules,agents,skills}/**` / `docs/how-to/**` / `bunfig.toml` / `.vscode/launch.json`
- **`package.json#packageManager` (Bun version) 更新時は `.github/workflows/*.yml` の `bun-version: "X.Y.Z"` も同期必須** — 9+ 箇所 drift で silent runtime difference（`mock.module` 動作差異 / `bun:test` 挙動差）を起こす。canonical 検出 grep: `grep -nE 'bun-version|packageManager' .github/workflows/*.yml package.json`。実例: 2026-05-10 で 9 箇所 1.3.12 → 1.3.13 sync（commit `754e9c2e`）
- **ファイル削除時の dangling ref 検出範囲は `docs/` 全域 + `.claude/` + `AGENTS.md` + `CLAUDE.md` 必須** — 検出時は「削除 + dangling ref 修正」を同一 commit に統合

## テスト配置

- **テストファイルは top-level `__tests__/` のみ** — `src/**/__tests__/` 配置禁止（`tsconfig.test.json` include 範囲外、→ `test-quality.md`）

## Commit / Branch 規律

- **`bun.lock` 単独コミット禁止** — `scripts/check-protected-files.sh` が拒否（依存更新は `package.json` と同時 stage 必須）。誤混入差分は `git restore --staged --worktree bun.lock` で HEAD に戻して分離
- **単一 worktree に複数改修が混入したら Conventional Commits type で分離** — `feat:` / `refactor:` / `fix:` / `docs:` を個別 commit に。lefthook `commit-msg` hook が type を強制
- **`.serena/memories/` は部分 tracked / 部分 ignored 状態** — 過去 commit 済みファイルは tracked のまま残存。update 後の `git add` は `paths are ignored` エラーで失敗するため `git add -f <path>` 必須
- **memory file（`~/.claude/projects/<slug>/memory/*.md`）の連続 Edit は auto-format race で失敗する** — `Edit` 直後に別 Edit は「File has been modified since read」エラー。1 件ずつ順次完了を確認
- **handoff memo の「commit `<SHA>` で完了」記述は新セッション開始時に `git show <SHA>` で実在検証必須** — 前セッションの commit 漏れで該当 SHA が main に存在しないことあり

## Worktree merge

- **diverged worktree branch の merge は `--no-ff` 推奨**（FF 不可時） — `git rev-list --count main..feature/X` が N、逆が M（>0）で diverged の場合、rebase より `--no-ff` merge + conflict 解決の方が history が明示的（merge commit が「並行開発の境界」を示す）。Linear history の `--ff-only` は **diverge していない場合**の規律
- **並行 worktree merge の典型 conflict 箇所** — `src/shared/lib/constants/cache.ts` の `getCacheTag` は両方の追加を残す
- **Windows `.worktrees/` ディレクトリの強制削除失敗は harmless** — `git worktree remove --force` がファイル名長エラーで disk 上の dir 削除に失敗しても、`git worktree prune` + `git branch -d feature/X` で git references はクリーンアップ済み。`git worktree list` から消えていれば後続作業に影響なし
- **ADR system 廃止後の worktree merge で `docs/architecture/decisions/` modify/delete conflict** — main で ADR system 全面廃止 (commit `8ebd49c2`「drop ADR system entirely, consolidate decisions into rule docs」) 後、worktree が新 ADR ファイルを追加していると `--no-ff` merge で "modify/delete: README.md deleted in HEAD and modified in feature/X" conflict が発生する。canonical resolve: **HEAD (削除) を尊重して両 ADR ファイル削除** + 設計判断は `docs/guides/<topic>/<topic>-setup.md` (運用手順) または `.claude/rules/<scope>.md` (規律) または merge commit message (履歴記録) に集約。worktree 内 ADR の Status / Context / Decision セクションは guides に編入、Consequences は rule docs に展開する pattern（実例: 2026-05-09 MEO Phase 2 merge `df5c19b6` で ADR 0027 削除、設計判断は `docs/guides/admin/google-business-profile-setup.md` + merge commit msg に集約）
- **CLAUDE.md slim 化後の worktree merge で大規模 conflict は path-scoped rule に migrate** — Phase 4 で確立した CLAUDE.md slim + path-scoped rule auto-load 構造のため、worktree が CLAUDE.md に追加した新 guidance を merge 時にそのまま CLAUDE.md に取り込むと slim 構造を破壊する。canonical resolve: HEAD (slim 版) を採用 + worktree 追加分を該当 path-scoped rule (`.claude/rules/<scope>.md`) に再配置。例: Server Action redirect typedRoutes cast は `.claude/rules/server-actions/implementation.md` へ。実例: 2026-05-09 MEO Phase 2 merge で worktree が CLAUDE.md に追加した「Server Action redirect typedRoutes cast」を `server-actions/implementation.md` に migrate（merge commit `df5c19b6`）

## Push gate

- **lefthook `pre-push` hook に `architecture-boundaries` test gate あり** — `__tests__/unit/architecture-boundaries.test.ts` の検出ルール（`@/shared/db/prisma` 直 import が `shared/` 外で禁止 / `docs/explanation/` index 参照 / 旧 `executeAdminMutation`/`createSuccess`/`type ActionResult` 残存禁止）に違反があると push が exit 1 で拒否される（2026-05-05 セッションで 4 件違反による push 拒否を実観測）。`--no-verify` での bypass はユーザー明示確認なしには禁止（CLAUDE.md Git Safety Protocol）。push 前に `bun test __tests__/unit/architecture-boundaries.test.ts` で local 確認推奨
