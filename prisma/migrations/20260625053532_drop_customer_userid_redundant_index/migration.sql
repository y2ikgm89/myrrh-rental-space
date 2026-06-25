-- Drop redundant @@index([userId]) — Customer.userId is already @unique (customers_userId_key)
-- which provides an index. The non-unique customers_userId_idx duplicates it.
DROP INDEX IF EXISTS "customers_userId_idx";
