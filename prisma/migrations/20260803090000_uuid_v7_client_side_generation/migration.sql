-- 主キーの UUID 採番を Prisma 側の uuid v7 に一本化する。
--
-- ## 何が分裂していたか
--
--   46 モデル … `@default(uuid())`  = Prisma が採番する UUID v4（DB 側 DEFAULT なし）
--    3 モデル … `@default(dbgenerated("gen_random_uuid()"))` = DB が採番する v4
--                （receipts / refunds / transfer_accounts）
--
-- 同じ「v4 の UUID 主キー」なのに採番の主体が違うため、raw SQL で行を作るときの契約が
-- テーブルごとに変わる。48 モデルすべてを「Prisma が採番し DB に DEFAULT は持たない」
-- 単一の契約へ寄せる。
--
-- ## なぜ v7 か
--
-- v4 は完全ランダムなので、挿入のたびに主キー B-tree のランダムな位置へ書き込む。
-- ページ分割とキャッシュミスが積み上がり、行数が増えるほど挿入が重くなる。v7 は
-- 先頭 48bit が Unix 時刻ミリ秒なので生成順がほぼ昇順になり、挿入が末尾ページに
-- 集中する。reservations / audit_logs のような追記主体のテーブルほど効く。
--
-- Prisma 7 は `@default(uuid(7))` を正式サポートしている（schema reference）。
-- `uuid` 型はバージョンを区別しないので、**既存の v4 行と新規の v7 行は同じ列に
-- そのまま共存する**。既存データの書き換えは無い。
--
-- ## この migration が触るもの
--
-- 46 モデルの v4 → v7 は Prisma のクライアント側採番なので **SQL は 1 行も出ない**
-- （DB 側に DEFAULT が無いため）。実際に生成されるのは下の 3 文だけで、これは
-- 「DB 側採番をやめて Prisma 側に寄せる」ぶんの差分である。
--
-- `ALTER COLUMN ... DROP DEFAULT` は deploy-production.yml の breaking 判定
-- （DROP COLUMN / DROP CONSTRAINT / RENAME / SET NOT NULL / TYPE / DROP TABLE /
-- DROP TYPE）のいずれにも一致しないため、**計画ダウンタイムは発生しない**。
--
-- 注意: これ以降、この 3 テーブルへ raw SQL で行を作るときは id を明示する必要がある。

ALTER TABLE "receipts" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "refunds" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "transfer_accounts" ALTER COLUMN "id" DROP DEFAULT;
