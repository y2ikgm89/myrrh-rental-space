# 開発ガイド

このディレクトリは dual-AI 体制（Codex + Claude Code）の **dev 補助 docs 入口** として機能する。実装ルールの正本は AI 別に分離されている:

- **Codex**: [`AGENTS.md`](../../AGENTS.md) と [`.agents/skills/`](../../.agents/skills/) — Codex 起動時に階層的に読み込まれる正本
- **Claude Code**: [`CLAUDE.md`](../../CLAUDE.md) と [`.claude/rules/**`](../../.claude/rules/) — `paths:` frontmatter による条件付き auto-load
- **両 AI 共通の詳細リファレンス**: [`docs/reference/claude-rules/**`](../reference/claude-rules/) — `.claude/rules/{bun-patterns, react/hooks, frontend/gsap+ui-ux+anti-ai}` から active 引用される詳細セクション

過去ここに存在した個別ガイド（`coding-standards.md` / `type-safety.md` / `testing.md` / `nuqs.md` / `prisma.md` / `turbopack.md`）はいずれも実コンテンツを持たない redirect stub だったため clean-break で削除。実装ルールは AI 別の正本（上記）から直接参照する。

## 関連

- [アーキテクチャ](../architecture/README.md) — 設計判断・データフロー
- [運用](../operations/README.md) — デプロイ・インフラ・cron
- [セキュリティ](../security/README.md) — 認証・保護対策
- [Codex Instruction Architecture](../architecture/codex-instructions.md) — Codex 配置仕様の詳細
- [AI Agent Instructions Layout](../architecture/agent-instructions.md) — `.claude/*` / `AGENTS.md` の配置原則
