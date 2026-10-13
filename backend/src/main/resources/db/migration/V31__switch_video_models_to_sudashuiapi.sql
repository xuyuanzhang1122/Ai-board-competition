SET NAMES utf8mb4;

-- V31: 视频生成从字字动画 /v8/videos/generations 切换到 sudashuiapi
-- /v1/video/generations（api.sudashuiapi.com）。sudashuiapi 分辨率由模型名
-- 决定，画幅比例/参考素材通过 metadata.payload 传递，本地异步任务、Rabbit
-- 提交链路和对象存储后处理保持不变。

-- 1. 下线所有旧视频模型（字字动画渠道）
UPDATE ai_models
SET enabled = 0
WHERE type = 'VIDEO'
  AND code NOT IN (
    'sd-2-720p',
    'sd-2-1080p',
    'sd-api-2-720p',
    'sd-api-2-1080p',
    'sd-2-fast-720p',
    'sd-api-2-fast-720p'
  );

-- 2. 注册六个 sudashuiapi Seedance 2.0 视频模型
INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    ('sd-api-2-fast-720p', 'Seedance 2.0 Fast 720p（绕过人脸限制）', 'VIDEO', 'Sudashuiapi', 1, 1, '绕过人脸限制的 fast 档模型 720p'),
    ('sd-api-2-720p', 'Seedance 2.0 720p（绕过人脸限制）', 'VIDEO', 'Sudashuiapi', 1, 2, '绕过人脸限制的标准模型 720p'),
    ('sd-api-2-1080p', 'Seedance 2.0 1080p（绕过人脸限制）', 'VIDEO', 'Sudashuiapi', 1, 3, '绕过人脸限制的标准模型 1080p'),
    ('sd-2-fast-720p', 'Seedance 2.0 Fast 720p', 'VIDEO', 'Sudashuiapi', 1, 4, 'fast 档标准模型 720p'),
    ('sd-2-720p', 'Seedance 2.0 720p', 'VIDEO', 'Sudashuiapi', 1, 5, '标准模型 720p'),
    ('sd-2-1080p', 'Seedance 2.0 1080p', 'VIDEO', 'Sudashuiapi', 1, 6, '标准模型 1080p')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    type = VALUES(type),
    provider = VALUES(provider),
    enabled = VALUES(enabled),
    sort_order = VALUES(sort_order),
    description = VALUES(description);

-- 3. 新模型计费规则（按秒计费，单价沿用当前免费策略）
INSERT INTO pricing_rules (biz_type, model_code, unit, price, enabled)
VALUES
    ('VIDEO_GENERATION', 'sd-api-2-fast-720p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'sd-api-2-720p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'sd-api-2-1080p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'sd-2-fast-720p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'sd-2-720p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'sd-2-1080p', 'PER_SECOND', 0, 1)
ON DUPLICATE KEY UPDATE
    unit = VALUES(unit),
    price = VALUES(price),
    enabled = VALUES(enabled);

-- 4. 下线旧视频模型的计费规则
UPDATE pricing_rules
SET enabled = 0
WHERE biz_type = 'VIDEO_GENERATION'
  AND model_code NOT IN (
    'sd-api-2-fast-720p',
    'sd-api-2-720p',
    'sd-api-2-1080p',
    'sd-2-fast-720p',
    'sd-2-720p',
    'sd-2-1080p'
  );
