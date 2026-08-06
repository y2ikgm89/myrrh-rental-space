-- append-only の 4 表を、TRUNCATE でも空にできないようにする。
--
-- ## 何が守られていなかったか
--
-- `audit_logs` / `terms_agreements` / `refunds` / `inquiry_status_history` は
-- append-only（絶対規約 #9）で、trigger 本体も
-- `'audit_logs is append-only; % is not allowed'` と言う。
--
-- **だが拒否しているのは行レベルの BEFORE UPDATE / BEFORE DELETE だけだった。**
-- PostgreSQL の TRUNCATE は ON DELETE trigger を発火させず、別に
-- `BEFORE TRUNCATE ... FOR EACH STATEMENT` を要求する（公式: "TRUNCATE ... does not
-- fire ON DELETE triggers"）。既存の trigger にその形は 1 本も無く、
--
--   TRUNCATE audit_logs;
--
-- の 1 行で改ざん検知の hash chain ごと消せた。監査ログを消せる監査ログは、
-- 無いのと同じ。証跡としての意味を支えているのは「消せないこと」そのものなので、
-- ここが空いているかぎり残り 3 表の保証も成立しない。
--
-- ## bypass は設けない
--
-- 行レベルの trigger には `myrrh.<x>_mutation_bypass` の免除口があるが、
-- **TRUNCATE には付けない**。免除が要るのは seed（作り直し）と data-retention の
-- purge（条件付き DELETE）で、どちらも TRUNCATE を使わない。
-- 「全部消す」に正当な用途が無い以上、逃げ道を用意する理由も無い。
--
-- migration での作り直し（`prisma migrate reset`）はスキーマごと DROP するので
-- この trigger には当たらない。
--
-- ## 関数を 1 本にする理由
--
-- 表ごとの文言は `TG_TABLE_NAME` で出せる。4 本に写経すると、片方だけ直した
-- ときに文言と実体がずれる。

BEGIN;

CREATE FUNCTION prevent_append_only_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only; TRUNCATE is not allowed', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();

CREATE TRIGGER terms_agreements_no_truncate
  BEFORE TRUNCATE ON terms_agreements
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();

CREATE TRIGGER refunds_no_truncate
  BEFORE TRUNCATE ON refunds
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();

CREATE TRIGGER inquiry_status_history_no_truncate
  BEFORE TRUNCATE ON inquiry_status_history
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();

COMMIT;
