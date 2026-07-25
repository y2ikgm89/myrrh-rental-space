-- AuditAction enum に MANAGE を追加。
--
-- auditLog:manage 権限アクション（完全性検証トリガー等）を CRUD 以外の
-- 意味的に正しい action 値で記録するため。expand-only migration:
--   - ALTER TYPE ADD VALUE のみ (additive、DROP/RENAME 無し)
--   - 既存経路への副作用ゼロ

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MANAGE';
