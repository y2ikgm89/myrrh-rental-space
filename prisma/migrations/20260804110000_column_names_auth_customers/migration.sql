-- squawk-ignore-file renaming-column
--
-- 認証（Better Auth 4 表 + ページ割当）と顧客まわりの物理列名を snake_case へ寄せる。
--
-- squawk の `renaming-column` は Risk 1（ローリング切替窓で旧 revision が新スキーマを
-- 叩いて 500）を検出する rule。この 1 本を file 単位で免除する根拠は WP9（表名）と同じで、
-- `.squawk.toml` 冒頭と `scripts/lint-migrations.ts` の docblock の 3 条件を満たす:
--
--   1. Cloud Run は min0/max1 の単一インスタンスで切替は atomic。旧 revision と
--      新スキーマが同時に存在する窓が原理的に無い。
--   2. `ALTER TABLE ... RENAME COLUMN` は deploy-production.yml の破壊的 DDL grep に
--      合致するので、デプロイは自動で計画ダウンタイム付きへ切り替わる。
--   3. アプリ側の型は無変更。物理列名は `@map` の値であって Prisma の TypeScript API
--      には現れないため、client 再生成後も型エラーは 0 件。
--
-- Prisma の自動生成は使っていない。`@map` の変更は DROP COLUMN + ADD COLUMN として
-- 出るので全件消える。`RENAME COLUMN` なら値・索引・制約・外部キー・CHECK 式が残る
-- （CHECK / index / FK の式は attnum 参照なので自動追随する）。
--
-- 3 段構成:
--   1. 列の RENAME
--   2. Prisma 管理オブジェクト（FK / index）の追随 — `prisma migrate diff` の出力そのもの
--   3. 手書き CHECK の名前の追随 — 式は追随するが名前は残るので明示的に改名する

BEGIN;

-- 1. 列
ALTER TABLE users RENAME COLUMN "emailVerified" TO email_verified;
ALTER TABLE users RENAME COLUMN "dashboardEnabled" TO dashboard_enabled;
ALTER TABLE users RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE users RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE accounts RENAME COLUMN "userId" TO user_id;
ALTER TABLE accounts RENAME COLUMN "accountId" TO account_id;
ALTER TABLE accounts RENAME COLUMN "providerId" TO provider_id;
ALTER TABLE accounts RENAME COLUMN "accessToken" TO access_token;
ALTER TABLE accounts RENAME COLUMN "refreshToken" TO refresh_token;
ALTER TABLE accounts RENAME COLUMN "idToken" TO id_token;
ALTER TABLE accounts RENAME COLUMN "accessTokenExpiresAt" TO access_token_expires_at;
ALTER TABLE accounts RENAME COLUMN "refreshTokenExpiresAt" TO refresh_token_expires_at;
ALTER TABLE accounts RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE accounts RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE sessions RENAME COLUMN "userId" TO user_id;
ALTER TABLE sessions RENAME COLUMN "expiresAt" TO expires_at;
ALTER TABLE sessions RENAME COLUMN "ipAddress" TO ip_address;
ALTER TABLE sessions RENAME COLUMN "userAgent" TO user_agent;
ALTER TABLE sessions RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE sessions RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE verifications RENAME COLUMN "expiresAt" TO expires_at;
ALTER TABLE verifications RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE verifications RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE user_page_assignments RENAME COLUMN "userId" TO user_id;
ALTER TABLE user_page_assignments RENAME COLUMN "pageId" TO page_id;
ALTER TABLE customers RENAME COLUMN "lastName" TO last_name;
ALTER TABLE customers RENAME COLUMN "firstName" TO first_name;
ALTER TABLE customers RENAME COLUMN "lastNameKana" TO last_name_kana;
ALTER TABLE customers RENAME COLUMN "firstNameKana" TO first_name_kana;
ALTER TABLE customers RENAME COLUMN "companyName" TO company_name;
ALTER TABLE customers RENAME COLUMN "customerType" TO customer_type;
ALTER TABLE customers RENAME COLUMN "emailCanonical" TO email_canonical;
ALTER TABLE customers RENAME COLUMN "phoneNumber" TO phone_number;
ALTER TABLE customers RENAME COLUMN "postalCode" TO postal_code;
ALTER TABLE customers RENAME COLUMN "streetAddress" TO street_address;
ALTER TABLE customers RENAME COLUMN "totalReservations" TO total_reservations;
ALTER TABLE customers RENAME COLUMN "totalSpent" TO total_spent;
ALTER TABLE customers RENAME COLUMN "lastReservationAt" TO last_reservation_at;
ALTER TABLE customers RENAME COLUMN "firstReservationAt" TO first_reservation_at;
ALTER TABLE customers RENAME COLUMN "isActive" TO is_active;
ALTER TABLE customers RENAME COLUMN "marketingOptIn" TO marketing_opt_in;
ALTER TABLE customers RENAME COLUMN "phoneContactOptIn" TO phone_contact_opt_in;
ALTER TABLE customers RENAME COLUMN "emailDeliveryStatus" TO email_delivery_status;
ALTER TABLE customers RENAME COLUMN "emailDeliveryUpdatedAt" TO email_delivery_updated_at;
ALTER TABLE customers RENAME COLUMN "emailDeliveryReason" TO email_delivery_reason;
ALTER TABLE customers RENAME COLUMN "flaggedForReviewAt" TO flagged_for_review_at;
ALTER TABLE customers RENAME COLUMN "flagReasons" TO flag_reasons;
ALTER TABLE customers RENAME COLUMN "anonymizedAt" TO anonymized_at;
ALTER TABLE customers RENAME COLUMN "anonymizedReason" TO anonymized_reason;
ALTER TABLE customers RENAME COLUMN "suppressedEmailHash" TO suppressed_email_hash;
ALTER TABLE customers RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE customers RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE customers RENAME COLUMN "userId" TO user_id;
ALTER TABLE pending_customer_email_changes RENAME COLUMN "customerId" TO customer_id;
ALTER TABLE pending_customer_email_changes RENAME COLUMN "newEmail" TO new_email;
ALTER TABLE pending_customer_email_changes RENAME COLUMN "newEmailCanonical" TO new_email_canonical;
ALTER TABLE pending_customer_email_changes RENAME COLUMN "tokenHash" TO token_hash;
ALTER TABLE pending_customer_email_changes RENAME COLUMN "expiresAt" TO expires_at;
ALTER TABLE pending_customer_email_changes RENAME COLUMN "consumedAt" TO consumed_at;
ALTER TABLE pending_customer_email_changes RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE pending_customer_merges RENAME COLUMN "targetCustomerId" TO target_customer_id;
ALTER TABLE pending_customer_merges RENAME COLUMN "sourceCustomerId" TO source_customer_id;
ALTER TABLE pending_customer_merges RENAME COLUMN "guestEmail" TO guest_email;
ALTER TABLE pending_customer_merges RENAME COLUMN "tokenHash" TO token_hash;
ALTER TABLE pending_customer_merges RENAME COLUMN "expiresAt" TO expires_at;
ALTER TABLE pending_customer_merges RENAME COLUMN "consumedAt" TO consumed_at;
ALTER TABLE pending_customer_merges RENAME COLUMN "createdAt" TO created_at;

-- 2. Prisma 管理オブジェクト（FK / index）
ALTER TABLE "accounts" RENAME CONSTRAINT "accounts_userId_fkey" TO "accounts_user_id_fkey";
ALTER TABLE "customers" RENAME CONSTRAINT "customers_userId_fkey" TO "customers_user_id_fkey";
ALTER TABLE "pending_customer_email_changes" RENAME CONSTRAINT "pending_customer_email_changes_customerId_fkey" TO "pending_customer_email_changes_customer_id_fkey";
ALTER TABLE "pending_customer_merges" RENAME CONSTRAINT "pending_customer_merges_sourceCustomerId_fkey" TO "pending_customer_merges_source_customer_id_fkey";
ALTER TABLE "pending_customer_merges" RENAME CONSTRAINT "pending_customer_merges_targetCustomerId_fkey" TO "pending_customer_merges_target_customer_id_fkey";
ALTER TABLE "sessions" RENAME CONSTRAINT "sessions_userId_fkey" TO "sessions_user_id_fkey";
ALTER TABLE "user_page_assignments" RENAME CONSTRAINT "user_page_assignments_pageId_fkey" TO "user_page_assignments_page_id_fkey";
ALTER TABLE "user_page_assignments" RENAME CONSTRAINT "user_page_assignments_userId_fkey" TO "user_page_assignments_user_id_fkey";
ALTER INDEX "accounts_userId_idx" RENAME TO "accounts_user_id_idx";
ALTER INDEX "customers_createdAt_idx" RENAME TO "customers_created_at_idx";
ALTER INDEX "customers_customerType_idx" RENAME TO "customers_customer_type_idx";
ALTER INDEX "customers_emailCanonical_userId_idx" RENAME TO "customers_email_canonical_user_id_idx";
ALTER INDEX "customers_emailDeliveryStatus_idx" RENAME TO "customers_email_delivery_status_idx";
ALTER INDEX "customers_flaggedForReviewAt_idx" RENAME TO "customers_flagged_for_review_at_idx";
ALTER INDEX "customers_isActive_idx" RENAME TO "customers_is_active_idx";
ALTER INDEX "customers_lastName_firstName_idx" RENAME TO "customers_last_name_first_name_idx";
ALTER INDEX "customers_lastReservationAt_idx" RENAME TO "customers_last_reservation_at_idx";
ALTER INDEX "customers_phoneNumber_idx" RENAME TO "customers_phone_number_idx";
ALTER INDEX "customers_userId_key" RENAME TO "customers_user_id_key";
ALTER INDEX "pending_customer_email_changes_customerId_idx" RENAME TO "pending_customer_email_changes_customer_id_idx";
ALTER INDEX "pending_customer_email_changes_expiresAt_idx" RENAME TO "pending_customer_email_changes_expires_at_idx";
ALTER INDEX "pending_customer_email_changes_tokenHash_key" RENAME TO "pending_customer_email_changes_token_hash_key";
ALTER INDEX "pending_customer_merges_expiresAt_idx" RENAME TO "pending_customer_merges_expires_at_idx";
ALTER INDEX "pending_customer_merges_sourceCustomerId_idx" RENAME TO "pending_customer_merges_source_customer_id_idx";
ALTER INDEX "pending_customer_merges_targetCustomerId_idx" RENAME TO "pending_customer_merges_target_customer_id_idx";
ALTER INDEX "pending_customer_merges_tokenHash_key" RENAME TO "pending_customer_merges_token_hash_key";
ALTER INDEX "sessions_userId_idx" RENAME TO "sessions_user_id_idx";
ALTER INDEX "user_page_assignments_pageId_idx" RENAME TO "user_page_assignments_page_id_idx";

-- 3. 手書き CHECK の名前
ALTER TABLE customers RENAME CONSTRAINT "customers_emailCanonical_not_empty_check" TO "customers_email_canonical_not_empty_check";

COMMIT;
