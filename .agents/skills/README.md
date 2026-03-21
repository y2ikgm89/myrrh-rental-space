# Codex Skills

このディレクトリは **skill 本文・`scripts/`・`data/` の単一正本**。
Claude Code 利用者は **`.claude/skills/`** からスキルを見つけたら、スタブに書かれたパスどおり **こちら（`.agents/skills/`）の `SKILL.md` を開いて**手順を実行する。`.claude` 側に長文や CSV を複製しない（`docs/architecture/agent-instructions.md`）。

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
- `SKILL.md` 本体は短く保ち、詳細な API メモや長い例は `reference/` へ逃がす
- 監査 / modernize 系 workflow は追加系 workflow と分離し、必要なら別 skill にする
- `AGENTS.md` のポリシーをコピーしない
- `.claude/*` や Codex 非対応 API を参照しない
- 既に repo で満たしているインストール手順は書かない

## 現在の skill

Claude Code 利用者は `.claude/skills/<name>/SKILL.md` スタブからここへ誘導される。

### Core workflow（公開 UI）

- `frontend-design`: 公開ページ UI 実装前に design brief を固める
- `parallax-section`: GSAP / ScrollTrigger ベースのスクロール演出セクションを組む
- `ui-ux-pro-max`: 付属データベースを検索して UI 方針やレビュー観点を集める

### Admin / スキャフォールド

- `create-admin-page`: 管理画面 CRUD 一式（`admin-ui-patterns` 準拠）
- `create-server-action`: Server Action + Zod フルスキャフォールド
- `create-page-content`: Page-First 公開ページコンテンツ一式
- `add-settings-field`: Settings シングルトン 4 箇所更新パターン
- `audit-settings-sections`: 設定セクション品質監査
- `split-action-file`: 500 行超アクションを queries / mutations に分割
- `new-section`: Component-Driven Sections の新セクション定義

### スキーマ・依存・ビルド

- `prisma-migration`: スキーマ変更後の migrate / generate 手順
- `upgrade-deps`: `bun outdated` から validate / build までの更新フロー

### 診断・トラブルシュート

- `stripe-debug`: Stripe 接続・Webhook 診断
- `google-calendar-debug`: Calendar 同期診断
- `turbopack-hmr`: Next.js 16 境界越し HMR 失敗の回復

### Lexical（管理エディタ）

- `lexical-node`: カスタムノード（長ひな形: `reference/scaffold-lexical-node.md`）
- `lexical-plugin`: カスタムプラグイン（`reference/scaffold-lexical-plugin.md`）
- `lexical-toolbar`: ツールバー拡張（`reference/scaffold-lexical-toolbar.md`）
- `lexical-audit`: deprecated / private API 除去と現行 API への寄せ

## 追加判断

新しい skill を作る前に確認する。

- 同じ依頼が繰り返し来るか
- 実行順序を固定したいか
- 既存 skill に自然に統合できないか
- 追加実装と監査 / cleanup を 1 skill に混ぜていないか
- ルール文書だけで十分ではないか

## メンテナンス

skill を変更したら次も確認する。

- **`.claude/skills/<name>/SKILL.md` スタブ**の `description` を正本と矛盾させない（発火条件の変更はスタブにも反映）
- 参照先が `docs/reference/codex-rules/` に揃っているか
- `scripts/` や `reference/` の相対パスが正しいか
- DoD がこの repo の検証コマンドに合っているか
- 追加 skill が既存 skill の責務を侵食していないか
- `docs/plans/*` の履歴メモを現行ルールとして参照していないか
- 現在の route/data 境界に追従しているか（`[...segments]`, preview 専用 route）
- `shared/domain` / `shared/db/prisma` 境界を壊す指示や、削除済み shim の参照を含めていないか
- `generated/prisma/*` を編集・commit する前提や、`shared/generated` の古いパスを含めていないか
- Better Auth の静的 `auth` export 前提を壊す指示や、動的 auth bootstrap の再導入を促していないか
- admin 向け task で `@/admin/queries/*` read、`/admin/api/*` client read、`@/admin/actions/*` mutation only の境界を崩していないか
- public 向け task で `src/app/(public)/layout.tsx` に URL state provider や effect provider を戻していないか
