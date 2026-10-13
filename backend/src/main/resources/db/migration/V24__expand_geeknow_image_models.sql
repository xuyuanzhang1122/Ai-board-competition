SET NAMES utf8mb4;

-- 与 .firecrawl/geeknow-images-model-matrix.md 中已验证可用的当前图片模型对齐。
INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    ('gpt-image-2-pro', 'GPT Image 2 Pro', 'IMAGE', 'Geeknow', 1, 5, 'Geeknow GPT Image 2 Pro 高分辨率图片模型'),
    ('gemini-2.5-flash-image-preview', 'Gemini 2.5 Flash Image Preview', 'IMAGE', 'Geeknow', 1, 6, 'Geeknow Gemini 2.5 Flash 图片模型'),
    ('doubao-seedream-5-0-260128', '豆包即梦 Seedream 5.0', 'IMAGE', 'Geeknow', 1, 7, 'Geeknow 豆包即梦 Seedream 5.0 图片模型'),
    ('doubao-seedream-4-5-251128', '豆包即梦 Seedream 4.5', 'IMAGE', 'Geeknow', 1, 8, 'Geeknow 豆包即梦 Seedream 4.5 图片模型'),
    ('doubao-seedream-4-0-250828', '豆包即梦 Seedream 4.0', 'IMAGE', 'Geeknow', 1, 9, 'Geeknow 豆包即梦 Seedream 4.0 图片模型'),
    ('grok-4-2-image', 'Grok 4.2 Image', 'IMAGE', 'Geeknow', 1, 10, 'Geeknow Grok 4.2 图片模型')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    type = VALUES(type),
    provider = VALUES(provider),
    enabled = VALUES(enabled),
    sort_order = VALUES(sort_order),
    description = VALUES(description);

INSERT INTO pricing_rules (biz_type, model_code, unit, price, enabled)
VALUES
    ('IMAGE_GENERATION', 'gpt-image-2-pro', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'gemini-2.5-flash-image-preview', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'doubao-seedream-5-0-260128', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'doubao-seedream-4-5-251128', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'doubao-seedream-4-0-250828', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'grok-4-2-image', 'PER_ITEM', 0, 1)
ON DUPLICATE KEY UPDATE
    unit = VALUES(unit),
    price = VALUES(price),
    enabled = VALUES(enabled);
