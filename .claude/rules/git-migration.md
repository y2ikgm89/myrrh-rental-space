---
description: Git ワークフロー / Migration / Worktree プロセスルール
paths:
  - "prisma/migrations/**"
  - "prisma/schema.prisma"
  - ".github/workflows/**"
  - "docs/architecture/decisions/**"
  - ".serena/memories/**"
---

# Git / Migration / Worktree プロセス

## Migration / Prisma

- **Worktree 作成前 3 軸チェック**: `git status --short | wc -l` + `ls prisma/migrations/ | tail -1` + `bunx --bun prisma migrate status` で**未コミット migration / DB drift / 未適用 migration** を検出。drift / 未適用あれば先に main で `db execute --file` + `migrate resolve --applied` を実施してから worktree 作成
- **Prisma 7.8 CLI フラグ変更**: `migrate diff --to-schema-datamodel` → `--to-schema`、`--shadow-database-url` 削除、`db execute --schema` 削除。非対話 destructive migration は「schema 編集 → `mkdir prisma/migrations/<ts>_<name>` → `migration.sql` 手書き → `db execute --file` → `migrate resolve --applied`」順
- **schema.prisma commit 後は `prisma/migrations/` 側も同時 commit 必須** — schema のみ commit は `prisma migrate deploy` が CI/prod で fail する silent drift
- **destructive migration 適用後は dev server を該当 worktree から再起動必須** — 共有 dev DB のため、他 worktree の dev server は古い code + 新 schema で `PrismaClientKnownRequestError: The column ... does not exist` → 公開ページ白画面の silent bug

## ADR / Cleanup

- **ADR Superseded 化と関連 dangling references cleanup を同一 commit で完了必須** — canonical sweep: `grep -rln "<deprecated-name>" .claude/hooks/ .claude/settings*.json .claude/rules/ .claude/skills/ docs/architecture/ CLAUDE.md AGENTS.md`
- **ADR 新規作成前に `ls docs/architecture/decisions/ | grep "^00"` で既存番号確認** — 連番重複採番を防ぐ
- **ADR 採番は worktree 内の未 merge feature ブランチも cross-check 必須** — main の `ls` だけでは別 worktree のローカルブランチで予約済みの番号を見落とす。`for w in .worktrees/*; do echo "$w:"; (cd "$w" && ls docs/architecture/decisions/ 2>/dev/null | grep "^00"); done`
- **`package.json` scripts 削除・リネーム時は横断 grep 必須** — `AGENTS.md` / `CONTRIBUTING.md` / `cloudbuild.yaml` / `.github/workflows/*.yml` / `.claude/{rules,agents,skills}/**` / `docs/guides/**` / `bunfig.toml` / `.vscode/launch.json`
- **ファイル削除時の dangling ref 検出範囲は `docs/` 全域 + `.claude/` + `AGENTS.md` + `CLAUDE.md` 必須** — `.claude/skills/<>` だけでなく `docs/architecture/*.md` 内に dangling link が紛れていることあり。検出時は「削除 + dangling ref 修正」を同一 commit に統合

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
- **並行 worktree merge の典型 conflict 箇所** — `docs/architecture/decisions/README.md` は採番順で並べる、`src/shared/lib/constants/cache.ts` の `getCacheTag` は両方の追加を残す
- **Windows `.worktrees/` ディレクトリの強制削除失敗は harmless** — `git worktree remove --force` がファイル名長エラーで disk 上の dir 削除に失敗しても、`git worktree prune` + `git branch -d feature/X` で git references はクリーンアップ済み。`git worktree list` から消えていれば後続作業に影響なし

## ADR 制約と設定の整合

- **ADR 制約と設定ファイルの整合を grep で周期検証** — `bunfig.toml` / `playwright.config.ts` / `.gitignore` 等が ADR 制約と乖離した dead code になっていないか
