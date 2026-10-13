SET NAMES utf8mb4;

-- V29: 视频生成切换到字字动画 /v8/videos/generations 的 Seedance 2.0 480p 模型。
-- 模型页只公开最小 JSON 创建契约与按 task_id 查询契约；本地异步任务、Rabbit
-- 提交链路和对象存储后处理保持不变。

-- 1. 下线所有旧视频模型（GeekNow 渠道）
UPDATE ai_models
SET enabled = 0
WHERE type = 'VIDEO'
  AND code NOT IN (
    'doubao-seedance-2-0-mini-video-480p',
    'doubao-seedance-2-0-fast-video-480p',
    'doubao-seedance-2-video-480p',
    'doubao-seedance-2-480p'
  );

-- 2. 注册四个 Seedance 2.0 视频模型
INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    ('doubao-seedance-2-480p', '豆包 Seedance 2.0 480p', 'VIDEO', 'ZiziDonghua', 1, 1, 'Seedance 2.0 图文参考/首尾帧'),
    ('doubao-seedance-2-0-fast-video-480p', '豆包 Seedance 2.0 Fast Video 480p', 'VIDEO', 'ZiziDonghua', 1, 2, 'Seedance 2.0 Fast 视频参考'),
    ('doubao-seedance-2-0-mini-video-480p', '豆包 Seedance 2.0 Mini Video 480p', 'VIDEO', 'ZiziDonghua', 1, 3, 'Seedance 2.0 Mini 视频参考'),
    ('doubao-seedance-2-video-480p', '豆包 Seedance 2.0 Video 480p', 'VIDEO', 'ZiziDonghua', 1, 4, 'Seedance 2.0 视频参考')
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
    ('VIDEO_GENERATION', 'doubao-seedance-2-480p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'doubao-seedance-2-0-fast-video-480p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'doubao-seedance-2-0-mini-video-480p', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'doubao-seedance-2-video-480p', 'PER_SECOND', 0, 1)
ON DUPLICATE KEY UPDATE
    unit = VALUES(unit),
    price = VALUES(price),
    enabled = VALUES(enabled);

-- 4. 下线旧视频模型的计费规则
UPDATE pricing_rules
SET enabled = 0
WHERE biz_type = 'VIDEO_GENERATION'
  AND model_code NOT IN (
    'doubao-seedance-2-480p',
    'doubao-seedance-2-0-fast-video-480p',
    'doubao-seedance-2-0-mini-video-480p',
    'doubao-seedance-2-video-480p'
  );
