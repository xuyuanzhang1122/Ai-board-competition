SET NAMES utf8mb4;

-- V30: 新增 sub2api 渠道 (https://qs.szscp.com/v1, GPT Image 2 上游) 图片模型。
-- 对外展示为 gpt-image-2-4k, 与 GeekNow 已占用的 gpt-image-2 区分; 支持 1-4 张/质量/输出格式/背景。
INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    ('gpt-image-2-4k', 'GPT Image 2 4K', 'IMAGE', 'Sub2Api', 1, 11, 'sub2api渠道 GPT Image 2 4K图片模型,支持1-4张/质量/输出格式/背景')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    type = VALUES(type),
    provider = VALUES(provider),
    enabled = VALUES(enabled),
    sort_order = VALUES(sort_order),
    description = VALUES(description);

INSERT INTO pricing_rules (biz_type, model_code, unit, price, enabled)
VALUES
    ('IMAGE_GENERATION', 'gpt-image-2-4k', 'PER_ITEM', 0, 1)
ON DUPLICATE KEY UPDATE
    unit = VALUES(unit),
    price = VALUES(price),
    enabled = VALUES(enabled);
