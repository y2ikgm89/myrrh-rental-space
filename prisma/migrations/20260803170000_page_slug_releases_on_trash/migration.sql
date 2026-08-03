-- `pages.slug` の一意制約を「ゴミ箱に入れた行は slug を手放す」形へ揃える。
--
-- このリポジトリの既定は既に「論理削除された行の slug は衝突とみなさない」で、
-- Post は `deletedAt IS NULL`、Space / Location / SpaceCategory は `isActive = true`
-- の partial unique を持つ（`findSlugConflict` のコメントが明示している）。
-- Page だけが素の UNIQUE のままで、ゴミ箱に入れたページが URL を保持し続けていた。
--
-- 実害: 管理者がページをゴミ箱に入れた後、同じ slug で作り直そうとすると
-- 「このスラッグは既にページで使用されています」と出る。ところが衝突相手は
-- 一覧に出ないゴミ箱の行なので、**何とぶつかっているのか画面から辿れない**。
--
-- 復元時は逆に衝突しうる（ゴミ箱に入れている間に同じ slug の新ページが作られる）。
-- `restorePageCommand` が事前確認 + P2002 の握り潰しで CONFLICT を返す
-- （`restorePost` と同じ形）。
--
-- 文の順序: **先に新しい索引を作り、後から古い索引を落とす。** 逆順にすると
-- CREATE が失敗したときに「どちらの一意性も無い」状態で止まる。BEGIN/COMMIT で
-- 包んでいるのでこの migration 自体は原子的だが、順序も併せて正しくしておく。
--
-- CREATE 側が失敗しうるのは「同じ slug の active な行が 2 行以上ある」場合のみで、
-- 現行の素の UNIQUE がそれを許していないため既存データでは起こり得ない。
--
-- `DROP INDEX` は deploy-production.yml の breaking 判定（ALTER TABLE ... DROP
-- CONSTRAINT / DROP TABLE / DROP TYPE 等）のいずれにも一致しないため、
-- **この migration 単体では計画ダウンタイムにならない**。

BEGIN;

CREATE UNIQUE INDEX "pages_slug_active_key" ON "pages"("slug") WHERE "isActive" = true;

DROP INDEX "pages_slug_key";

COMMIT;
