SET NAMES utf8mb4;

-- 视频生成从 GeekNow 切换到 new-api 渠道的 Grok 视频三模型。
-- 权威契约见《GROK视频三模型统一对接文档》：
--   grok-imagine-video-1.5-preview  图生视频（必须参考图），1-15 秒
--   grok-imagine-1.0-video          文生/图生视频，仅 6 或 10 秒
--   grok-imagine-video-1.5-fast     文生/图生视频，仅 6 或 10 秒

-- 1. 下线所有旧视频模型（GeekNow 渠道）
UPDATE ai_models
SET enabled = 0
WHERE type = 'VIDEO'
  AND code NOT IN (
    'grok-imagine-video-1.5-preview',
    'grok-imagine-1.0-video',
    'grok-imagine-video-1.5-fast'
  );

-- 2. 注册三个新 Grok 视频模型
INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    ('grok-imagine-video-1.5-fast', 'Grok Imagine Video 1.5 Fast', 'VIDEO', 'GrokNewApi', 1, 1, 'Grok 视频生成（fast），时长 6/10 秒'),
    ('grok-imagine-video-1.5-preview', 'Grok Imagine Video 1.5 Preview', 'VIDEO', 'GrokNewApi', 1, 2, 'Grok 图生视频（preview），必须参考图，时长 1-15 秒'),
    ('grok-imagine-1.0-video', 'Grok Imagine 1.0 Video', 'VIDEO', 'GrokNewApi', 1, 3, 'Grok 视频生成（1.0），时长 6/10 秒')
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
    ('VIDEO_GENERATION', 'grok-imagine-video-1.5-fast', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-imagine-video-1.5-preview', 'PER_SECOND', 0, 1),
    ('VIDEO_GENERATION', 'grok-imagine-1.0-video', 'PER_SECOND', 0, 1)
ON DUPLICATE KEY UPDATE
    unit = VALUES(unit),
    price = VALUES(price),
    enabled = VALUES(enabled);

-- 4. 下线旧视频模型的计费规则
UPDATE pricing_rules
SET enabled = 0
WHERE biz_type = 'VIDEO_GENERATION'
  AND model_code NOT IN (
    'grok-imagine-video-1.5-fast',
    'grok-imagine-video-1.5-preview',
    'grok-imagine-1.0-video'
  );
