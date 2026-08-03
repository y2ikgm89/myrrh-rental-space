-- ドメインが既に前提にしている一意性を DB に宣言する。
--
-- ## Reservation の Stripe id
--
-- `EventRegistration.stripeCheckoutSessionId` / `stripePaymentIntentId` は最初から
-- `@unique` で、schema のコメントは「(Reservation 側と同型)」と書いていた。**同型では
-- なかった** — 予約側は両方とも素の nullable 列で、同じ Checkout Session や
-- PaymentIntent が 2 つの予約に紐づいても DB は受理する。返金は PaymentIntent を
-- idempotency key の一部として使うので、重複したまま気づかない状態が一番危ない。
--
-- `@unique` が張る一意索引は `stripePaymentIntentId` の単列索引を完全に包含するため、
-- 既存の `reservations_stripePaymentIntentId_idx` は落とす（同じ列に 2 本持つと
-- 書込コストだけ二重に払う）。
--
-- Stripe 側の id は元々グローバル一意なので、重複が実在するならそれ自体が
-- 検出すべき不具合である。実測: test DB の非 NULL 行に重複は 0 件。
--
-- ## TermsDocument.slug
--
-- 論理削除を持つのに `@unique` が無条件で、**削除済みの規約が slug を恒久占有**して
-- いた。同じモデルの `displayOrder` は既に partial unique（20260705000000）で、
-- Post / FaqCategory / Event / Space / Location も同じ形に揃っている。
-- TermsDocument.slug だけが取り残されていた。
--
-- なお Page.slug も無条件 unique だが**こちらは変更しない**。Page は slug が
-- アイデンティティで、admin ルートが `/admin/pages/[slug]`、domain も
-- `findUnique({ where: { slug } })` / `update({ where: { slug } })` /
-- `delete({ where: { slug } })` を多数持つ。partial 化すると slug が
-- `PageWhereUniqueInput` から外れてそれら全てが型エラーになる。Page には
-- `deletedAt` も無く（`isActive` は公開状態）、解くべき問題自体が別物である。
--
-- SQL は `prisma migrate diff --from-config-datasource --to-schema --script` の生成物。

-- DropIndex
DROP INDEX "reservations_stripePaymentIntentId_idx";

-- DropIndex
DROP INDEX "terms_documents_slug_key";

-- CreateIndex
CREATE UNIQUE INDEX "reservations_stripeCheckoutSessionId_key" ON "reservations"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_stripePaymentIntentId_key" ON "reservations"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "terms_documents_slug_active_key" ON "terms_documents"("slug") WHERE ("deletedAt" IS NULL);

