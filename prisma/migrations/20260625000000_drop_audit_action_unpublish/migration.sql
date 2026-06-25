-- AuditAction.UNPUBLISH 値を撤去
--
-- writer 0 件で dead 値 (action-auth.ts mapper も 'unpublish' を持たない)。
-- 再生成のため、まず別 enum へ rename → 新 enum を作り直し → 旧 enum を DROP する。
-- (PostgreSQL では ENUM 値の DROP が直接サポートされていないため公式回避策を採用)
-- https://www.postgresql.org/docs/current/sql-altertype.html
--
-- 注: 既存 audit_logs 行に UNPUBLISH 値があれば失敗するが、本 dead 値は writer 0 件のため
-- 本番にも該当行は存在しない。dev seed の UNPUBLISH エントリは本 PR で同時に撤去済み。

ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";

CREATE TYPE "AuditAction" AS ENUM (
  'CREATE',
  'UPDATE',
  'DELETE',
  'PUBLISH',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'PERMISSION_DENIED',
  'PASSWORD_CHANGE',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_FAILED',
  'ROLE_CHANGE'
);

-- squawk-ignore changing-column-type
ALTER TABLE "audit_logs"
  ALTER COLUMN "action" TYPE "AuditAction"
  USING ("action"::text::"AuditAction");

DROP TYPE "AuditAction_old";
