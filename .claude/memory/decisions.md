# 意思決定記録 (Decisions)

> プロジェクトの重要な意思決定を記録します。
> 形式: `[D{番号}] {決定内容}` + 理由・日付

---

## 技術選択

### [D1] Next.js 16 + App Router を採用

**決定日**: 2026-01-07
**理由**:
- 最新の React 19 との完全な互換性
- Server Components / Server Actions の成熟
- Turbopack によるビルドパフォーマンス向上
- ISR / キャッシュ戦略の柔軟性

### [D2] Prisma 7 + Supabase (PostgreSQL) を採用

**決定日**: 2026-01-07
**理由**:
- 型安全な ORM
- マイグレーション管理の容易さ
- Supabase の Realtime 機能活用
- 開発環境は Docker PostgreSQL、本番は Supabase クラウド

### [D3] Auth.js v5 (NextAuth) を採用

**決定日**: 2026-01-07
**理由**:
- App Router との親和性
- JWT セッション管理
- Prisma Adapter 対応
- OAuth プロバイダーの柔軟なサポート

### [D4] Bun ランタイムを採用

**決定日**: 2026-01-07
**理由**:
- npm/yarn より高速なパッケージ管理
- ネイティブ TypeScript サポート
- 開発・本番環境での一貫性

---

## アーキテクチャ

### [D5] Server Components 優先アーキテクチャ

**決定日**: 2026-01-07
**理由**:
- データ取得の最適化（N+1 問題の回避）
- バンドルサイズの削減
- SEO 対応の容易さ

### [D6] Server Actions によるデータ変更

**決定日**: 2026-01-07
**理由**:
- API Routes より簡潔な実装
- 型安全な RPC
- Progressive Enhancement サポート

---

## セキュリティ

### [D7] Cloudflare Turnstile を Bot 対策に採用

**決定日**: 2026-01-07
**理由**:
- reCAPTCHA より軽量
- ユーザー体験への影響が少ない
- Cloudflare CDN との統合

---

## 追記欄

<!-- 新しい決定事項はここに追加 -->
