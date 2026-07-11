-- pg_trgm extension backs the `gin_trgm_ops` operator class used below.
-- IF NOT EXISTS is idempotent across environments (local docker, Neon, test DB)
-- so the migration is safe to replay. Neon supports pg_trgm out of the box.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Admin command-palette (src/shared/domain/admin-search/queries.ts) issues
-- `ILIKE '%q%'` OR-clauses on 10 tables. Without a trigram GIN index on every
-- OR branch, PostgreSQL falls back to Seq Scan even when only one branch is
-- unindexed. All columns targeted by an `OR: [{ ci(query) }, …]` predicate get
-- a `gin_trgm_ops` GIN index below so the bitmap-OR planner can be used.

-- CreateIndex — locations (searchLocations: name, address)
CREATE INDEX "locations_name_trgm_idx" ON "locations" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "locations_address_trgm_idx" ON "locations" USING GIN ("address" gin_trgm_ops);

-- CreateIndex — spaces (searchSpaces: name, slug)
CREATE INDEX "spaces_name_trgm_idx" ON "spaces" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "spaces_slug_trgm_idx" ON "spaces" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex — customers (searchCustomers: lastName, firstName, email, companyName)
CREATE INDEX "customers_last_name_trgm_idx" ON "customers" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX "customers_first_name_trgm_idx" ON "customers" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "customers_email_trgm_idx" ON "customers" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "customers_company_name_trgm_idx" ON "customers" USING GIN ("companyName" gin_trgm_ops);

-- CreateIndex — coupons (searchCoupons: code, name)
CREATE INDEX "coupons_code_trgm_idx" ON "coupons" USING GIN ("code" gin_trgm_ops);
CREATE INDEX "coupons_name_trgm_idx" ON "coupons" USING GIN ("name" gin_trgm_ops);

-- CreateIndex — inquiries (searchInquiries: name, email, subject)
CREATE INDEX "inquiries_name_trgm_idx" ON "inquiries" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "inquiries_email_trgm_idx" ON "inquiries" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "inquiries_subject_trgm_idx" ON "inquiries" USING GIN ("subject" gin_trgm_ops);

-- CreateIndex — news (searchNews: title, slug)
CREATE INDEX "news_title_trgm_idx" ON "news" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "news_slug_trgm_idx" ON "news" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex — posts (searchPosts: title, slug)
CREATE INDEX "posts_title_trgm_idx" ON "posts" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "posts_slug_trgm_idx" ON "posts" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex — pages (searchPages: title, slug)
CREATE INDEX "pages_title_trgm_idx" ON "pages" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "pages_slug_trgm_idx" ON "pages" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex — faq_items (searchFaqItems: question, answer)
CREATE INDEX "faq_items_question_trgm_idx" ON "faq_items" USING GIN ("question" gin_trgm_ops);
CREATE INDEX "faq_items_answer_trgm_idx" ON "faq_items" USING GIN ("answer" gin_trgm_ops);

-- CreateIndex — events (searchEvents: title, slug)
CREATE INDEX "events_title_trgm_idx" ON "events" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "events_slug_trgm_idx" ON "events" USING GIN ("slug" gin_trgm_ops);
