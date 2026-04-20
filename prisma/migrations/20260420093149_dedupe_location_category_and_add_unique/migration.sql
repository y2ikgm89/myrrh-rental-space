-- Dedupe locations: re-link FKs to earliest-created record per name, then drop duplicates, then add UNIQUE(name)

-- Step 1: Re-link spaces.locationId from duplicate → keeper (earliest per name)
WITH keepers AS (
  SELECT DISTINCT ON (name) id, name
  FROM locations
  ORDER BY name, "createdAt" ASC
),
mapping AS (
  SELECT dup.id AS dup_id, k.id AS keeper_id
  FROM locations dup
  JOIN keepers k ON k.name = dup.name
  WHERE dup.id <> k.id
)
UPDATE spaces s
SET "locationId" = m.keeper_id
FROM mapping m
WHERE s."locationId" = m.dup_id;

-- Step 2: Re-link events.locationId from duplicate → keeper
WITH keepers AS (
  SELECT DISTINCT ON (name) id, name
  FROM locations
  ORDER BY name, "createdAt" ASC
),
mapping AS (
  SELECT dup.id AS dup_id, k.id AS keeper_id
  FROM locations dup
  JOIN keepers k ON k.name = dup.name
  WHERE dup.id <> k.id
)
UPDATE events e
SET "locationId" = m.keeper_id
FROM mapping m
WHERE e."locationId" = m.dup_id;

-- Step 3: Delete duplicate locations
DELETE FROM locations
WHERE id NOT IN (
  SELECT id FROM (
    SELECT DISTINCT ON (name) id FROM locations ORDER BY name, "createdAt" ASC
  ) t
);

-- Step 4: Re-link spaces.categoryId from duplicate → keeper
WITH keepers AS (
  SELECT DISTINCT ON (name) id, name
  FROM space_categories
  ORDER BY name, "createdAt" ASC
),
mapping AS (
  SELECT dup.id AS dup_id, k.id AS keeper_id
  FROM space_categories dup
  JOIN keepers k ON k.name = dup.name
  WHERE dup.id <> k.id
)
UPDATE spaces s
SET "categoryId" = m.keeper_id
FROM mapping m
WHERE s."categoryId" = m.dup_id;

-- Step 5: Delete duplicate space_categories
DELETE FROM space_categories
WHERE id NOT IN (
  SELECT id FROM (
    SELECT DISTINCT ON (name) id FROM space_categories ORDER BY name, "createdAt" ASC
  ) t
);

-- Step 6: Add UNIQUE constraint on name (prevents future seed duplicates)
ALTER TABLE locations ADD CONSTRAINT locations_name_key UNIQUE (name);
ALTER TABLE space_categories ADD CONSTRAINT space_categories_name_key UNIQUE (name);
