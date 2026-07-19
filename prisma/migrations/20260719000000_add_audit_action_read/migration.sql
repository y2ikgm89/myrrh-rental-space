-- OBS-01/AUTHZ-03: AuditAction enum に READ を追加。
--
-- 領収書 PDF DL の session 経路 (mypage) が現状 AuditLog を書かないため、
-- session hijack 検知 / 退会後の履歴保全 / 訂正時の DL 監査ができない。
-- READ 値を追加することで純粋な read アクセス (state 変化を伴わない、
-- session 経路の DL 等) を意味的に正しく記録できるようにする。
--
-- expand-only migration:
--   - ALTER TYPE ADD VALUE のみ (additive、DROP/RENAME 無し)
--   - 既存経路への副作用ゼロ (デプロイ時の計画ダウンタイム発生条件を満たさない)
--   - PostgreSQL 11+ で単一 migration に 1 値のみ追加 (公式推奨)

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'READ';
