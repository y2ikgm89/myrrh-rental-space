---
name: audit-memory-staleness
description: Claude Code memory（`~/.claude/projects/<slug>/memory/*.md`）と Serena memory（`.serena/memories/**/*.md`）の stale な path 参照を検出する。大規模リファクタ・ファイル移動・機能削除の直後、もしくは「メモリが古い」と感じたときに使用。検出した stale 参照の memory file を更新または削除する判断材料を提供する。
when_to_use: 大規模リファクタ・ファイル移動・機能削除の直後、または「メモリが古い情報を参照している」と感じたとき。
---

# Memory Staleness 監査

Claude Code / Serena memory 内のファイルパス参照が現在のリポジトリ state と乖離していないか検査する。CLAUDE.md §調査・監査 で既知の silent bug（Supabase→R2 移行で `project_overview.md` に旧 path が残存、次セッションで誤情報注入）への定期対応。

## 対象ディレクトリ

1. `$HOME/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/*.md`
2. `.serena/memories/**/*.md`（maxdepth 3）

## 検出対象

memory 内の **拡張子付きファイルパス参照** で、リポジトリに実在しないもの。

対象拡張子: `.ts` / `.tsx` / `.md` / `.sql` / `.prisma` / `.json`
対象 root: `src/` / `prisma/` / `__tests__/` / `docs/` / `.claude/`

自然文誤爆を避けるため、拡張子なしの path 片（例: `src/app/(public)/spaces/`）は対象外。

## 実行手順

### 1. 検出スクリプトを実行

```bash
# dated snapshot を自動スキップ:
#   - filename に \d{4}-\d{2}-\d{2} または vN.N.N パターン
#   - 先頭 20 行に "Snapshot:" / "Analysis Date" / "Research Date" / "Generated:" / "品質メトリクス分析結果（" のいずれか
is_dated_snapshot() {
  local f="$1"
  [[ "$(basename "$f")" =~ [0-9]{4}-[0-9]{2}-[0-9]{2}|v[0-9]+\.[0-9]+ ]] && return 0
  head -20 "$f" 2>/dev/null | grep -qE 'Snapshot:|Analysis Date|Research Date|Generated:|品質メトリクス分析結果（' && return 0
  return 1
}

scan_dir() {
  local root="$1" maxdepth="$2"
  [ -d "$root" ] || return 0
  find "$root" -maxdepth "$maxdepth" -name "*.md" -type f 2>/dev/null | while read -r md; do
    is_dated_snapshot "$md" && continue
    grep -ohE '(src|prisma|__tests__|docs|\.claude)/[A-Za-z0-9_./\-]+\.(ts|tsx|md|sql|prisma|json)' "$md" 2>/dev/null | sort -u | while read -r ref; do
      [ -e "$ref" ] || echo "$md: $ref"
    done
  done
}

# Claude Code memory
MEM_DIR="$HOME/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory"
scan_dir "$MEM_DIR" 2

# Serena memory
scan_dir ".serena/memories" 3
```

> MINGW64 の `()` 含みパス（`src/app/(admin)/...` 等）は grep 側で文字クラス `[A-Za-z0-9_./\-]` に該当しないため自動的に除外される。明示的な除外処理は不要。
> dated snapshot ファイル（filename に日付 / header に `Snapshot:` 等）は意図的履歴として自動スキップする。新しい research/analysis ドキュメントを書くときは冒頭に `> **Snapshot: YYYY-MM-DD**` を入れると、将来の staleness audit で誤検出を防げる。

### 2. 検出結果の分類

出力は `<memory-file>: <stale-path>` 形式。各行について以下を判定:

| 判定           | アクション                                                                               |
| -------------- | ---------------------------------------------------------------------------------------- |
| 単純 rename    | memory file 内で旧 path を新 path に書き換え                                             |
| 機能削除       | memory file 自体を削除候補、もしくは該当セクションを削除                                 |
| 例示・履歴記述 | 誤検出。「Before」「旧」「削除済み」コンテキストなら **修正不要**                        |
| ディレクトリ化 | ファイル → ディレクトリ化のケース。path を `...` 付き表現に修正（例: `.../foo.ts` 削除） |

### 3. 修正の原則

- **memory 内の学習内容・設計判断は保持**。path 参照だけを update する
- 機能ごと削除された場合は memory file を `rm` + `MEMORY.md` の index 行も同時削除
- Serena memory（`.serena/memories/`）を編集したら次セッションでの誤情報混入リスクを減らすため commit 推奨

### 4. 確認

修正後に再度検出スクリプトを実行し、残存ゼロを確認。

## 誤検出パターン（修正不要）

以下のコンテキストに現れる stale ref は履歴記述として残すべき:

- `削除済み: ...` / `移動: ... → ...`
- コードブロック内の Before/After 対比
- マイグレーション履歴（`Supabase→R2 移行で...` 等）
- 完了済み plan（`docs/superpowers/plans/.archive/` 配下）の原文

memory file を読んで **自然文として stale ref を残す意図** が見えたら skip する。

## 参考

- CLAUDE.md §調査・監査（Serena memory staleness の既知 silent bug）
- MEMORY.md（Claude Code memory index）
- `.serena/memories/` 配下の現状参照系（`project_overview.md` / `architecture-analysis.md` 等）は大規模マイグレーション後の同期更新が最も漏れやすい

## 過去の検出事例

- `project_overview.md` に `PostgreSQL (Supabase)` が Supabase→R2 移行後に残存 → 修正
- 削除された `src/shared/lib/sections/admin-registry.ts` への参照が plan memory に残存 → plan 完了でアーカイブ
- 2026-04-23 初回実行: 27 件検出 → 24 件は dated snapshot（修正不要）、3 件は undated 研究ドキュメントに snapshot date ヘッダーを追加
- `eslint.config.mjs` にも `src/shared/lib/auth.ts`（auth 分離後の削除ファイル）への dead 参照あり（skill 対象外、別途 cleanup 必要）
