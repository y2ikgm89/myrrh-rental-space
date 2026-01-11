# ドキュメント

> レンタルスペース管理システムの技術ドキュメント

## 構造

```
docs/
├── architecture/    # アーキテクチャ・設計
├── requirements/    # 機能要件
├── guides/          # 開発ガイド
├── security/        # セキュリティ
├── operations/      # 運用・デプロイ
└── plans/           # 実装計画・履歴
```

## クイックリンク

| カテゴリ | 説明 | 主要ファイル |
|---------|------|-------------|
| [architecture/](./architecture/) | システム設計・データベース | [ARCHITECTURE.md](./architecture/ARCHITECTURE.md) |
| [requirements/](./requirements/) | 機能別要件定義 | [README.md](./requirements/README.md) |
| [guides/](./guides/) | 開発規約・ベストプラクティス | [README.md](./guides/README.md) |
| [security/](./security/) | 認証・保護対策 | [README.md](./security/README.md) |
| [operations/](./operations/) | デプロイ・インフラ | [README.md](./operations/README.md) |
| [plans/](./plans/) | 実装計画・完了履歴 | [README.md](./plans/README.md) |

## 技術スタック

| 技術 | バージョン |
|-----|----------|
| Next.js | 16.1.1 |
| React | 19.2.3 |
| TypeScript | 5.9 |
| Prisma | 7.2.0 |
| Auth.js | 5.0.0-beta.30 |
| Bun | 1.3.5 |

詳細は [CLAUDE.md](../CLAUDE.md) を参照。

## 読者別ガイド

### 新規開発者

1. [CLAUDE.md](../CLAUDE.md) - プロジェクト概要
2. [architecture/PROJECT_STRUCTURE.md](./architecture/PROJECT_STRUCTURE.md) - 構造
3. [guides/coding-standards.md](./guides/coding-standards.md) - 規約

### インフラ担当

1. [operations/deployment.md](./operations/deployment.md) - デプロイ
2. [operations/docker.md](./operations/docker.md) - Docker
3. [security/protection.md](./security/protection.md) - 保護

## 実装方針

- 最新の公式ベストプラクティスに準拠
- 後方互換性は考慮しない
- Server Components / Server Actions 優先
- Zodバリデーション必須

---

最終更新: 2026-01-11
