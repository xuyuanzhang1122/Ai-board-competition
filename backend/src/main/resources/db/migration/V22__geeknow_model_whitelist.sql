SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- Geeknow 模型白名单迁移
-- =========================

-- 1) 插入/更新白名单模型（Geeknow provider）
INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    -- 文字模型
    ('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'LANGUAGE', 'Geeknow', 1, 1, 'Geeknow Gemini 3.1 Pro 文本生成模型'),
    ('gemini-3-pro-preview', 'Gemini 3 Pro Preview', 'LANGUAGE', 'Geeknow', 1, 2, 'Geeknow Gemini 3 Pro 文本生成模型'),
    -- 图像模型
    ('gemini-3.1-flash-image-preview', 'Gemini 3.1 Flash Image Preview', 'IMAGE', 'Geeknow', 1, 1, 'Geeknow Gemini 3.1 Flash 图像生成模型'),
    ('gemini-3-pro-image-preview', 'Gemini 3 Pro Image Preview', 'IMAGE', 'Geeknow', 1, 2, 'Geeknow Gemini 3 Pro 图像生成模型'),
    ('gpt-image-2', 'GPT Image 2', 'IMAGE', 'Geeknow', 1, 3, 'Geeknow OpenAI GPT-Image-2 图像生成模型'),
    ('gpt-image-1.5', 'GPT Image 1.5', 'IMAGE', 'Geeknow', 1, 4, 'Geeknow OpenAI GPT-Image-1.5 图像生成模型'),
    -- 视频模型
    ('grok-video-1.5-max', 'Grok Video 1.5 Max', 'VIDEO', 'Geeknow', 1, 1, 'Geeknow Grok Video 1.5 Max 视频生成模型'),
    ('grok-video-1.5-pro', 'Grok Video 1.5 Pro', 'VIDEO', 'Geeknow', 1, 2, 'Geeknow Grok Video 1.5 Pro 视频生成模型'),
    ('grok-video-3-max', 'Grok Video 3 Max', 'VIDEO', 'Geeknow', 1, 3, 'Geeknow Grok Video 3 Max 视频生成模型'),
    ('grok-video-3-pro', 'Grok Video 3 Pro', 'VIDEO', 'Geeknow', 1, 4, 'Geeknow Grok Video 3 Pro 视频生成模型'),
    ('doubao-seedance-1-5-pro_720p', 'Doubao Seedance 1.5 Pro 720p', 'VIDEO', 'Geeknow', 1, 5, 'Geeknow 豆包 Seedance 1.5 Pro 720p 视频生成模型'),
    ('doubao-seedance-1-5-pro_480p', 'Doubao Seedance 1.5 Pro 480p', 'VIDEO', 'Geeknow', 1, 6, 'Geeknow 豆包 Seedance 1.5 Pro 480p 视频生成模型')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    type = VALUES(type),
    provider = VALUES(provider),
    enabled = VALUES(enabled),
    sort_order = VALUES(sort_order),
    description = VALUES(description);

-- 2) 禁用旧 VectorEngine 默认模型（不属于 Geeknow 白名单）
UPDATE ai_models
SET enabled = 0
WHERE code IN ('sora-2', 'gpt-4o', 'gpt-4o-image-vip', 'jimeng-4.5');

-- 3) 为白名单模型补默认计费规则（price=0，避免计费失败）
INSERT INTO pricing_rules (biz_type, model_code, unit, price, enabled)
VALUES
    ('TEXT_GENERATION', 'gemini-3.1-pro-preview', 'PER_REQUEST', 0, 1),
    ('TEXT_GENERATION', 'gemini-3-pro-preview', 'PER_REQUEST', 0, 1),
    ('IMAGE_GENERATION', 'gemini-3.1-flash-image-preview', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'gemini-3-pro-image-preview', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'gpt-image-2', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'gpt-image-1.5', 'PER_ITEM', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-1.5-max', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-1.5-pro', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-3-max', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-3-pro', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'doubao-seedance-1-5-pro_720p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'doubao-seedance-1-5-pro_480p', 'PER_SECOND', 0, 1)
ON DUPLICATE KEY UPDATE
    unit = VALUES(unit),
    price = VALUES(price),
    enabled = VALUES(enabled);

SET FOREIGN_KEY_CHECKS = 1;
