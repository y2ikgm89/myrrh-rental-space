# Codex Skills

このディレクトリは Codex 向け skill の正本。
Claude 用 skill は `.claude/skills/` に残してよいが、Codex ではここだけを参照する。

## 目的

skill は「何度も繰り返す作業の手順」を短く共有するために使う。
repo 全体ルールは `AGENTS.md`、詳細ルールは `docs/reference/codex-rules/` に置く。

## ディレクトリ規約

```text
.agents/skills/
  <skill-name>/
    SKILL.md
    reference/   # 任意。補足資料だけ
    scripts/     # 任意。再利用する補助スクリプト
    assets/      # 任意。テンプレートや雛形
```

## `SKILL.md` の書き方

- frontmatter は `name` と `description` のみ
- `description` は発火条件と境界を書く
- 1 skill に unrelated な複数ワークフローを混ぜない
- `AGENTS.md` のポリシーをコピーしない
- `.claude/*` や Codex 非対応 API を参照しない
- 既に repo で満たしているインストール手順は書かない

## 現在の skill

### Core workflow

- `frontend-design`: 公開ページ UI 実装前に design brief を固める
- `parallax-section`: GSAP / ScrollTrigger ベースのスクロール演出セクションを組む
- `ui-ux-pro-max`: 付属データベースを検索して UI 方針やレビュー観点を集める

### Lexical workflow

- `lexical-node`: カスタム Lexical ノードを作る
- `lexical-plugin`: カスタム Lexical プラグインを作る
- `lexical-toolbar`: Lexical ツールバーを拡張する

## 追加判断

新しい skill を作る前に確認する。

- 同じ依頼が繰り返し来るか
- 実行順序を固定したいか
- 既存 skill に自然に統合できないか
- ルール文書だけで十分ではないか

## メンテナンス

skill を変更したら次も確認する。

- 参照先が `docs/reference/codex-rules/` に揃っているか
- `scripts/` や `reference/` の相対パスが正しいか
- DoD がこの repo の検証コマンドに合っているか
