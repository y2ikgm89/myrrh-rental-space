-- Enforce canonical display/order invariants at the database boundary.
-- Existing rows are normalized first so environments with historical duplicate
-- order values can migrate cleanly.

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "sortOrder" ASC, "createdAt" ASC, "id" ASC) - 1 AS next_order
  FROM "locations"
  WHERE "isActive" = true
)
UPDATE "locations" AS target
SET "sortOrder" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "locations_active_sortOrder_key"
  ON "locations" ("sortOrder")
  WHERE "isActive" = true;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "sortOrder" ASC, "createdAt" ASC, "id" ASC) - 1 AS next_order
  FROM "space_categories"
)
UPDATE "space_categories" AS target
SET "sortOrder" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "space_categories_sortOrder_key"
  ON "space_categories" ("sortOrder");

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "displayOrder" ASC, "createdAt" ASC, "id" ASC) - 1 AS next_order
  FROM "announcement_bars"
)
UPDATE "announcement_bars" AS target
SET "displayOrder" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "announcement_bars_displayOrder_key"
  ON "announcement_bars" ("displayOrder");

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "order" ASC, "createdAt" ASC, "id" ASC) - 1 AS next_order
  FROM "post_categories"
)
UPDATE "post_categories" AS target
SET "order" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "post_categories_order_key"
  ON "post_categories" ("order");

WITH first_heroes AS (
  SELECT DISTINCT ON ("pageId")
    "id",
    "pageId"
  FROM "sections"
  WHERE "type" = 'page-hero'
  ORDER BY "pageId" ASC, "order" ASC, "createdAt" ASC, "id" ASC
),
ranked_regular AS (
  SELECT
    sections."id",
    ROW_NUMBER() OVER (
      PARTITION BY sections."pageId"
      ORDER BY sections."order" ASC, sections."createdAt" ASC, sections."id" ASC
    ) - 1 AS next_order
  FROM "sections" AS sections
  LEFT JOIN first_heroes
    ON first_heroes."id" = sections."id"
  WHERE first_heroes."id" IS NULL
),
ranked AS (
  SELECT "id", -1 AS next_order FROM first_heroes
  UNION ALL
  SELECT "id", next_order FROM ranked_regular
)
UPDATE "sections" AS target
SET "order" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "sections_pageId_order_key"
  ON "sections" ("pageId", "order");

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "type"
      ORDER BY "order" ASC, "createdAt" ASC, "id" ASC
    ) - 1 AS next_order
  FROM "navigation_items"
)
UPDATE "navigation_items" AS target
SET "order" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "navigation_items_type_order_key"
  ON "navigation_items" ("type", "order");

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "order" ASC, "createdAt" ASC, "id" ASC) - 1 AS next_order
  FROM "social_links"
)
UPDATE "social_links" AS target
SET "order" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "social_links_order_key"
  ON "social_links" ("order");

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "order" ASC, "createdAt" ASC, "id" ASC) - 1 AS next_order
  FROM "faq_categories"
  WHERE "deletedAt" IS NULL
)
UPDATE "faq_categories" AS target
SET "order" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "faq_categories_order_active_key"
  ON "faq_categories" ("order")
  WHERE "deletedAt" IS NULL;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "categoryId"
      ORDER BY "order" ASC, "createdAt" ASC, "id" ASC
    ) - 1 AS next_order
  FROM "faq_items"
  WHERE "deletedAt" IS NULL
)
UPDATE "faq_items" AS target
SET "order" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "faq_items_categoryId_order_active_key"
  ON "faq_items" ("categoryId", "order")
  WHERE "deletedAt" IS NULL;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "displayOrder" ASC, "createdAt" ASC, "id" ASC) - 1 AS next_order
  FROM "terms_documents"
  WHERE "deletedAt" IS NULL
)
UPDATE "terms_documents" AS target
SET "displayOrder" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "terms_documents_displayOrder_active_key"
  ON "terms_documents" ("displayOrder")
  WHERE "deletedAt" IS NULL;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "eventId"
      ORDER BY "sortOrder" ASC, "createdAt" ASC, "id" ASC
    ) - 1 AS next_order
  FROM "event_tickets"
)
UPDATE "event_tickets" AS target
SET "sortOrder" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "event_tickets_eventId_sortOrder_key"
  ON "event_tickets" ("eventId", "sortOrder");

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "sortOrder" ASC, "createdAt" ASC, "id" ASC) - 1 AS next_order
  FROM "instagram_posts"
)
UPDATE "instagram_posts" AS target
SET "sortOrder" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id";

CREATE UNIQUE INDEX "instagram_posts_sortOrder_key"
  ON "instagram_posts" ("sortOrder");
