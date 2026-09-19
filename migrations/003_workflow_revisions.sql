-- Per-workflow opaque revisions prevent stale updates/deletes, including delete/recreate ABA.
-- The catalog-wide revision table from 002 is intentionally no longer used.
ALTER TABLE workflows ADD COLUMN revision uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE workflows ADD COLUMN schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1);
