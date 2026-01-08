# decisions.md - 意思決定記録

> プロジェクトの重要な意思決定を記録する SSOT

## 形式

```markdown
## [日付] 決定タイトル

**コンテキスト**: なぜこの決定が必要だったか
**決定**: 何を決定したか
**理由**: なぜその選択をしたか
**影響**: どのような影響があるか
**ステータス**: accepted / superseded / deprecated
```

---

## 2026-01-08 ハーネスワークフロー統合

**コンテキスト**: Claude Code と Cursor の 2-Agent ワークフローを効率化するため
**決定**: claude-code-harness を導入し、Plans.md ベースのタスク管理を採用
**理由**:
- セッション跨ぎの文脈維持
- PM/Impl 役割分担の明確化
- 品質保護ルールの自動適用
**影響**:
- Plans.md でタスク管理
- .claude/rules/ で品質保護
- 2-Agent モードで Cursor と連携
**ステータス**: accepted

---

## 2026-01-08 技術スタック選定

**コンテキスト**: レンタルスペース予約システムの技術基盤
**決定**: Next.js 16 + Prisma 7 + Auth.js 5 + Supabase
**理由**:
- Next.js 16: App Router + Server Components で高パフォーマンス
- Prisma 7: 型安全な ORM
- Auth.js 5: 柔軟な認証基盤
- Supabase: PostgreSQL + Realtime + Storage
**影響**: 全実装がこのスタックに準拠
**ステータス**: accepted
