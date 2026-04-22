# Architecture Decision Records (ADR)

このディレクトリはプロジェクトの重要な技術判断を [MADR 4.0](https://adr.github.io/madr/) 形式で記録しています。

## ADR とは

ADR（Architecture Decision Record）は「なぜそう決めたか」を残す設計判断ログです。実装を見れば「何をしたか」はわかりますが、**なぜ他の選択肢ではなくその方法を選んだのか** は時間が経つと失われます。ADR はそれを防ぐための軽量ドキュメントです。

## ファイル命名規則

```
NNNN-kebab-case-title.md
```

- `NNNN`: 4 桁の連番（0001 から開始、欠番なし）
- タイトルは kebab-case、英語推奨（検索性のため）

## 追加手順

1. `0000-template.md` をコピーして次の連番にリネーム
2. `Status` を `Proposed` にして PR 作成
3. レビュー完了後、マージと同時に `Accepted` に変更
4. 将来別の ADR で置き換える場合は `Superseded by ADR-XXXX` にステータス変更

## インデックス

| #                                                                          | タイトル                                                                    | Status   | 日付       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------- | ---------- |
| [0001](./0001-multiple-root-layouts.md)                                    | Multiple Root Layouts で公開/管理を分離                                     | Accepted | 2026-03-17 |
| [0002](./0002-prisma-type-only-gateway.md)                                 | Prisma re-export gateway を type-only + browser entry に                    | Accepted | 2026-04-15 |
| [0003](./0003-playwright-storage-state-auth.md)                            | Playwright E2E 認証を storage state + setup project に                      | Accepted | 2026-04-15 |
| [0004](./0004-turbopack-native-bundle-analyzer.md)                         | `@next/bundle-analyzer` から Turbopack-native `experimental-analyze` に移行 | Accepted | 2026-04-15 |
| [0005](./0005-lefthook-for-git-hooks.md)                                   | Lefthook を git hooks manager として採用                                    | Accepted | 2026-04-15 |
| [0006](./0006-renovate-over-dependabot.md)                                 | Dependabot から Renovate に移行                                             | Accepted | 2026-04-15 |
| [0007](./0007-axe-core-for-a11y-automation.md)                             | axe-core/playwright で WCAG 2.1 AA 自動検証                                 | Accepted | 2026-04-15 |
| [0008](./0008-conventional-commits-enforcement.md)                         | Conventional Commits 強制（lefthook commit-msg）                            | Accepted | 2026-04-15 |
| [0009](./0009-admin-roles-client-safe-ssot.md)                             | admin-roles.ts を client-safe な Role SSoT として分離                       | Accepted | 2026-04-15 |
| [0010](./0010-per-directory-test-batch.md)                                 | Bun Test は per-directory バッチ実行に統一する                              | Accepted | 2026-04-15 |
| [0011](./0011-dual-better-auth-instance.md)                                | 管理者用と顧客用で Better Auth インスタンスを完全分離する                   | Accepted | 2026-04-15 |
| [0012](./0012-execute-admin-mutation-result.md)                            | 管理画面の書き込み系 Server Actions は executeAdminMutationResult に統一    | Accepted | 2026-04-15 |
| [0013](./0013-policy-docs-sync.md)                                         | .claude/rules と docs/reference/codex-rules を byte-identical に同期        | Accepted | 2026-04-15 |
| [0014](./0014-test-script-consolidation.md)                                | Test script の整理とテスト実行ポリシーの明文化                              | Accepted | 2026-04-22 |
| [0015](./0015-clean-break-refactor-and-parallel-implementer-discipline.md) | Clean-break refactor 原則と parallel implementer の git 副作用規律          | Accepted | 2026-04-22 |
| [0016](./0016-page-hero-first-class-field.md)                              | ホームヒーローを `Page.pageHero` へ移行し `homepage-hero` Section を廃止    | Accepted | 2026-04-22 |
| [0017](./0017-section-style-cascade.md)                                    | SectionStyle を独立 entity 化し 4 段 cascade で解決する                     | Proposed | 2026-04-22 |

## 参考

- [MADR 4.0 Template](https://adr.github.io/madr/)
- [Why Write ADRs (Michael Nygard)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR GitHub](https://adr.github.io/)
