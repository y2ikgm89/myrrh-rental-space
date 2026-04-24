# ドキュメント

> レンタルスペース管理システムの技術ドキュメント

## 構造

```
docs/
├── architecture/    # アーキテクチャ・設計（ADR・DB 設計・キャッシュ戦略）
├── requirements/    # 機能要件
├── guides/          # 開発ガイド
├── security/        # セキュリティ
├── operations/      # 運用・デプロイ
├── plans/           # 実装計画・履歴（日常手順の正本ではない。INDEX.md 参照）
├── reference/       # 詳細リファレンス（Codex 正本ではない legacy reference を含む）
├── superpowers/     # superpowers skill 生成の plans / specs
└── templates/       # ドキュメントテンプレート
```

## クイックリンク

| カテゴリ                         | 説明                                       | 主要ファイル                          |
| -------------------------------- | ------------------------------------------ | ------------------------------------- |
| [architecture/](./architecture/) | システム設計・データベース・ADR            | [README.md](./architecture/README.md) |
| [requirements/](./requirements/) | 機能別要件定義                             | [README.md](./requirements/README.md) |
| [guides/](./guides/)             | 開発規約・ベストプラクティス               | [README.md](./guides/README.md)       |
| [security/](./security/)         | 認証・保護対策                             | [README.md](./security/README.md)     |
| [operations/](./operations/)     | デプロイ・インフラ                         | [README.md](./operations/README.md)   |
| [plans/](./plans/)               | 実装計画・直近完了履歴                     | [README.md](./plans/README.md)        |
| [reference/](./reference/)       | 詳細リファレンス（Codex 正本ではない）     | claude-rules/                         |
| [superpowers/](./superpowers/)   | superpowers skill が生成する plans / specs | plans/, specs/                        |
| [templates/](./templates/)       | ドキュメントテンプレート                   | plan.md, requirements.md              |

## 技術スタック

**バージョン表の正本**はリポジトリルートの [AGENTS.md](../AGENTS.md#tech-stack)（コア依存の固定一覧）と、実 lock 解決版である [**bun.lock**](../bun.lock) である。`package.json` の semver だけでは確定版が分からないため、釘を刺すときは `bun pm ls` または `bun.lock` を参照すること。

- 採用技術の説明と UI / 体験層の補足: [architecture/TECH_STACK.md](./architecture/TECH_STACK.md)
- 各ライブラリ major 世代の落とし穴: [architecture/TECH_STACK.md](./architecture/TECH_STACK.md) と近接 docs

Codex の入口は [AGENTS.md](../AGENTS.md) と [.agents/skills](../.agents/skills/) を参照。`CLAUDE.md` と `.claude/*` は Claude Code 用 legacy reference として残置するが、Codex 作業では参照しない。

## 読者別ガイド

### 新規開発者

1. [AGENTS.md](../AGENTS.md) - Codex 向けプロジェクト概要
2. [architecture/PROJECT_STRUCTURE.md](./architecture/PROJECT_STRUCTURE.md) - 構造
3. [architecture/codex-instructions.md](./architecture/codex-instructions.md) - Codex instruction assets

### インフラ担当

1. [operations/deployment.md](./operations/deployment.md) - デプロイ
2. [operations/docker.md](./operations/docker.md) - Docker
3. [security/protection.md](./security/protection.md) - 保護

## 実装方針

- 最新の公式ベストプラクティスに準拠
- 後方互換レイヤーを追加しない
- Server Components / Route Handlers / Server Actions を責務ごとに使い分ける
- 入出力は Zod で検証する

---

最終更新: 2026-04-24
