SET NAMES utf8mb4;

-- GeekNow 文档是图片/视频模型的唯一权威来源。
-- 该迁移只追加修正，不修改已经执行过的历史迁移。
INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    ('gemini-3-pro-image-preview', 'Gemini 3 Pro Image Preview', 'IMAGE', 'Geeknow', 1, 1, 'GeekNow Gemini 原生图片生成'),
    ('gemini-2.5-flash-image-preview', 'Gemini 2.5 Flash Image Preview', 'IMAGE', 'Geeknow', 1, 2, 'GeekNow Gemini 原生图片生成'),
    ('gemini-3.1-flash-image-preview', 'Gemini 3.1 Flash Image Preview', 'IMAGE', 'Geeknow', 1, 3, 'GeekNow Gemini 原生图片生成'),
    ('gpt-image-2', 'GPT Image 2', 'IMAGE', 'Geeknow', 1, 4, 'GeekNow OpenAI Images 兼容图片生成'),
    ('gpt-image-2-pro', 'GPT Image 2 Pro', 'IMAGE', 'Geeknow', 1, 5, 'GeekNow 高分辨率图片生成'),
    ('gpt-image-2-vip', 'GPT Image 2 VIP', 'IMAGE', 'Geeknow', 1, 6, 'GeekNow VIP 图片生成'),
    ('doubao-seedream-4-0-250828', '豆包 Seedream 4.0', 'IMAGE', 'Geeknow', 1, 7, 'GeekNow 豆包 Seedream 图片生成'),
    ('doubao-seedream-4-5-251128', '豆包 Seedream 4.5', 'IMAGE', 'Geeknow', 1, 8, 'GeekNow 豆包 Seedream 图片生成'),
    ('doubao-seedream-5-0-260128', '豆包 Seedream 5.0', 'IMAGE', 'Geeknow', 1, 9, 'GeekNow 豆包 Seedream 图片生成'),
    ('grok-4-2-image', 'Grok 4.2 Image', 'IMAGE', 'Geeknow', 1, 10, 'GeekNow Grok 图片生成'),
    ('grok-video-1.5', 'Grok Video 1.5', 'VIDEO', 'Geeknow', 1, 1, 'GeekNow Grok 视频生成'),
    ('grok-video-1.5-pro', 'Grok Video 1.5 Pro', 'VIDEO', 'Geeknow', 1, 2, 'GeekNow Grok 视频生成，固定 10 秒'),
    ('grok-video-1.5-max', 'Grok Video 1.5 Max', 'VIDEO', 'Geeknow', 1, 3, 'GeekNow Grok 视频生成，固定 15 秒'),
    ('grok-video-3', 'Grok Video 3', 'VIDEO', 'Geeknow', 1, 4, 'GeekNow Grok 视频生成'),
    ('grok-video-3-pro', 'Grok Video 3 Pro', 'VIDEO', 'Geeknow', 1, 5, 'GeekNow Grok 视频生成，固定 10 秒'),
    ('grok-video-3-max', 'Grok Video 3 Max', 'VIDEO', 'Geeknow', 1, 6, 'GeekNow Grok 视频生成，固定 15 秒'),
    ('grok-imagine-video', 'Grok Imagine Video', 'VIDEO', 'Geeknow', 1, 7, 'GeekNow Grok Imagine JSON 视频生成'),
    ('grok-imagine-video-1.5-preview', 'Grok Imagine Video 1.5 Preview', 'VIDEO', 'Geeknow', 1, 8, 'GeekNow Grok Imagine JSON 视频生成'),
    ('doubao-seedance-1-5-pro_480p', '豆包 Seedance 1.5 Pro 480p', 'VIDEO', 'Geeknow', 1, 9, 'GeekNow Seedance multipart 视频生成'),
    ('doubao-seedance-1-5-pro_720p', '豆包 Seedance 1.5 Pro 720p', 'VIDEO', 'Geeknow', 1, 10, 'GeekNow Seedance multipart 视频生成'),
    ('doubao-seedance-1-5-pro_1080p', '豆包 Seedance 1.5 Pro 1080p', 'VIDEO', 'Geeknow', 1, 11, 'GeekNow Seedance multipart 视频生成')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    type = VALUES(type),
    provider = VALUES(provider),
    enabled = VALUES(enabled),
    sort_order = VALUES(sort_order),
    description = VALUES(description);

-- 旧平台或文档未列出的媒体模型直接下线。
UPDATE ai_models
SET enabled = 0
WHERE type IN ('IMAGE', 'VIDEO')
  AND code NOT IN (
    'gemini-3-pro-image-preview', 'gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image-preview',
    'gpt-image-2', 'gpt-image-2-pro', 'gpt-image-2-vip',
    'doubao-seedream-4-0-250828', 'doubao-seedream-4-5-251128', 'doubao-seedream-5-0-260128',
    'grok-4-2-image',
    'grok-video-1.5', 'grok-video-1.5-pro', 'grok-video-1.5-max',
    'grok-video-3', 'grok-video-3-pro', 'grok-video-3-max',
    'grok-imagine-video', 'grok-imagine-video-1.5-preview',
    'doubao-seedance-1-5-pro_480p', 'doubao-seedance-1-5-pro_720p', 'doubao-seedance-1-5-pro_1080p'
  );

INSERT INTO pricing_rules (biz_type, model_code, unit, price, enabled)
VALUES
    ('IMAGE_GENERATION', 'gemini-3-pro-image-preview', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'gemini-2.5-flash-image-preview', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'gemini-3.1-flash-image-preview', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'gpt-image-2', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'gpt-image-2-pro', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'gpt-image-2-vip', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'doubao-seedream-4-0-250828', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'doubao-seedream-4-5-251128', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'doubao-seedream-5-0-260128', 'PER_ITEM', 0, 1),
    ('IMAGE_GENERATION', 'grok-4-2-image', 'PER_ITEM', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-1.5', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-1.5-pro', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-1.5-max', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-3', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-3-pro', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-video-3-max', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-imagine-video', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-imagine-video-1.5-preview', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'doubao-seedance-1-5-pro_480p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'doubao-seedance-1-5-pro_720p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'doubao-seedance-1-5-pro_1080p', 'PER_SECOND', 0, 1)
ON DUPLICATE KEY UPDATE
    unit = VALUES(unit),
    price = VALUES(price),
    enabled = VALUES(enabled);

UPDATE pricing_rules
SET enabled = 0
WHERE biz_type IN ('IMAGE', 'IMAGE_GENERATION')
  AND model_code NOT IN (
    'gemini-3-pro-image-preview', 'gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image-preview',
    'gpt-image-2', 'gpt-image-2-pro', 'gpt-image-2-vip',
    'doubao-seedream-4-0-250828', 'doubao-seedream-4-5-251128', 'doubao-seedream-5-0-260128',
    'grok-4-2-image'
  );

UPDATE pricing_rules
SET enabled = 0
WHERE biz_type IN ('VIDEO', 'VIDEO_GENERATION')
  AND model_code NOT IN (
    'grok-video-1.5', 'grok-video-1.5-pro', 'grok-video-1.5-max',
    'grok-video-3', 'grok-video-3-pro', 'grok-video-3-max',
    'grok-imagine-video', 'grok-imagine-video-1.5-preview',
    'doubao-seedance-1-5-pro_480p', 'doubao-seedance-1-5-pro_720p', 'doubao-seedance-1-5-pro_1080p'
  );
