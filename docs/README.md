# Documentation

> Myrrh Rental Space — レンタルスペース予約管理システムの技術ドキュメント

## 構造（Diátaxis 準拠）

このドキュメントは [Diátaxis](https://diataxis.fr/) フレームワークの **explanation / how-to** 軸のみ採用する。残る 2 軸（tutorials / reference）はプロジェクトの性質に合わないため意図的に未配置。

```text
docs/
├── explanation/    # 設計の「なぜ」(理解指向) — アーキテクチャ判断、トレードオフ
├── how-to/         # 手順 (問題解決指向) — デプロイ、外部連携セットアップ、特定タスク
├── superpowers/    # plans / specs（brainstorming / writing-plans ワークフロー由来）
└── templates/      # plan / plan-readme-entry の雛形
```

**未配置の Diátaxis 軸**:

- **reference** — ライブラリ API は公式 docs を直接参照。project 固有パターン・規約は `.claude/rules/**`（Claude Code）と `.agents/skills/**`（Codex）が SSoT。`docs/reference/` 再導入禁止（`CLAUDE.md` §md ドキュメント規律）。
- **tutorials** — 学習用のチュートリアル軸は未配置。新規開発者向け導線は `AGENTS.md` + `CLAUDE.md` + 後述「読者別ガイド」で代替。

## クイックリンク

| カテゴリ                       | 何が書いてあるか                               | Diátaxis 軸                      |
| ------------------------------ | ---------------------------------------------- | -------------------------------- |
| [explanation/](./explanation/) | 設計の判断・データフロー・モデル               | explanation                      |
| [how-to/](./how-to/)           | デプロイ・外部連携セットアップ・特定タスク     | how-to                           |
| [superpowers/](./superpowers/) | plans / specs ワークフロー由来のドラフト・計画 | 軸外（ワークフロー成果物）       |
| [templates/](./templates/)     | plan / plan-readme-entry の雛形                | 軸外（プロジェクトテンプレート） |

## 読者別ガイド

| 読者         | 入口                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新規開発者   | [AGENTS.md](../AGENTS.md) → [explanation/architecture.md](./explanation/architecture.md) → [project-structure.md](./explanation/project-structure.md) → [tech-stack.md](./explanation/tech-stack.md) |
| インフラ     | [how-to/deploy.md](./how-to/deploy.md) → [docker.md](./how-to/docker.md) → [cloudflare.md](./how-to/cloudflare.md) → [harden-protection.md](./how-to/harden-protection.md)                           |
| セキュリティ | [explanation/security-model.md](./explanation/security-model.md) → [how-to/harden-protection.md](./how-to/harden-protection.md)                                                                      |
| AI 設定      | [explanation/ai-instructions.md](./explanation/ai-instructions.md)                                                                                                                                   |
| 外部連携     | [how-to/google-business-profile-setup.md](./how-to/google-business-profile-setup.md)                                                                                                                 |

## 技術スタックとコード規約

- **確定バージョンの正本**: [`package.json`](../package.json) + [`bun.lock`](../bun.lock)。
- **採用理由の説明**: [explanation/tech-stack.md](./explanation/tech-stack.md)。
- **日常的な実装規約・コマンド**: [AGENTS.md](../AGENTS.md)（Codex）と [`CLAUDE.md`](../CLAUDE.md)（Claude Code）。

Codex と Claude Code の資産境界・相互参照禁止は [explanation/ai-instructions.md](./explanation/ai-instructions.md)。
