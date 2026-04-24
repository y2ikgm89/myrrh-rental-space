# アーキテクチャ

repo 全体の構造、境界、データ取得方針、キャッシュ戦略の正本です。

## ドキュメント一覧

| ファイル                                                                           | 内容                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                                               | 全体アーキテクチャと責務分離                    |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)                                     | ディレクトリ構造と配置方針                      |
| [DATABASE_DESIGN.md](./DATABASE_DESIGN.md)                                         | Prisma / PostgreSQL 設計                        |
| [CACHING.md](./CACHING.md)                                                         | `use cache` / tag 運用                          |
| [TECH_STACK.md](./TECH_STACK.md)                                                   | 採用技術とバージョン前提                        |
| [page-sections-design-guide.md](./page-sections-design-guide.md)                   | ページセクション設計                            |
| [freeform-page-builder-design.md](./freeform-page-builder-design.md)               | WIX / STUDIO 系自由配置エディタの設計           |
| [agent-instructions.md](./agent-instructions.md)                                   | AI 指示の配置（Codex ネイティブ正本）           |
| [codex-instructions.md](./codex-instructions.md)                                   | Codex 資産の配置方針                            |
| [typescript-version-policy.md](./typescript-version-policy.md)                     | TypeScript 6.x RC / 安定版移行方針              |
| [better-auth-configuration-checklist.md](./better-auth-configuration-checklist.md) | Better Auth 公式準拠チェックリスト              |
| [next-cache-server-actions-review.md](./next-cache-server-actions-review.md)       | Next 16 キャッシュ・Server Actions レビュー観点 |

## 運用・クリーンアップ

| ファイル                                                                         | 内容                            |
| -------------------------------------------------------------------------------- | ------------------------------- |
| [../operations/prisma-schema-cleanup.md](../operations/prisma-schema-cleanup.md) | Prisma 破壊的スキーマ整理の手順 |

Codex 作業では `AGENTS.md` と `.agents/skills` を正本にする。`.claude/*` は残置するが Codex からは参照しない。通常ドキュメントに `.claude` リンクがある場合も Claude Code 用 legacy reference として扱う。

## 現在の原則

- `src/app/*` は route / page / layout / route handler の orchestration に限定する
- 業務ロジックと read model は `src/shared/domain/*` を正本にする
- Prisma と Better Auth adapter の境界は `src/shared/db/*` に固定する
- auth は `/api/auth/[...all]` と `src/shared/lib/auth.ts` の静的 `auth` export を正本にする
- `proxy.ts` は coarse gate と共通セキュリティヘッダーに限定し、本認可の正本にはしない

最終更新: 2026-03-21
