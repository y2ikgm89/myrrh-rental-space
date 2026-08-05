-- squawk-ignore-file changing-column-type
--
-- 同じ値域の列に、1 つの答えを与える。
--
-- ## 何が起きていたか
--
-- 「メールアドレスの長さ」に対して、このスキーマには **4 つの答え**が同居していた:
--
--   event_registrations.email       VARCHAR(255)
--   terms_agreements.guest_email    VARCHAR(255)
--   pending_customer_merges.guest_email VARCHAR(320)
--   customers.email / users.email / inquiries.email / reservations.guest_email  制限なし
--
-- 同じことが住所（郵便番号 8 vs 10、都道府県 10 vs 20、建物名 200 vs 100）、
-- 電話（20 vs 30）、氏名でも起きていた。表ごとに独立して答えを決めた結果で、
-- **どれが正しいのかを誰も決めていない**状態だった。
--
-- ## 採った値
--
-- 各ドメインで **アプリが実際に受理する最長**（safeParse で実測）を採る。
-- 狭い方に寄せると、今まで通っていた入力が理由の分からない 500 になる。
--
--   | ドメイン | 実測（フォームごと） | 採用 |
--   | --- | --- | --- |
--   | メール | 254 / 254 / 254 / 100 / **上限なし** | 254（RFC 5321） |
--   | 電話 | 20 / 20 / 20 / 20 / **30** | 30 |
--   | 郵便番号 | 8 / 10 / 10 | 10 |
--   | 都道府県 | 10 / **20** / 10 | 20 |
--   | 市区町村 | 100 / 100 / 50 | 100 |
--   | 町名番地 | 200 / 200 / 100 | 200 |
--   | 建物名 | 200 / 100 / 100 | 200 |
--   | 姓・名 | 50 / 50 / 50 | 50 |
--   | 会社名 | 100 / 100 / 100 | 100 |
--
-- `locations.email` だけはアプリ側にも上限が無かった（実測）。列に上限を付けると
-- 長い値が 22001 の 500 になるので、**同じ PR で Zod 側にも上限を足してある**。
-- そうしないと「保存できない理由が画面に出ない」状態を作ってしまう。
--
-- ## 破壊的 DDL であること
--
-- `ALTER COLUMN ... TYPE` は deploy-production.yml の破壊的 DDL 判定に合致し、
-- 計画ダウンタイムが自動で付く（意図どおり）。text → varchar(n) はテーブル書換。
--
-- ## 適用前に本番で流す確認クエリ
--
-- migration 内でデータを黙って切り詰めるのは禁止（会計・連絡先の証跡を壊す）なので、
-- 既存値が超えていれば**この migration は落ちる**。事前確認:
--
--   SELECT 'locations.email' AS col, count(*) FROM locations WHERE length(email) > 254
--   UNION ALL SELECT 'customers.email', count(*) FROM customers WHERE length(email) > 254
--   UNION ALL SELECT 'customers.phone_number', count(*) FROM customers WHERE length(phone_number) > 30
--   UNION ALL SELECT 'inquiries.name', count(*) FROM inquiries WHERE length(name) > 100
--   UNION ALL SELECT 'inquiries.subject', count(*) FROM inquiries WHERE length(subject) > 200;
--
-- 0 でなければ、切り詰めるか列を広げるかをデプロイ前に判断する。
--
-- ## inquiries.name だけ 101
--
-- この列は `${lastName} ${firstName}` で組まれる（public/_shared/actions/inquiry.ts）。
-- 姓・名がそれぞれ 50 なので**区切りの半角空白ぶんを足して 101** でないと、
-- 上限いっぱいの氏名で 22001 になり問い合わせ送信が 500 で失われる。
-- receipts.recipient_name が VarChar(100) で同じ壊れ方をしている。
-- 値は customer-shared-fields.ts の FULL_NAME_MAX_LENGTH に縛ってある。
--
-- ## @db.Text は DDL を生まない
--
-- 残り 176 列に付けた `@db.Text` は Prisma 既定の `text` と同じ型なので、この
-- migration には現れない。**「上限なし」を宣言として schema に書いた**だけで、
-- 実体は変わっていない。

BEGIN;


-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "last_name" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "first_name" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "last_name_kana" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "first_name_kana" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "company_name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(254),
ALTER COLUMN "email_canonical" SET DATA TYPE VARCHAR(254),
ALTER COLUMN "phone_number" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "postal_code" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "prefecture" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "event_registrations" ALTER COLUMN "email" SET DATA TYPE VARCHAR(254),
ALTER COLUMN "phone" SET DATA TYPE VARCHAR(30);

-- AlterTable
ALTER TABLE "inquiries" ALTER COLUMN "name" SET DATA TYPE VARCHAR(101),
ALTER COLUMN "company_name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(254),
ALTER COLUMN "phone_number" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "subject" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "locations" ALTER COLUMN "postal_code" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "prefecture" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "city" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "street_address" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "building_name" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "phone_number" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(254);

-- AlterTable
ALTER TABLE "pending_customer_email_changes" ALTER COLUMN "new_email" SET DATA TYPE VARCHAR(254),
ALTER COLUMN "new_email_canonical" SET DATA TYPE VARCHAR(254);

-- AlterTable
ALTER TABLE "pending_customer_merges" ALTER COLUMN "guest_email" SET DATA TYPE VARCHAR(254);

-- AlterTable
ALTER TABLE "reservations" ALTER COLUMN "guest_last_name" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "guest_first_name" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "guest_email" SET DATA TYPE VARCHAR(254),
ALTER COLUMN "guest_phone" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "guest_company_name" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "settings_organization" ALTER COLUMN "phone_number" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "fax_number" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(254),
ALTER COLUMN "postal_code" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "prefecture" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "city" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "street_address" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "building_name" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "sender_email" SET DATA TYPE VARCHAR(254),
ALTER COLUMN "reply_to_email" SET DATA TYPE VARCHAR(254);

-- AlterTable
ALTER TABLE "terms_agreements" ALTER COLUMN "guest_email" SET DATA TYPE VARCHAR(254);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE VARCHAR(254);


COMMIT;
