-- 既に重なっているイベント枠が残っていないことを、**実行される検査**で確かめる。
--
-- ## なぜ要るのか
--
-- 直前の migration（`event_slot_space_exclusivity`）が足したのは CONSTRAINT TRIGGER
-- で、**trigger は既存行を走査しない**。CHECK 制約を足したときと違い、本番に既に
-- 重なった枠があっても適用は成功してしまう。
--
-- そのまま残ると何が起きるか: 申込の書込（`event_registrations` への INSERT）は
-- この trigger を発火させないので、重なった 2 枠は**そのまま申込を受け付け続ける**。
-- 同じ部屋の同じ時刻に定員 2 倍の確定申込が入り、当日先着以外が入室できない。
-- 直った気になっているぶん、直す前より悪い。
--
-- 前の migration のヘッダには同じ内容の SELECT が**コメントとして**書いてあったが、
-- 本番の実行は `migration-preconditions.ts && prisma migrate deploy` であって、
-- コメントは誰も流さない。人が読んで手で流す前提の検査は、流し忘れた瞬間に
-- 「検査したつもり」になる。**実行される形に置き換える。**
--
-- ## どこで落ちるか
--
-- `scripts/migration-preconditions.ts` は未適用の migration を 1 つの
-- トランザクションで実際に流して必ず巻き戻す。本番の Cloud Run Job は
-- `migrate deploy` の**前**にこれを実行するので、違反があれば
-- `_prisma_migrations` に失敗を残さずここで止まり、衝突している枠の id が出る。
--
-- 判定は trigger 本体と同じ述語（同一 space・非削除・status ∈ {DRAFT, PUBLISHED}・
-- 半開区間の交差）。片方向で足りる（a と b を入れ替えた組も同じ交差を満たす）。

BEGIN;

DO $$
DECLARE
  conflict RECORD;
BEGIN
  SELECT a.id AS slot_a, b.id AS slot_b, ea.space_id AS space_id
    INTO conflict
  FROM event_time_slots a
  JOIN events ea ON ea.id = a.event_id
  JOIN event_time_slots b ON b.id <> a.id
  JOIN events eb ON eb.id = b.event_id
  WHERE ea.space_id IS NOT NULL
    AND ea.space_id = eb.space_id
    AND ea.deleted_at IS NULL
    AND eb.deleted_at IS NULL
    AND ea.status IN ('DRAFT', 'PUBLISHED')
    AND eb.status IN ('DRAFT', 'PUBLISHED')
    AND a.start_at < b.end_at
    AND a.end_at > b.start_at
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'legacy overlapping event slots remain: % and % on space % — どちらを残すか決めてから再実行する',
      conflict.slot_a, conflict.slot_b, conflict.space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;
END $$;

COMMIT;
