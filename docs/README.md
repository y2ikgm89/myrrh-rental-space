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
├── plans/           # 実装計画・履歴（archive/ に過去ログ）
├── reference/       # 詳細リファレンス（.claude/rules から参照）
├── superpowers/     # superpowers skill 生成の plans / specs
└── templates/       # ドキュメントテンプレート
```

## クイックリンク

| カテゴリ                         | 説明                                        | 主要ファイル                          |
| -------------------------------- | ------------------------------------------- | ------------------------------------- |
| [architecture/](./architecture/) | システム設計・データベース・ADR             | [README.md](./architecture/README.md) |
| [requirements/](./requirements/) | 機能別要件定義                              | [README.md](./requirements/README.md) |
| [guides/](./guides/)             | 開発規約・ベストプラクティス                | [README.md](./guides/README.md)       |
| [security/](./security/)         | 認証・保護対策                              | [README.md](./security/README.md)     |
| [operations/](./operations/)     | デプロイ・インフラ                          | [README.md](./operations/README.md)   |
| [plans/](./plans/)               | 実装計画・直近完了履歴                      | [README.md](./plans/README.md)        |
| [reference/](./reference/)       | 詳細リファレンス（gsap/react API/codex 用） | claude-rules/, codex-rules/           |
| [superpowers/](./superpowers/)   | superpowers skill が生成する plans / specs  | plans/, specs/                        |
| [templates/](./templates/)       | ドキュメントテンプレート                    | plan.md, requirements.md              |

## 技術スタック

| 技術            | バージョン |
| --------------- | ---------- |
| Next.js         | 16.2.3     |
| React           | 19.2.5     |
| TypeScript      | 6.0.2      |
| Prisma          | 7.7.0      |
| Better Auth     | 1.6.5      |
| Bun             | 1.3.12     |
| Zod             | 4.3.6      |
| Tailwind CSS    | 4.2.2      |
| Lexical         | 0.43.0     |
| nuqs            | 2.8.9      |
| React Hook Form | 7.73.1     |
| GSAP            | 3.15.0     |
| Lenis           | 1.3.23     |
| Radix UI Dialog | 1.1.15     |

> **注**: 上記は 2026-04-22 時点の pinned/latest resolved versions。最新値は `package.json` + `bun.lock` が SSoT。major version ごとの注意点は [CLAUDE.md](../CLAUDE.md#技術スタック非自明な注意点のみ) を参照。

詳細は [CLAUDE.md](../CLAUDE.md) を参照。

## 読者別ガイド

### 新規開発者

1. [CLAUDE.md](../CLAUDE.md) - プロジェクト概要
2. [architecture/PROJECT_STRUCTURE.md](./architecture/PROJECT_STRUCTURE.md) - 構造
3. [.claude/rules/react-patterns.md](../.claude/rules/react-patterns.md) - React / Next 実装ルール（正本）

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

最終更新: 2026-04-22
