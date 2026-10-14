-- Keep historical rows and usage records; do not enable unverified accounts/models.
UPDATE ai_models SET enabled = 0 WHERE TRIM(UPPER(type)) = 'LANGUAGE';

INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    ('deepseek-flash', 'DeepSeek Flash', 'LANGUAGE', 'DeepSeek', 0, 1, 'Official text adapter; account verification required'),
    ('deepseek-v4-pro', 'DeepSeek V4 Pro', 'LANGUAGE', 'DeepSeek', 0, 2, 'Official text adapter; account verification required'),
    ('mimo-v2.6-pro', 'MiMo V2.6 Pro', 'LANGUAGE', 'MiMo', 0, 3, 'Official text adapter; account verification required')
ON DUPLICATE KEY UPDATE
    name = VALUES(name), type = VALUES(type), provider = VALUES(provider),
    enabled = VALUES(enabled), sort_order = VALUES(sort_order), description = VALUES(description);

-- Existing test-free charging is not a verified supplier cost or production wallet rule.
-- Pricing must be reviewed explicitly before release; do not invent new supplier prices here.
UPDATE pricing_rules SET enabled = 0 WHERE biz_type = 'TEXT_GENERATION';
