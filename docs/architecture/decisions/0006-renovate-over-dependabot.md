# 0006. Dependabot から Renovate に移行

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: security, dependencies, automation

## Context and Problem Statement

プロジェクトは `.github/dependabot.yml` で npm 依存を週次更新していた。しかし以下の制約があった:

- Dependabot の package grouping 機能が限定的（Renovate に比べ柔軟性が低い）
- auto-merge を使うには GitHub Actions で別途 workflow が必要
- `pinDigests`（GitHub Actions の SHA pin）を強制する機能がない
- `minimumReleaseAge`（新リリース安定化期間）が未サポート
- vulnerability alert と通常更新の schedule 分離が弱い
- Dependency Dashboard 機能がない

依存数が多い（> 80 packages: Radix UI 16 + Lexical 12 + @types/\* 多数等）ため、grouping とカスタマイズの柔軟性が実運用で必要だった。

## Decision Drivers

- 高度な package grouping（Radix UI / Lexical / ESLint ecosystem を一括更新）
- GitHub Actions の `pinDigests`（supply chain 攻撃防御）
- `minimumReleaseAge` で DB driver / Stripe SDK の安定化期間確保
- auto-merge の patch 更新をカスタマイズ可能
- Dependency Dashboard issue で全体状況を可視化
- 脆弱性検出時の即時 PR（schedule 無視）

## Considered Options

1. **Option A: Dependabot を維持 + auto-merge workflow 追加**
2. **Option B: Renovate に完全移行**
3. **Option C: 両方併用**

## Decision Outcome

**Chosen option**: "Option B — Renovate に完全移行"

`.github/dependabot.yml` を削除し、`.github/renovate.json5` に置換。JSON5 形式を選択した理由: コメントサポートで各 `packageRules` の意図を明示できるため。

### 実装のハイライト

**extends**:

- `config:recommended`
- `group:recommended`
- `:timezone(Asia/Tokyo)`
- `:semanticCommits` + `:semanticCommitTypeAll(chore)`
- `:dependencyDashboard`
- `:maintainLockFilesWeekly`
- `schedule:weekdays`
- `helpers:pinGitHubActionDigests`

**packageRules**（14 groups）:

- Auto-merge patch (non-major, >=1.0.0)
- Next.js / React / TypeScript / Prisma / Radix UI / Lexical / Tailwind / Lint tooling / Playwright / Better Auth / Animations / dnd-kit / Lighthouse CI / Tabler icons
- GitHub Actions: `pinDigests: true` + auto-merge
- Database drivers (pg / @prisma/adapter-pg): `minimumReleaseAge: "7 days"` + manual review label
- Stripe SDK: 同じく `7 days` + payment safety label

**vulnerabilityAlerts**: `at any time` + `@y2ikgm89` assignee + security label

### Consequences

**良い点**:

- 依存更新 PR が grouped で management burden 削減
- supply chain 攻撃防御（`pinDigests`）
- DB / Stripe 等の critical 依存は 7 日間の stabilization period
- Dependency Dashboard で全体可視化
- patch auto-merge で手動マージ作業を削減
- 脆弱性即時 PR でセキュリティ対応時間短縮

**悪い点 / トレードオフ**:

- Dependabot から Renovate への移行学習コスト
- Renovate のオプション数が多く設定レビューに時間がかかる
- GitHub 公式サポートは Dependabot の方が手厚い（Renovate は Mend 提供）

### Compliance / Validation

- `.github/renovate.json5` は `bunx renovate-config-validator` で構文検証可能
- `SECURITY.md` の自動対策節を Dependabot → Renovate に更新
- Dependency Dashboard issue で全状況を確認可能

## Pros and Cons of the Options

### Option A: Dependabot 維持

- ✅ GitHub 公式
- ❌ grouping 機能の制約
- ❌ `pinDigests` 未サポート
- ❌ `minimumReleaseAge` 未サポート

### Option B: Renovate 完全移行 ✅ 採用

- ✅ 全ての要件を満たす
- ✅ Dependency Dashboard
- ⚠️ 初期設定コスト

### Option C: 両方併用

- ❌ 重複 PR、管理複雑化
- ❌ lock file 競合リスク

## Links / References

- [Renovate 公式ドキュメント](https://docs.renovatebot.com/)
- [Renovate vs Dependabot 比較](https://docs.renovatebot.com/vs-dependabot/)
- [`.github/renovate.json5`](../../../.github/renovate.json5)
- 関連: `SECURITY.md` の自動対策節
