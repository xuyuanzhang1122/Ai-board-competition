SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    ('deepseek-v4-flash', 'DeepSeek V4 Flash', 'LANGUAGE', 'DeepSeek', 1, 3, 'DeepSeek fast text model with OpenAI-compatible chat completions'),
    ('deepseek-v4-pro', 'DeepSeek V4 Pro', 'LANGUAGE', 'DeepSeek', 1, 4, 'DeepSeek high-quality reasoning text model with OpenAI-compatible chat completions'),
    ('agnes-2.0-flash', 'Agnes 2.0 Flash', 'LANGUAGE', 'Agnes', 1, 5, 'Agnes multimodal chat model with text and image URL understanding'),
    ('agnes-image-2.0-flash', 'Agnes Image 2.0 Flash', 'IMAGE', 'Agnes', 1, 4, 'Agnes fast image generation and image editing model'),
    ('agnes-image-2.1-flash', 'Agnes Image 2.1 Flash', 'IMAGE', 'Agnes', 1, 5, 'Agnes image generation model optimized for high-density visual detail'),
    ('agnes-video-v2.0', 'Agnes Video V2.0', 'VIDEO', 'Agnes', 1, 2, 'Agnes asynchronous text-to-video and image-to-video generation model')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    type = VALUES(type),
    provider = VALUES(provider),
    enabled = VALUES(enabled),
    sort_order = VALUES(sort_order),
    description = VALUES(description);

INSERT INTO pricing_rules (biz_type, model_code, unit, price, enabled)
VALUES
    ('TEXT_GENERATION', 'deepseek-v4-flash', 'PER_REQUEST', 1, 1),
    ('TEXT_GENERATION', 'deepseek-v4-pro', 'PER_REQUEST', 3, 1),
    ('TEXT_GENERATION', 'agnes-2.0-flash', 'PER_REQUEST', 0, 1),
    ('IMAGE_GENERATION', 'agnes-image-2.0-flash', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'agnes-image-2.1-flash', 'PER_ITEM', 0, 1),
    ('VIDEO_GENERATION', 'agnes-video-v2.0', 'PER_SECOND', 0, 1)
ON DUPLICATE KEY UPDATE
    unit = VALUES(unit),
    price = VALUES(price),
    enabled = VALUES(enabled);

SET FOREIGN_KEY_CHECKS = 1;
