SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- Geeknow 文本默认模型修正
-- =========================
-- 背景：真实调用 gemini-3-pro-preview 返回 model_not_found/no available channel。
-- 处理：启用 gemini-3.5-flash，禁用不可用的 Gemini Pro 文本预览模型，并补零价计费规则。

INSERT INTO ai_models (code, name, type, provider, enabled, sort_order, description)
VALUES
    ('gemini-3.5-flash', 'Gemini 3.5 Flash', 'LANGUAGE', 'Geeknow', 1, 1, 'Geeknow Gemini 3.5 Flash 文本生成模型')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    type = VALUES(type),
    provider = VALUES(provider),
    enabled = VALUES(enabled),
    sort_order = VALUES(sort_order),
    description = VALUES(description);

UPDATE ai_models
SET enabled = 0
WHERE code IN ('gemini-3.1-pro-preview', 'gemini-3-pro-preview');

INSERT INTO pricing_rules (biz_type, model_code, unit, price, enabled)
VALUES
    ('TEXT_GENERATION', 'gemini-3.5-flash', 'PER_REQUEST', 0, 1)
ON DUPLICATE KEY UPDATE
    unit = VALUES(unit),
    price = VALUES(price),
    enabled = VALUES(enabled);

SET FOREIGN_KEY_CHECKS = 1;
