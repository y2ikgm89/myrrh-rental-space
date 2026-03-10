# Codex Instruction Topology

Codex では、指示を 1 つの巨大ファイルに集約するより、役割ごとに階層化した方が保守しやすい。
このリポジトリでは次の順序で扱う。

## 優先順位

1. ユーザーの直接指示
2. もっとも近い `AGENTS.override.md`
3. リポジトリルートの `AGENTS.md`
4. 関連する `docs/reference/codex-rules/*.md`
5. 関連する `.agents/skills/<skill-name>/SKILL.md`
6. skill が参照する `scripts/`, `reference/`, `assets/`

## 何をどこに置くか

### `AGENTS.md`

置くもの:

- リポジトリ全体で常に守る制約
- 実装哲学
- テストや検証の最低ライン
- 命名規則やアーキテクチャ境界

置かないもの:

- 長い手順書
- 特定 UI パターンの詳細実装
- 1 回限りの作業メモ

### `AGENTS.override.md`

置くもの:

- 特定ディレクトリだけに適用すべき追加制約
- ルート規則では荒すぎるローカル前提

置かないもの:

- ルート `AGENTS.md` の丸写し
- 他ディレクトリにも広がるルール

### `docs/reference/codex-rules/*.md`

置くもの:

- 分野別の詳細ルール
- 実装パターン、比較、禁止例
- skill が参照する背景知識

置かないもの:

- Codex で使えないツール固有 API
- Claude 専用 path を正本として扱う説明

### `.agents/skills/<skill-name>/SKILL.md`

置くもの:

- 再利用する実行手順
- 必要な入力
- 使うコマンドやテンプレート
- 完了条件

置かないもの:

- プロジェクト全体ポリシーの重複
- 関係の薄い複数ワークフロー
- 既に repo で満たしている環境セットアップ
- 長い API リファレンスや variant 一覧

## Skill 作成基準

新しい skill を作るのは、次の条件を満たすときだけにする。

- 3 回以上繰り返す作業である
- 実行順序がある
- コマンド、テンプレート、確認観点をまとめる価値がある
- 単なるルール列ではなく「作業の流れ」がある

作らない方がよい例:

- 「型アサーション禁止」のような単独ルール
- 1 コマンドで終わる定型作業
- reviewer / explorer のような曖昧な人格分離

## Skill 設計原則

- 1 skill = 1 workflow
- frontmatter は `name` と `description` のみ
- `description` には発火条件と境界を書く
- 手順は短く、分岐は必要最小限にする
- `SKILL.md` 本体は lean に保ち、詳細は `reference/` か `docs/reference/` へ逃がす
- 追加 workflow と監査 / modernize workflow は分ける
- コマンド例はこの repo のパスと環境に合わせる
- 追加の知識は `reference/` に分離し、`SKILL.md` 本体を肥大化させない

## Claude 資産との共存

`.claude/*` は Claude Code 用の資産として残してよい。
ただし Codex の正本は `AGENTS.md`、`AGENTS.override.md`、`docs/reference/codex-rules/`、`.agents/skills/` とする。

Codex 用文書で避けるもの:

- `.claude/*` を正本とみなす説明
- `read_memory`, `write_memory`, `edit_memory` など Codex 非対応 API
- Claude 向け sub-agent 前提の手順

## 保守チェック

変更時は次を確認する。

- 同じルールが `AGENTS.md` と skill に重複していないか
- Codex 用文書が `.claude/*` を参照していないか
- skill が「いつ使うか」を一文で説明できるか
- 参照先が実在し、相対パスが壊れていないか
- 新しい恒久ルールを skill に書き捨てていないか
