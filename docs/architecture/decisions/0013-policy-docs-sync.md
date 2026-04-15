# 13. .claude/rules と docs/reference/codex-rules を byte-identical に同期

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: docs, governance, ci

## Context and Problem Statement

本プロジェクトでは 2 種類の AI エージェントが同じルールセットを参照する:

- **Claude Code**（`.claude/rules/**/*.md`）— `paths:` frontmatter で条件付き自動ロード
- **Codex Plugin**（`docs/reference/codex-rules/**/*.md`）— 別の読込機構

両者は同じ内容を記述するが、ディレクトリ構造・ファイル命名規則が異なる。最初は手動コピーで運用していたが、片側だけ更新してもう片側を忘れるドリフトが発生し、Codex 側のエージェントが旧ルールに従って「削除されたパターン」を提案する事故があった。

特に `lexical-patterns.md` と `admin-inline-editor-patterns.md` は両プラットフォームで頻繁に参照され、内容は完全に同一であるべき。

## Decision Drivers

- 同一内容のルールドキュメントが 2 箇所に存在する状態を維持する必要がある（両エージェントの読込機構が異なるため 1 箇所に統合できない）
- ドリフトを CI で検出し、PR が merge される前にブロックする
- どちらが「canonical（正本）」かを明確にし、更新方向を固定する
- バイト単位の厳密な比較（markdown の空白・改行違いもドリフトとして扱う）

## Considered Options

1. **Option A**: どちらか一方だけ残し、もう一方は symlink にする
2. **Option B**: ビルド時に canonical 側から生成する（markdown preprocessor）
3. **Option C**: 2 箇所に実ファイルを置き、CI で byte-identical を assert する

## Decision Outcome

**Chosen option**: "Option C — CI で byte-identical を強制"、なぜなら:

- symlink（Option A）は Windows 開発環境で権限問題が発生する
- ビルド生成（Option B）は markdown preprocessor 導入コストが高く、かつ Codex Plugin 側がソース管理下のファイルを要求する
- 実ファイルを 2 箇所に置いてバイト比較するのが最もシンプルで、`.claude/rules` を canonical と明示すれば更新方向も自明になる

実装:

- `scripts/verify-policy-docs.mjs` が `readFileSync(...).equals(readFileSync(...))` で各ペアを比較
- 不一致があれば `process.exit(1)`
- `.github/workflows/ci.yml` の `policy-docs-sync` job が最初に走り、他 job の前提条件（`needs: [policy-docs-sync]`）として設定
- 開発者ローカルでは `node scripts/verify-policy-docs.mjs` 手動実行（将来的に lefthook pre-push で自動化検討）

Canonical 方向:

- **`.claude/rules/**` が正本\*\*（Claude Code が本プロジェクトの主要エージェント）
- `docs/reference/codex-rules/**` は mirror（更新時は `.claude/rules` から `cp` する）

現在の同期対象（2 ペア）:

| Canonical                                                | Mirror                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `.claude/rules/frontend/lexical-patterns.md`             | `docs/reference/codex-rules/lexical-patterns.md`             |
| `.claude/rules/frontend/admin-inline-editor-patterns.md` | `docs/reference/codex-rules/admin-inline-editor-patterns.md` |

ペア追加は `scripts/verify-policy-docs.mjs` の `pairs` 配列に追記。

### Consequences

**良い点**:

- ドリフトは CI で必ず検出される（実際にこの ADR 執筆中の点検でドリフト 2 件を検出・修正した実績あり）
- 正本方向が固定されているため「どちらを更新すべきか」の判断コストがない
- byte 比較なので改行コード・末尾空白のような目に見えにくい差分も逃さない

**悪い点 / トレードオフ**:

- ルール更新時に 2 箇所更新が必須（forgetting → CI 失敗で検出されるため実害は小さい）
- Canonical を更新した後の mirror 同期は手動 `cp` で運用（将来 hook で自動化可能だが現状は過剰設計）
- 新規ルールペア追加時に `verify-policy-docs.mjs` の pairs 配列にも追記する必要がある

### Compliance / Validation

- `.github/workflows/ci.yml` `policy-docs-sync` job が blocking で走る
- `scripts/verify-policy-docs.mjs` が node のみで動作（bun 不要、Node stdlib のみ）
- 本 ADR 自体が「canonical は `.claude/rules`」の公式記録
- Mirror 更新手順: `cp .claude/rules/frontend/<name>.md docs/reference/codex-rules/<name>.md`

## Pros and Cons of the Options

### Option A: symlink

- ✅ 1 ファイル編集で両側更新
- ❌ Windows 権限問題（`mklink` 要管理者、Git の `core.symlinks` 設定依存）
- ❌ Codex Plugin が symlink を実ファイルとして認識しない可能性

### Option B: build 時生成

- ✅ 自動同期
- ❌ markdown preprocessor 導入コスト
- ❌ 生成物をコミットする必要あり（Codex Plugin 要件）

### Option C: CI byte 比較 ✅ 採用

- ✅ シンプルで堅牢
- ✅ Node stdlib のみで動作
- ⚠️ 2 箇所更新が必要だが CI で検出

## Links / References

- 実装: `scripts/verify-policy-docs.mjs`
- CI job: `.github/workflows/ci.yml` §policy-docs-sync
- 関連 commit: `0bccbe4e docs(policy): resync codex-rules with .claude/rules canonical source`
- 関連 directories: `.claude/rules/frontend/`, `docs/reference/codex-rules/`
