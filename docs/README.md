# Documentation

> Myrrh Rental Space — レンタルスペース予約管理システムの技術ドキュメント

## 構造（Diátaxis）

このドキュメントは [Diátaxis](https://diataxis.fr/) フレームワークに準拠する。「なぜ」「手順」「仕様」を分離し、読者の目的別に配置する。

```
docs/
├── explanation/    # 設計の「なぜ」(理解指向) — アーキテクチャ判断、トレードオフ
├── how-to/         # 手順 (問題解決指向) — デプロイ、特定タスクの解決
├── reference/      # 仕様 (情報指向) — API、ライブラリ、ランタイム詳細
├── superpowers/    # superpowers skill が生成する plans / specs
└── templates/      # ドキュメントテンプレート
```

## クイックリンク

| カテゴリ                       | 何が書いてあるか                       | 目的                     |
| ------------------------------ | -------------------------------------- | ------------------------ |
| [explanation/](./explanation/) | 設計の判断・データフロー・モデル       | 「なぜそうなっているか」 |
| [how-to/](./how-to/)           | デプロイ、移行、特定タスクの実行手順   | 「どうすればいいか」     |
| [reference/](./reference/)     | ランタイム / ライブラリ API の詳細仕様 | 「何が使えるか」         |
| [superpowers/](./superpowers/) | superpowers skill 生成の plans / specs | 進行中・完了済の実装計画 |
| [templates/](./templates/)     | ドキュメントテンプレート               | 新規 doc / plan の雛形   |

## 読者別ガイド

### 新規開発者

1. [AGENTS.md](../AGENTS.md) — Codex 向けプロジェクト概要（人間の入口にもなる）
2. [explanation/architecture.md](./explanation/architecture.md) — 全体像
3. [explanation/project-structure.md](./explanation/project-structure.md) — ディレクトリ配置
4. [explanation/tech-stack.md](./explanation/tech-stack.md) — 採用技術

### インフラ担当

1. [how-to/deploy.md](./how-to/deploy.md) — Cloud Run デプロイ
2. [how-to/docker.md](./how-to/docker.md) — Docker
3. [how-to/cloudflare.md](./how-to/cloudflare.md) — CDN / DDoS
4. [how-to/harden-protection.md](./how-to/harden-protection.md) — 保護対策

### セキュリティ担当

1. [explanation/security-model.md](./explanation/security-model.md) — 多層防御の設計
2. [how-to/harden-protection.md](./how-to/harden-protection.md) — Turnstile / レート制限の設定
3. [how-to/better-auth-checklist.md](./how-to/better-auth-checklist.md) — 認証実装チェック

### AI エージェント設定担当

1. [explanation/ai-instructions.md](./explanation/ai-instructions.md) — Codex / Claude Code の正本配置

## 技術スタック

**バージョン表の正本**はリポジトリルートの [AGENTS.md](../AGENTS.md#tech-stack)（コア依存の固定一覧）と、実 lock 解決版である [`bun.lock`](../bun.lock) である。`package.json` の semver だけでは確定版が分からないため、`bun pm ls` または `bun.lock` を参照すること。

- 採用技術の説明: [explanation/tech-stack.md](./explanation/tech-stack.md)

## AI エージェント正本

このリポジトリは Codex / Claude Code を併用する。両者の正本配置は [explanation/ai-instructions.md](./explanation/ai-instructions.md) に集約。

- **Codex**: `AGENTS.md` + `.agents/skills/` + `.codex/{agents,rules}/`
- **Claude Code**: `CLAUDE.md` + `.claude/{rules,skills,agents,hooks}/`

両者の rule 資産は同期しない。共通参照は本ディレクトリ（`docs/explanation/` / `docs/reference/`）に集約する。

## 実装方針

- 公式ベストプラクティスに準拠（Next.js / Prisma / Better Auth / TypeScript / Diátaxis）
- 後方互換レイヤーを追加しない
- Server Components / Route Handlers / Server Actions を責務ごとに使い分ける
- 入出力は Zod で `safeParse` 検証

---

最終更新: 2026-04-29
