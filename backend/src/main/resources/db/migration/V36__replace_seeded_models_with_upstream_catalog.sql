-- Model configuration is now discovered from official /models responses.
-- Task metadata and previous supplier usage remain intact.
DELETE FROM ai_models;
ALTER TABLE ai_models ADD COLUMN source_url VARCHAR(512),
    ADD COLUMN upstream_metadata JSON,
    ADD COLUMN upstream_present TINYINT NOT NULL DEFAULT 0,
    ADD COLUMN catalog_revision VARCHAR(36);
